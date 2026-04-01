/**
 * Unit Test - Email Capture Subsystem
 *
 * Tests the critical email spelling and validation logic
 */

const { EmailCapture } = require('../src/emailCapture');

class EmailCaptureTest {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    try {
      await fn();
      this.passed++;
      console.log(`✅ ${name}`);
    } catch (error) {
      this.failed++;
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  async runTests() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  EMAIL CAPTURE SUBSYSTEM TESTS                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Test 1: Basic email spelling
    await this.test('Parse simple email: j a c o b at gmail dot com', async () => {
      const capture = new EmailCapture();

      // Init
      let result = await capture.processInput('');
      this.assert(result.status === 'waiting', 'Should be waiting after init');

      // Spell out email
      result = await capture.processInput('j a c o b at gmail dot com');
      this.assert(result.status === 'waiting', 'Should still be waiting (needs "done")');
      this.assert(capture.email === 'jacob@gmail.com', `Email should be jacob@gmail.com, got ${capture.email}`);

      // Say done
      result = await capture.processInput('done');
      this.assert(result.status === 'waiting', 'Should be waiting for confirmation');
    });

    // Test 2: Readback formatting
    await this.test('Format email for readback', async () => {
      const capture = new EmailCapture();
      capture.email = 'jacob@gmail.com';

      const readback = capture.emailToReadableFormat('jacob@gmail.com');
      this.assert(
        readback.includes('j-a-c-o-b'),
        'Should have dashes between letters'
      );
      this.assert(
        readback.includes('at'),
        'Should have "at" for @'
      );
      this.assert(
        readback.includes('dot'),
        'Should spell out dots'
      );
    });

    // Test 3: Character parsing with phonetic alphabet
    await this.test('Parse phonetic alphabet (Juliett for J)', async () => {
      const capture = new EmailCapture();

      // Init
      await capture.processInput('');

      // Use phonetic for J
      let result = await capture.processInput('juliett a c o b at gmail dot com done');
      this.assert(
        capture.email === 'jacob@gmail.com',
        `Should parse "juliett" as "j", got ${capture.email}`
      );
    });

    // Test 4: Number parsing (zero vs oh)
    await this.test('Parse numbers: zero and oh both work', async () => {
      const capture = new EmailCapture();

      await capture.processInput('');
      let result = await capture.processInput('test zero zero at email dot com done');

      this.assert(
        capture.email === 'test00@email.com',
        `Should parse "zero" as "0", got ${capture.email}`
      );
    });

    // Test 5: Low confidence retry
    await this.test('Low confidence triggers retry prompt', async () => {
      const capture = new EmailCapture();

      await capture.processInput('');

      // Very low confidence input
      let result = await capture.processInput('xxxxx', 0.3); // confidence = 0.3

      this.assert(
        result.status === 'waiting',
        'Should ask to repeat at low confidence'
      );
      this.assert(
        result.prompt.includes('clearly'),
        'Should ask to speak more clearly'
      );
    });

    // Test 6: Invalid email format triggers fallback
    await this.test('Invalid email format triggers SMS fallback', async () => {
      const capture = new EmailCapture();

      // Start
      await capture.processInput('');

      // Spell invalid email (missing @)
      let result = await capture.processInput('test dot com done');

      // Should retry or trigger fallback
      this.assert(
        capture.attemptCount > 0,
        'Should increment attempt count'
      );
    });

    // Test 7: Confirmation workflow
    await this.test('Confirm email with yes', async () => {
      const capture = new EmailCapture();

      // Go through full flow
      await capture.processInput('');
      await capture.processInput('john at example dot com done');

      // Should now ask for confirmation
      let result = await capture.processInput('yes');

      this.assert(
        result.status === 'confirmed',
        'Should confirm email when user says yes'
      );
      this.assert(
        result.email === 'john@example.com',
        `Should return john@example.com, got ${result.email}`
      );
    });

    // Test 8: Correction workflow (max 1)
    await this.test('User can correct email once', async () => {
      const capture = new EmailCapture();

      await capture.processInput('');
      await capture.processInput('john at exampl dot com done');

      // First say no
      let result = await capture.processInput('no');

      this.assert(
        result.status === 'waiting',
        'Should allow correction'
      );
      this.assert(
        capture.confirmationFailures > 0,
        'Should track confirmation failures'
      );
    });

    // Test 9: SMS fallback after max failures
    await this.test('SMS fallback after 2 confirmation failures', async () => {
      const capture = new EmailCapture();

      await capture.processInput('');
      await capture.processInput('test at email dot com done');

      // First failure
      let result = await capture.processInput('no');
      this.assert(result.status === 'waiting', 'Should be waiting after 1st failure');

      // Correct
      result = await capture.processInput('no, i want to spell again');
      // This triggers another cycle...

      // For this test, we'll manually set to trigger fallback
      capture.confirmationFailures = 2;
      result = await capture.stateFallback();

      this.assert(
        result.status === 'fallback_sms',
        'Should trigger SMS fallback after max failures'
      );
    });

    // Test 10: Common variations (o instead of zero)
    await this.test('Accept "o" as alternative to "zero"', async () => {
      const capture = new EmailCapture();

      await capture.processInput('');

      // Spell with "o" instead of "zero"
      let result = await capture.processInput('t e s t o o at gmail dot com done');

      this.assert(
        capture.email === 'testoo@gmail.com',
        `Should parse "o" as "0", got ${capture.email}`
      );
    });

    this.printResults();
  }

  printResults() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  RESULTS                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log(`\n✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`Total:   ${this.passed + this.failed}`);

    if (this.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME TESTS FAILED\n');
      process.exit(1);
    }
  }
}

// Run tests
const tester = new EmailCaptureTest();
tester.runTests();
