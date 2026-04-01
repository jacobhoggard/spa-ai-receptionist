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

// Test endpoint - simulate a booking call
app.post('/api/test/call', async (req, res) => {
  console.log('\n🧪 [Test Call] Starting...\n');

  try {
    const engine = await handleInboundCall('+6491234567');

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
