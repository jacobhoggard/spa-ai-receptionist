require('dotenv').config();

const express = require('express');
const http = require('http');

const { ConversationEngine } = require('./src/conversationEngine');
const { loadBusinessConfig, getTenantIdFromPhone } = require('./src/config');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());

const callSessions = new Map();

// Helper functions
async function handleInboundCall(phoneNumber) {
  const tenantId = getTenantIdFromPhone(phoneNumber);
  const config = loadBusinessConfig(tenantId);

  const engine = new ConversationEngine(config, {
    call_sid: 'call_' + Date.now(),
    phone_from: '+64 27 123 4567',
    phone_to: phoneNumber
  });

  return engine;
}

async function processTurn(engine, userSpeech, confidence = 0.85) {
  const response = await engine.processInput(userSpeech, confidence);
  return response;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeCalls: callSessions.size });
});

// Twilio Voice Webhook - Main entry point for incoming calls
app.post('/api/voice/inbound', async (req, res) => {
  const callSid = req.body.CallSid;
  const toNumber = req.body.To;
  const fromNumber = req.body.From;

  console.log(`\n📞 [Incoming Call] ${fromNumber} → ${toNumber} (${callSid})`);

  try {
    // Get the business config based on incoming phone number
    const tenantId = getTenantIdFromPhone(toNumber);
    const config = loadBusinessConfig(tenantId);

    // Create conversation engine for this call
    const engine = new ConversationEngine(config, {
      call_sid: callSid,
      phone_from: fromNumber,
      phone_to: toNumber
    });

    // Store engine in session
    callSessions.set(callSid, {
      engine,
      createdAt: Date.now(),
      fromNumber,
      toNumber
    });

    // Get initial greeting
    const response = await engine.processInput(undefined);

    // Generate TwiML response (Twilio's XML format for voice)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    action="/api/voice/callback?CallSid=${callSid}"
    method="POST"
    timeout="8"
    speech-timeout="auto">
    <Say voice="woman">${escapeXml(response.text)}</Say>
  </Gather>
  <Say>I didn't catch that. Please try again.</Say>
  <Redirect>/api/voice/inbound</Redirect>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    console.error('Error handling inbound call:', error);

    // Send error response as TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman">Sorry, there was a system error. Please try again later.</Say>
  <Hangup/>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  }
});

// Twilio Voice Callback - Handles user input during call
app.post('/api/voice/callback', async (req, res) => {
  const callSid = req.query.CallSid;
  const speechResult = req.body.SpeechResult;

  console.log(`\n🎤 [Input] ${callSid}: "${speechResult}"`);

  try {
    // Get the conversation engine for this call
    const session = callSessions.get(callSid);

    if (!session) {
      throw new Error(`Session not found for call ${callSid}`);
    }

    const { engine } = session;
    const confidence = parseFloat(req.body.Confidence) || 0.85;

    // Process the user input
    const response = await engine.processInput(speechResult, confidence);

    console.log(`\n✉️  [Response] ${callSid}: "${response.text}"`);

    // Generate TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    action="/api/voice/callback?CallSid=${callSid}"
    method="POST"
    timeout="8"
    speech-timeout="auto">
    <Say voice="woman">${escapeXml(response.text)}</Say>
  </Gather>
  <Say>I didn't catch that. Please try again.</Say>
  <Redirect>/api/voice/callback?CallSid=${callSid}</Redirect>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    console.error('Error in voice callback:', error);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman">Sorry, there was an error. Goodbye.</Say>
  <Hangup/>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  }
});

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

// Test endpoint - simulate a booking call
app.post('/api/test/call', async (req, res) => {
  console.log('\n🧪 [Test Call] Starting...\n');

  try {
    const engine = await handleInboundCall('+643000000');

    console.log(`Business: ${engine.businessConfig.business_name}\n`);

    // Simulate a booking conversation
    const steps = [
      'I want to book a massage',
      'Relaxation Massage',
      'John Doe',
      '0271234567',
      'j o h n at gmail dot com',
      'yes',
      'tomorrow at 2 PM',
      'yes'
    ];

    const results = [];

    for (const step of steps) {
      const response = await processTurn(engine, step, 0.90);

      results.push({
        userInput: step,
        aiResponse: response.text,
        state: response.nextState
      });

      console.log(`USER: "${step}"`);
      console.log(`AI: "${response.text}"\n`);

      if (response.nextState === 'CALL_END') {
        break;
      }
    }

    res.json({
      success: true,
      business: engine.businessConfig.business_name,
      steps: results.length,
      capturedData: engine.capturedData
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Start server
server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  AI RECEPTIONIST SERVER RUNNING                   ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`✅ Server listening on port ${PORT}\n`);
  console.log('📋 Test the system:\n');
  console.log(`   curl -X POST http://localhost:${PORT}/api/test/call\n`);
  console.log('or open in browser:\n');
  console.log(`   http://localhost:${PORT}/health\n`);
});
