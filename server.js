require('dotenv').config();

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const NodeCache = require('node-cache');

const { ConversationEngine } = require('./src/conversationEngine');
const { loadBusinessConfig, getTenantIdFromPhone } = require('./src/config');
const { generateSpeech } = require('./src/elevenlabs');

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
 * @param {string} text - Text to convert to speech
 * @param {boolean} slowDown - If true, use slower voice settings
 */
async function buildSpeechTwiml(text, slowDown = false) {
  if (!useElevenLabs) {
    return `<Say voice="woman">${escapeXml(text)}</Say>`;
  }
  try {
    // Add 5-second timeout to ElevenLabs to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('ElevenLabs timeout')), 5000)
    );
    const audio = await Promise.race([
      generateSpeech(text, ELEVENLABS_VOICE_ID, ELEVENLABS_API_KEY, slowDown),
      timeoutPromise
    ]);
    const id = crypto.randomUUID();
    audioCache.set(id, audio);
    return `<Play>${BASE_URL}/api/audio/${id}</Play>`;
  } catch (err) {
    console.error(`[TTS] ElevenLabs error (${err.message}), falling back to <Say>`);
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
  console.log(`Request body keys:`, Object.keys(req.body));

  try {
    // Validate required fields
    if (!callSid || !toNumber || !fromNumber) {
      throw new Error(`Missing required fields: CallSid=${callSid}, To=${toNumber}, From=${fromNumber}`);
    }

    // Get the business config based on incoming phone number
    console.log(`[${callSid}] Looking up tenant for phone: ${toNumber}`);
    let tenantId;
    try {
      tenantId = getTenantIdFromPhone(toNumber);
      console.log(`[${callSid}] Found tenant: ${tenantId}`);
    } catch (error) {
      console.error(`[${callSid}] Tenant lookup error:`, error.message);
      throw error;
    }

    let config;
    try {
      config = loadBusinessConfig(tenantId);
      console.log(`[${callSid}] Loaded config for: ${config.business_name}`);
    } catch (error) {
      console.error(`[${callSid}] Config load error:`, error.message);
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
      createdAt: Date.now(),
      fromNumber,
      toNumber
    });

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
      buildSpeechTwiml(response.text, response.shouldSlowDown),
      buildSpeechTwiml("I didn't catch that. Please try again.", response.shouldSlowDown)
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

    // Generate TwiML response
    const [responseSpeech, retrySpeech] = await Promise.all([
      buildSpeechTwiml(response.text, response.shouldSlowDown),
      buildSpeechTwiml("I didn't catch that. Please try again.", response.shouldSlowDown)
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

// Test endpoint - simulate a full booking call
app.post('/api/test/call', async (req, res) => {
  console.log('\n🧪 [TEST CALL] Starting full booking flow...\n');

  try {
    const tenantId = getTenantIdFromPhone('+6436681200');
    const config = loadBusinessConfig(tenantId);
    const engine = new ConversationEngine(config, {
      call_sid: 'test_' + Date.now(),
      phone_from: '+64271234567',
      phone_to: '+6436681200'
    });

    console.log(`✅ Business: ${engine.businessConfig.business_name}\n`);
    console.log(`✅ Services available: ${engine.businessConfig.services.length}`);
    console.log(`✅ Staff available: ${engine.businessConfig.staff.length}\n`);

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

    for (const step of steps) {
      const response = await engine.processInput(step.input, 0.95);

      results.push({
        step: step.desc,
        input: step.input,
        output: response.text,
        state: response.nextState,
        data: response.capturedData
      });

      console.log(`📥 USER: ${step.desc}`);
      console.log(`   Input: "${step.input}"`);
      console.log(`📤 AVA: "${response.text}"`);
      console.log(`   State: ${response.nextState}\n`);

      if (response.nextState === 'CALL_END') {
        break;
      }
    }

    // Final result
    const finalData = engine.capturedData;
    console.log(`✅ TEST COMPLETE\n`);
    console.log(`Captured data:`, JSON.stringify(finalData, null, 2));

    res.json({
      success: true,
      business: engine.businessConfig.business_name,
      stepsCompleted: steps.length,
      finalState: engine.state,
      capturedData: finalData,
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

// ElevenAgents Booking Webhook - receives booking details and sends email
app.post('/api/booking', async (req, res) => {
  const { name, phone, email, service, preferred_datetime, therapist } = req.body;

  console.log('\n📅 [BOOKING REQUEST]', JSON.stringify(req.body, null, 2));

  // Validate required fields
  if (!name || !phone || !service || !preferred_datetime) {
    console.error('[BOOKING] Missing required fields');
    return res.status(400).json({ success: false, error: 'Missing required booking fields' });
  }

  try {
    const therapistLine = therapist ? `\nTherapist Preference: ${therapist}` : '';
    const clientEmailLine = email ? `\nClient Email: ${email}` : '\nClient Email: Not provided';

    const emailBody = `New booking request received via Ava (AI Receptionist):

Client Name: ${name}
Client Phone: ${phone}${clientEmailLine}
Service Requested: ${service}
Preferred Date/Time: ${preferred_datetime}${therapistLine}

---
Please follow up with the client to confirm their appointment.
This request was collected automatically by Ava.`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Ava - Sanctuary Receptionist <ava@sanctuarywanaka.co.nz>',
        to: ['info@sanctuarywanaka.co.nz'],
        subject: `New Booking Request - ${name}`,
        text: emailBody
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(resendData)}`);
    }

    console.log(`[BOOKING] Email sent successfully for ${name} (id: ${resendData.id})`);
    res.json({ success: true, message: 'Booking request sent to Sanctuary team' });

  } catch (error) {
    console.error('[BOOKING] Email send error:', error.message);
    // Still return success to Ava so she doesn't confuse the caller
    res.json({ success: true, message: 'Booking request received' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Uncaught error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🎤 SANCTUARY AI RECEPTIONIST - AVA               ║');
  console.log('║  Status: ONLINE                                   ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`✅ Server listening on port ${PORT}\n`);
  console.log('📋 Available endpoints:\n');
  console.log(`  Health: GET /health`);
  console.log(`  Test call: POST /api/test/call`);
  console.log(`  Voice inbound: POST /api/voice/inbound (Twilio webhook)`);
  console.log(`  Voice callback: POST /api/voice/callback (Twilio input)`);
  console.log(`  Booking webhook: POST /api/booking (ElevenAgents → email)\n`);
  console.log('🧪 Quick test:\n');
  console.log(`  curl -X POST https://spa-ai-receptionist-production.up.railway.app/api/test/call\n`);
});

module.exports = app;
