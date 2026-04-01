/**
 * Integration Test - End-to-End Call Flow
 *
 * Simulates a real booking call from start to finish
 * Tests the conversation engine, tools, email capture, and escalation
 */

const { ConversationEngine, STATES } = require('../src/conversationEngine');
const { loadBusinessConfig } = require('../src/config');

class TestSimulator {
  constructor(businessConfig) {
    this.engine = new ConversationEngine(businessConfig, {
      call_sid: 'test_call_001',
      phone_from: '+64 27 123 4567',
      phone_to: '+64 9 123 4567'
    });

    this.responses = [];
    this.totalInteractions = 0;
  }

  async sendInput(userSpeech, confidence = 0.85) {
    this.totalInteractions++;

    console.log(`\n[Turn ${this.totalInteractions}]`);
    console.log(`USER: "${userSpeech}"`);

    const response = await this.engine.processInput(userSpeech, confidence);

    console.log(`STATE: ${response.nextState}`);
    console.log(`AI: "${response.text}"`);

    if (response.shouldEscalate) {
      console.log(`⚠️  ESCALATION: ${response.escalationReason}`);
    }

    this.responses.push({
      turn: this.totalInteractions,
      userInput: userSpeech,
      aiResponse: response.text,
      state: response.nextState,
      captured: { ...response.capturedData }
    });

    return response;
  }

  async runBookingFlow() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  TEST 1: HAPPY PATH - BOOKING FLOW                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Initial greeting
    let response = await this.sendInput('');
    if (response.nextState !== STATES.LISTENING) {
      console.log('❌ FAIL: Should be in LISTENING state');
      return false;
    }

    // User says they want to book
    response = await this.sendInput('I want to book a massage');
    if (response.nextState !== STATES.GET_SERVICE) {
      console.log('❌ FAIL: Should be in GET_SERVICE state');
      return false;
    }

    // User selects service
    response = await this.sendInput('Relaxation Massage');
    if (response.nextState !== STATES.GET_NAME) {
      console.log('❌ FAIL: Should be in GET_NAME state');
      return false;
    }

    // User provides name
    response = await this.sendInput('John Doe');
    if (response.nextState !== STATES.GET_PHONE) {
      console.log('❌ FAIL: Should be in GET_PHONE state');
      return false;
    }

    // User provides phone
    response = await this.sendInput('0271234567');
    if (response.nextState !== STATES.EMAIL_CAPTURE) {
      console.log('❌ FAIL: Should be in EMAIL_CAPTURE state');
      return false;
    }

    console.log('\n--- EMAIL CAPTURE SUBSYSTEM ---');

    // Start email capture
    response = await this.sendInput('');
    if (response.nextState !== STATES.EMAIL_CAPTURE) {
      console.log('❌ FAIL: Email capture not initialized');
      return false;
    }

    // User spells email
    response = await this.sendInput('j a c o b at gmail dot com');
    console.log(`EMAIL STATUS: ${response.capturedData.email || 'pending'}`);

    // If email not confirmed yet, simulate confirmation
    if (response.nextState === STATES.EMAIL_CAPTURE) {
      response = await this.sendInput('yes');
    }

    if (response.nextState !== STATES.GET_DATE_TIME) {
      console.log('❌ FAIL: Should be in GET_DATE_TIME state after email');
      return false;
    }

    console.log('\n--- DATETIME & AVAILABILITY CHECK ---');

    // User provides date/time
    response = await this.sendInput('tomorrow at 2 PM');
    if (response.nextState !== STATES.CONFIRM_BOOKING) {
      console.log('❌ FAIL: Should be in CONFIRM_BOOKING state');
      return false;
    }

    // User confirms booking
    response = await this.sendInput('yes that is correct');
    if (response.nextState !== STATES.CREATE_BOOKING) {
      console.log('❌ FAIL: Should be in CREATE_BOOKING state');
      return false;
    }

    // Booking created
    response = await this.sendInput('');
    if (response.nextState !== STATES.CALL_END) {
      console.log('❌ FAIL: Should be in CALL_END state');
      return false;
    }

    console.log('\n✅ TEST 1 PASSED: Full booking flow completed');
    console.log(`   Total interactions: ${this.totalInteractions}`);
    console.log(`   Captured data:`, response.capturedData);

    return true;
  }

  async runEscalationFlow() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  TEST 2: ERROR HANDLING - ESCALATION                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Reset engine for new call
    this.engine = new ConversationEngine(this.engine.businessConfig, {
      call_sid: 'test_call_002',
      phone_from: '+64 27 999 8888',
      phone_to: '+64 9 123 4567'
    });
    this.totalInteractions = 0;

    // Initial greeting
    let response = await this.sendInput('');

    // User asks for something outside scope
    response = await this.sendInput('Can you tell me about your pricing?');

    if (!response.shouldEscalate) {
      console.log('❌ FAIL: Should escalate for questions');
      return false;
    }

    console.log(`✅ TEST 2 PASSED: Escalation triggered correctly`);
    console.log(`   Reason: ${response.escalationReason}`);
    console.log(`   Context:`, response.escalationContext);

    return true;
  }

  async runRescheduleFlow() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  TEST 3: RESCHEDULE FLOW                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Reset engine
    this.engine = new ConversationEngine(this.engine.businessConfig, {
      call_sid: 'test_call_003',
      phone_from: '+64 27 123 4567',
      phone_to: '+64 9 123 4567'
    });
    this.totalInteractions = 0;

    // Initial greeting
    let response = await this.sendInput('');

    // User wants to reschedule
    response = await this.sendInput('I need to reschedule my appointment');
    if (response.nextState !== STATES.GET_PHONE_FOR_LOOKUP) {
      console.log('❌ FAIL: Should be in GET_PHONE_FOR_LOOKUP state');
      return false;
    }

    // User provides phone for lookup (matches mock data)
    response = await this.sendInput('+64 27 123 4567');
    if (response.nextState !== STATES.GET_NEW_DATETIME) {
      console.log('❌ FAIL: Should be in GET_NEW_DATETIME state');
      return false;
    }

    // User provides new datetime
    response = await this.sendInput('Monday at 10 AM');
    if (response.nextState !== STATES.RESCHEDULE_CONFIRMATION) {
      console.log('❌ FAIL: Should be in RESCHEDULE_CONFIRMATION state');
      return false;
    }

    console.log(`✅ TEST 3 PASSED: Reschedule flow working`);

    return true;
  }

  printSummary() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  TEST SUMMARY                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log(`Total interactions: ${this.totalInteractions}`);
    console.log(`Call state history:`);

    const stateHistory = this.responses.map(r => r.state);
    const uniqueStates = [...new Set(stateHistory)];

    uniqueStates.forEach(state => {
      console.log(`  - ${state}`);
    });
  }
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function runAllTests() {
  try {
    // Load business config
    const config = loadBusinessConfig('spa_001');

    console.log(`\n🚀 Starting integration tests for: ${config.business_name}\n`);

    const simulator = new TestSimulator(config);

    // Test 1: Happy path booking
    const test1Passed = await simulator.runBookingFlow();

    // Test 2: Escalation
    const test2Passed = await simulator.runEscalationFlow();

    // Test 3: Reschedule
    const test3Passed = await simulator.runRescheduleFlow();

    // Summary
    simulator.printSummary();

    const allPassed = test1Passed && test2Passed && test3Passed;

    if (allPassed) {
      console.log('\n✅ ALL TESTS PASSED\n');
      process.exit(0);
    } else {
      console.log('\n❌ SOME TESTS FAILED\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    process.exit(1);
  }
}

runAllTests();
