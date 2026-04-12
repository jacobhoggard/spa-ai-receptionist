require('dotenv').config();

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const NodeCache = require('node-cache');

const { ConversationEngine } = require('./src/conversationEngine');
const { generateSpeech } = require('./src/elevenlabs');

// Database models
const Business = require('./src/models/Business');
const CallLog = require('./src/models/CallLog');
const Lead = require('./src/models/Lead');
const { sendBookingNotifications, initializeTwilioClient, sendPostCallSummary } = require('./src/notifications');
const { testConnection: testDbConnection } = require('./src/db');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const useElevenLabs = !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID);

// Cache audio buffers for 5 minutes — long enough for Twilio to fetch them
const audioCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware for parsing request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const callSessions = new Map();

// Helper function to escape XML special characters
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Serve cached ElevenLabs audio to Twilio
app.get('/api/audio/:id', (req, res) => {
  const audio = audioCache.get(req.params.id);
  if (!audio) {
    return res.status(404).send('Audio not found');
  }
  res.set('Content-Type', 'audio/mpeg');
  res.send(audio);
});

/**
 * Generates speech via ElevenLabs, caches it, and returns a <Play> URL.
 * Falls back to <Say> if ElevenLabs is not configured.
 */
async function buildSpeechTwiml(text) {
  if (!useElevenLabs) {
    return `<Say voice="woman">${escapeXml(text)}</Say>`;
  }
  try {
    const audio = await generateSpeech(text, ELEVENLABS_VOICE_ID, ELEVENLABS_API_KEY);
    const id = crypto.randomUUID();
    audioCache.set(id, audio);
    return `<Play>${BASE_URL}/api/audio/${id}</Play>`;
  } catch (err) {
    console.error('ElevenLabs TTS error, falling back to <Say>:', err.message);
    return `<Say voice="woman">${escapeXml(text)}</Say>`;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeCalls: callSessions.size, timestamp: new Date().toISOString() });
});

// Twilio Voice Webhook - Main entry point for incoming calls
app.post('/api/voice/inbound', async (req, res) => {
  const callSid = req.body.CallSid;
  const toNumber = req.body.To;
  const fromNumber = req.body.From;

  console.log(`\n📞 [INBOUND CALL] ${fromNumber} → ${toNumber} (SID: ${callSid})`);

  try {
    // Validate required fields
    if (!callSid || !toNumber || !fromNumber) {
      throw new Error(`Missing required fields: CallSid=${callSid}, To=${toNumber}, From=${fromNumber}`);
    }

    // GET BUSINESS BY AI PHONE NUMBER FROM DATABASE
    console.log(`[${callSid}] Looking up business for phone: ${toNumber}`);
    let business, config;
    try {
      business = await Business.getBusinessByAiPhone(toNumber);
      console.log(`[${callSid}] Found business: ${business.business_name}`);

      // Parse config from database
      config = business.config;
      if (typeof config === 'string') {
        config = JSON.parse(config);
      }
    } catch (error) {
      console.error(`[${callSid}] Business lookup error:`, error.message);
      throw error;
    }

    // Create conversation engine for this call
    let engine;
    try {
      engine = new ConversationEngine(config, {
        call_sid: callSid,
        phone_from: fromNumber,
        phone_to: toNumber
      });
      console.log(`[${callSid}] ConversationEngine created successfully`);
    } catch (error) {
      console.error(`[${callSid}] ConversationEngine creation error:`, error.message);
      throw error;
    }

    // Store engine in session
    callSessions.set(callSid, {
      engine,
      businessId: business.id,
      businessName: business.business_name,
      createdAt: Date.now(),
      fromNumber,
      toNumber,
      transcript: []
    });

    // CREATE CALL LOG IN DATABASE
    try {
      const callLog = await CallLog.createCallLog(
        business.id,
        callSid,
        fromNumber,
        toNumber
      );
      console.log(`[${callSid}] Call log created: ${callLog.id}`);

      // Store call log ID in session (for later reference)
      callSessions.get(callSid).callLogId = callLog.id;
    } catch (error) {
      console.error(`[${callSid}] Failed to create call log:`, error.message);
      // Don't fail the call just because DB failed
    }

    // Get initial greeting
    let response;
    try {
      response = await engine.processInput(undefined);
      console.log(`[${callSid}] Initial greeting: "${response.text}"`);
    } catch (error) {
      console.error(`[${callSid}] processInput error:`, error.message, error.stack);
      throw error;
    }

    // Generate TwiML response
    const [greetingSpeech, retrySpeech] = await Promise.all([
      buildSpeechTwiml(response.text),
      buildSpeechTwiml("I didn't catch that. Please try again.")
    ]);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    input="speech"
    action="/api/voice/callback?CallSid=${escapeXml(callSid)}"
    method="POST"
    timeout="20"
    speech-timeout="3"
    language="en-NZ">
    ${greetingSpeech}
  </Gather>
  ${retrySpeech}
  <Redirect>/api/voice/callback?CallSid=${escapeXml(callSid)}</Redirect>
</Response>`;

    console.log(`[${callSid}] Sending TwiML response`);
    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    console.error(`\n❌ [INBOUND ERROR] ${callSid}:`, error.message);
    console.error(error.stack);

    const errorSpeech = await buildSpeechTwiml('Sorry, there was a system error. Please try again later.');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${errorSpeech}
  <Hangup/>
</Response>`;

    res.type('text/xml');
    res.status(500).send(twiml);
  }
});

// Twilio Voice Callback - Handles user input during call
app.post('/api/voice/callback', async (req, res) => {
  const callSid = req.query.CallSid;
  const speechResult = req.body.SpeechResult;
  const confidence = parseFloat(req.body.Confidence) || 0.85;

  console.log(`\n🎤 [VOICE INPUT] ${callSid}: "${speechResult}" (confidence: ${confidence.toFixed(2)})`);

  try {
    // Get the conversation engine for this call
    const session = callSessions.get(callSid);

    if (!session) {
      throw new Error(`Session not found for call ${callSid}`);
    }

    const { engine } = session;

    // Process the user input
    let response;
    try {
      response = await engine.processInput(speechResult, confidence);
      console.log(`[${callSid}] Response: "${response.text}" (next state: ${response.nextState})`);
    } catch (error) {
      console.error(`[${callSid}] processInput error:`, error.message);
      throw error;
    }

    // STORE TRANSCRIPT IN SESSION
    if (session && session.transcript) {
      session.transcript.push({
        role: 'user',
        text: speechResult,
        confidence: confidence,
        timestamp: new Date()
      });
      session.transcript.push({
        role: 'assistant',
        text: response.text,
        state: response.nextState,
        timestamp: new Date()
      });
    }

    // Generate TwiML response
    const [responseSpeech, retrySpeech] = await Promise.all([
      buildSpeechTwiml(response.text),
      buildSpeechTwiml("I didn't catch that. Please try again.")
    ]);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    input="speech"
    action="/api/voice/callback?CallSid=${escapeXml(callSid)}"
    method="POST"
    timeout="20"
    speech-timeout="3"
    language="en-NZ">
    ${responseSpeech}
  </Gather>
  ${retrySpeech}
  <Redirect>/api/voice/callback?CallSid=${escapeXml(callSid)}</Redirect>
</Response>`;

    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    console.error(`\n❌ [CALLBACK ERROR] ${callSid}:`, error.message);
    console.error(error.stack);

    const errorSpeech = await buildSpeechTwiml('Sorry, there was an error. Goodbye.');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${errorSpeech}
  <Hangup/>
</Response>`;

    res.type('text/xml');
    res.status(500).send(twiml);
  }
});

/**
 * Twilio Voice Hangup Webhook - Called when call ends
 * Saves call data to database and sends notifications
 */
app.post('/api/voice/hangup', async (req, res) => {
  const callSid = req.query.CallSid || req.body.CallSid;
  const callDuration = req.body.CallDuration || 0;
  const recordingUrl = req.body.RecordingUrl;

  console.log(`\n📞 [HANGUP] Call ${callSid} ended (duration: ${callDuration}s)`);

  try {
    // Get session data
    const session = callSessions.get(callSid);
    if (!session) {
      console.warn(`⚠️  No session found for hangup: ${callSid}`);
      return res.json({ success: true });
    }

    const { businessId, callLogId, engine } = session;

    // Convert transcript array to string
    let transcript = session.transcript
      ? session.transcript
          .map(t => `[${t.role.toUpperCase()}] ${t.text}`)
          .join('\n')
      : engine.conversationHistory || '';

    // END CALL LOG IN DATABASE
    try {
      await CallLog.endCallLog(callSid, parseInt(callDuration), transcript, recordingUrl);
      console.log(`✅ Call log ended: ${callSid}`);
    } catch (error) {
      console.error(`❌ Failed to end call log: ${error.message}`);
    }

    // SAVE LEAD IF DATA WAS CAPTURED
    const capturedData = engine.capturedData;
    if (capturedData && (capturedData.name || capturedData.phone)) {
      try {
        await Lead.createLead(
          businessId,
          callLogId,
          capturedData.phone,
          capturedData.email,
          capturedData.name,
          capturedData.service,
          capturedData.preferred_datetime
        );
        console.log(`✅ Lead saved: ${capturedData.name}`);
      } catch (error) {
        console.error(`❌ Failed to save lead: ${error.message}`);
      }
    }

    // SEND NOTIFICATIONS TO BUSINESS OWNER
    if (capturedData && capturedData.name) {
      try {
        await sendBookingNotifications(businessId, callLogId, {
          name: capturedData.name,
          phone: capturedData.phone,
          email: capturedData.email,
          service: capturedData.service,
          preferred_datetime: capturedData.preferred_datetime
        });
        console.log(`✅ Notifications sent for: ${capturedData.name}`);
      } catch (error) {
        console.error(`⚠️  Failed to send notifications: ${error.message}`);
        // Don't fail - notifications can be resent
      }
    }

    // Clean up session
    callSessions.delete(callSid);
    console.log(`🧹 Session cleaned up: ${callSid}\n`);

    res.json({ success: true });

  } catch (error) {
    console.error(`\n❌ [HANGUP ERROR] ${callSid}:`, error.message);
    console.error(error.stack);

    // Always return success to Twilio
    res.json({ success: true });
  }
});

// Test endpoint - simulate a full booking call with database persistence
app.post('/api/test/call', async (req, res) => {
  console.log('\n🧪 [TEST CALL] Starting full booking flow...\n');

  try {
    // Use Sanctuary test business from database
    const business = await Business.getBusinessByTenantId('spa_001');
    if (!business) {
      throw new Error('Test business (spa_001) not found in database. Run: psql receptionist_dev < db/schema.sql');
    }

    let config = business.config;
    if (typeof config === 'string') {
      config = JSON.parse(config);
    }

    const callSid = 'test_' + Date.now();
    const engine = new ConversationEngine(config, {
      call_sid: callSid,
      phone_from: '+64271234567',
      phone_to: business.ai_phone_number
    });

    console.log(`✅ Business: ${business.business_name}\n`);
    console.log(`✅ AI Phone Number: ${business.ai_phone_number}`);
    console.log(`✅ Services: ${config.services ? config.services.length : 'N/A'}\n`);

    // Simulate a booking conversation
    const steps = [
      { input: 'book a massage', desc: 'Request massage' },
      { input: 'Relaxation 90 minutes', desc: 'Select service' },
      { input: 'John Smith', desc: 'Provide name' },
      { input: '0271234567', desc: 'Provide phone' },
      { input: 'j o h n at email dot com', desc: 'Spell email' },
      { input: 'tomorrow at 2pm', desc: 'Request date/time' },
      { input: 'yes', desc: 'Confirm booking' }
    ];

    const results = [];
    const transcript = [];

    for (const step of steps) {
      const response = await engine.processInput(step.input, 0.95);

      results.push({
        step: step.desc,
        input: step.input,
        output: response.text,
        state: response.nextState
      });

      transcript.push(`[USER] ${step.input}`);
      transcript.push(`[AVA] ${response.text}`);

      console.log(`📥 USER: ${step.desc}`);
      console.log(`   Input: "${step.input}"`);
      console.log(`📤 AVA: "${response.text}"`);
      console.log(`   State: ${response.nextState}\n`);

      if (response.nextState === 'CALL_END') {
        break;
      }
    }

    const finalData = engine.capturedData;
    console.log(`✅ CONVERSATION COMPLETE\n`);

    // SAVE TO DATABASE (simulate hangup)
    console.log(`💾 Saving to database...\n`);

    // Create call log
    const callLog = await CallLog.createCallLog(
      business.id,
      callSid,
      '+64271234567',
      business.ai_phone_number
    );

    // End call log
    await CallLog.endCallLog(
      callSid,
      120,
      transcript.join('\n'),
      null
    );

    // Save lead if captured
    let leadId = null;
    if (finalData && finalData.name) {
      const lead = await Lead.createLead(
        business.id,
        callLog.id,
        finalData.phone,
        finalData.email,
        finalData.name,
        finalData.service,
        finalData.preferred_datetime
      );
      leadId = lead.id;
    }

    // Send notifications
    if (finalData && finalData.name) {
      await sendBookingNotifications(business.id, callLog.id, {
        name: finalData.name,
        phone: finalData.phone,
        email: finalData.email,
        service: finalData.service,
        preferred_datetime: finalData.preferred_datetime
      });
    }

    console.log(`✅ DATABASE OPERATIONS COMPLETE\n`);
    console.log(`Captured data:`, JSON.stringify(finalData, null, 2));

    res.json({
      success: true,
      business: business.business_name,
      stepsCompleted: results.length,
      finalState: engine.state,
      capturedData: finalData,
      databaseResults: {
        callLogId: callLog.id,
        leadId: leadId
      },
      results
    });

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ElevenAgents Booking Webhook - receives booking details and sends WhatsApp
app.post('/api/booking', async (req, res) => {
  const { name, phone, email, service, preferred_datetime, therapist } = req.body;

  console.log('\n📅 [BOOKING REQUEST]', JSON.stringify(req.body, null, 2));

  // Validate required fields
  if (!name || !phone || !service || !preferred_datetime) {
    console.error('[BOOKING] Missing required fields');
    return res.status(400).json({ success: false, error: 'Missing required booking fields' });
  }

  try {
    const { sendBookingWhatsApp } = require('./src/notifications');
    await sendBookingWhatsApp(null, null, { name, phone, email, service, preferred_datetime, therapist });

    console.log(`[BOOKING] WhatsApp sent for ${name}`);
    res.json({ success: true, message: 'Booking request sent to Sanctuary team' });

  } catch (error) {
    console.error('[BOOKING] WhatsApp send error:', error.message);
    // Still return success to Ava so she doesn't confuse the caller
    res.json({ success: true, message: 'Booking request received' });
  }
});

// ElevenLabs Post-Call Webhook - called when a call ends, sends WhatsApp summary
app.post('/api/elevenlabs/webhook', async (req, res) => {
  // Respond immediately so ElevenLabs doesn't timeout or disable the webhook
  res.json({ received: true });

  const { type, data } = req.body || {};
  if (type !== 'post_call_transcription') return;

  const conversationId = data?.conversation_id || 'unknown';
  const summary = data?.analysis?.transcript_summary || '';
  const duration = data?.metadata?.call_duration_secs || 0;
  const dataCollection = data?.analysis?.data_collection_results || {};

  console.log(`\n📞 [POST-CALL WEBHOOK] Conversation: ${conversationId}, Duration: ${duration}s`);

  try {
    await sendPostCallSummary(conversationId, summary, duration, dataCollection);
  } catch (error) {
    console.error('[POST-CALL WEBHOOK] Error:', error.message);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Uncaught error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
server.listen(PORT, async () => {
  // Test database connection (non-fatal — WhatsApp notifications work without DB)
  console.log('\n🔌 Testing database connection...');
  const dbConnected = await testDbConnection();
  if (!dbConnected) {
    console.warn('⚠️  Database not connected. Call logging disabled, WhatsApp notifications still active.');
  }

  // Initialize Twilio WhatsApp client
  console.log('📱 Initializing WhatsApp notifications...');
  initializeTwilioClient();

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🎤 AI RECEPTIONIST - PHASE 1 (Database)          ║');
  console.log('║  Status: ONLINE                                   ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`✅ Server listening on port ${PORT}\n`);
  console.log('📋 Available endpoints:\n');
  console.log(`  Health: GET /health`);
  console.log(`  Test call: POST /api/test/call`);
  console.log(`  Voice inbound: POST /api/voice/inbound (Twilio webhook)`);
  console.log(`  Voice callback: POST /api/voice/callback (Twilio input)`);
  console.log(`  Voice hangup: POST /api/voice/hangup (Twilio hangup)`);
  console.log(`  Booking webhook: POST /api/booking (WhatsApp notifications)\n`);
  console.log('🧪 Quick test:\n');
  console.log(`  curl -X POST http://localhost:${PORT}/api/test/call\n`);
  console.log('✨ Phase 1 complete - Ready for calls!\n');
});

module.exports = app;
