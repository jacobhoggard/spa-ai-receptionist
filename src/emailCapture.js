/**
 * Email Capture Subsystem
 *
 * Handles letter-by-letter email spelling with validation, readback, and SMS fallback.
 * This is a CRITICAL subsystem for data quality.
 *
 * Flow:
 * 1. Instruction phase
 * 2. Spelling mode (character-by-character)
 * 3. Validation (@ and domain check)
 * 4. Readback confirmation
 * 5. Correction loop (max 1)
 * 6. SMS fallback if fails
 */

const CHARACTER_MAP = {
  // Numbers
  '0': ['zero', 'o', 'oh'],
  '1': ['one'],
  '2': ['two', 'to'],
  '3': ['three', 'tree'],
  '4': ['four', 'for'],
  '5': ['five'],
  '6': ['six'],
  '7': ['seven'],
  '8': ['eight'],
  '9': ['nine'],

  // Common confusions
  '@': ['at', 'at sign'],
  '.': ['dot', 'period', 'full stop'],
  '_': ['underscore', 'under'],
  '-': ['dash', 'hyphen', 'minus'],

  // Phonetic alphabet (helps with disambiguation)
  'a': ['a', 'alpha'],
  'b': ['b', 'bravo', 'bee'],
  'c': ['c', 'charlie'],
  'd': ['d', 'delta', 'dee'],
  'e': ['e', 'echo'],
  'f': ['f', 'foxtrot'],
  'g': ['g', 'golf'],
  'h': ['h', 'hotel'],
  'i': ['i', 'india'],
  'j': ['j', 'juliett'],
  'k': ['k', 'kilo'],
  'l': ['l', 'lima'],
  'm': ['m', 'mike', 'november'],
  'n': ['n', 'november'],
  'o': ['o', 'oscar'],
  'p': ['p', 'papa'],
  'q': ['q', 'quebec'],
  'r': ['r', 'romeo'],
  's': ['s', 'sierra'],
  't': ['t', 'tango'],
  'u': ['u', 'uniform'],
  'v': ['v', 'victor'],
  'w': ['w', 'whiskey'],
  'x': ['x', 'xray'],
  'y': ['y', 'yankee'],
  'z': ['z', 'zulu']
};

const STATES = {
  INIT: 'init',
  LISTENING: 'listening',
  VALIDATE: 'validate',
  READBACK: 'readback',
  CONFIRMATION: 'confirmation',
  CORRECTION: 'correction',
  FALLBACK: 'fallback',
  CONFIRMED: 'confirmed'
};

class EmailCapture {
  constructor() {
    this.state = STATES.INIT;
    this.email = '';
    this.attemptCount = 0;
    this.confirmationFailures = 0;
    this.charBuffer = [];
  }

  /**
   * Main entry point: process user speech during email capture
   * @param {string} userSpeech - Raw spoken text
   * @param {number} confidence - ASR confidence 0-1
   * @returns {Promise<Object>}
   */
  async processInput(userSpeech, confidence = 0.85) {
    if (this.state === STATES.INIT) {
      return this.stateInit();
    }

    if (this.state === STATES.LISTENING) {
      return this.stateListening(userSpeech, confidence);
    }

    if (this.state === STATES.VALIDATE) {
      return this.stateValidate();
    }

    if (this.state === STATES.READBACK) {
      return this.stateReadback(userSpeech, confidence);
    }

    if (this.state === STATES.CONFIRMATION) {
      return this.stateConfirmation(userSpeech, confidence);
    }

    if (this.state === STATES.CORRECTION) {
      return this.stateCorrection(userSpeech, confidence);
    }

    if (this.state === STATES.FALLBACK) {
      return this.stateFallback();
    }

    throw new Error(`Unknown email capture state: ${this.state}`);
  }

  stateInit() {
    this.state = STATES.LISTENING;
    this.email = '';
    this.charBuffer = [];
    this.attemptCount++;

    return {
      status: 'waiting',
      prompt: 'Ready. Please spell it out, letter by letter. You can say dot, underscore, at, etc.',
      state: this.state
    };
  }

  stateListening(userSpeech, confidence) {
    if (confidence < 0.5) {
      // Very low confidence - ask to repeat
      return {
        status: 'waiting',
        prompt: "I didn't catch that clearly. Could you say that letter again?",
        state: STATES.LISTENING
      };
    }

    // Parse the spoken characters
    const chars = this.parseSpokenCharacters(userSpeech);

    if (chars.length === 0) {
      return {
        status: 'waiting',
        prompt: "I didn't understand that. Please say the next letter.",
        state: STATES.LISTENING
      };
    }

    // Add to email buffer
    this.charBuffer.push(...chars);
    this.email = this.charBuffer.join('');

    // Detect end of email (user says "done" or long pause)
    if (userSpeech.toLowerCase().includes('done') ||
        userSpeech.toLowerCase().includes('finished') ||
        userSpeech.toLowerCase().includes('that is it')) {
      this.state = STATES.VALIDATE;
      return this.stateValidate();
    }

    // Continue listening (prompt for more)
    const currentSoFar = this.charBuffer.map((c, i) => {
      if (i < 5) return c;
      return '*'; // Hide middle chars for brevity
    }).join('');

    return {
      status: 'waiting',
      prompt: `Got it. So far: ${currentSoFar}. Next letter?`,
      state: STATES.LISTENING
    };
  }

  stateValidate() {
    // Check email format
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(this.email)) {
      // Invalid format - retry
      if (this.attemptCount >= 2) {
        // After 2 attempts, trigger SMS fallback
        this.state = STATES.FALLBACK;
        return this.stateFallback();
      }

      // Retry
      this.state = STATES.INIT;
      return this.stateInit();
    }

    // Format valid - move to readback
    this.state = STATES.READBACK;
    return this.stateReadback();
  }

  stateReadback() {
    // Convert email to readable format: j-a-c-o-b at gmail dot com
    const readback = this.emailToReadableFormat(this.email);

    return {
      status: 'waiting',
      prompt: `Just to confirm: ${readback}. Is that correct?`,
      state: STATES.CONFIRMATION
    };
  }

  stateConfirmation(userSpeech, confidence) {
    const speech = userSpeech.toLowerCase();

    if (speech.includes('yes') ||
        speech.includes('correct') ||
        speech.includes('that is right')) {
      // Confirmed!
      this.state = STATES.CONFIRMED;
      return {
        status: 'confirmed',
        email: this.email,
        state: STATES.CONFIRMED
      };
    } else if (speech.includes('no') ||
               speech.includes('wrong') ||
               speech.includes('incorrect')) {
      // User wants to correct
      this.confirmationFailures++;

      if (this.confirmationFailures >= 2) {
        // After 2 failed confirmations, offer SMS fallback
        this.state = STATES.FALLBACK;
        return this.stateFallback();
      }

      this.state = STATES.CORRECTION;
      return this.stateCorrection();
    }

    // Unclear response - ask again
    return {
      status: 'waiting',
      prompt: 'Is that correct? Say yes or no.',
      state: STATES.CONFIRMATION
    };
  }

  stateCorrection(userSpeech, confidence) {
    // User wants to change something
    // Examples: "change the last letter", "add a dash", "remove underscore"

    const speech = userSpeech.toLowerCase();

    // Simple pattern matching for common corrections
    if (speech.includes('change') || speech.includes('replace')) {
      // Extract what to change (simplified)
      // Real version would use NLP here

      // For now, ask user to spell again
      this.state = STATES.INIT;
      return this.stateInit();
    }

    if (speech.includes('add')) {
      // Add character - need to know which one
      return {
        status: 'waiting',
        prompt: 'What character should I add, and where?',
        state: STATES.CORRECTION
      };
    }

    // Default: restart email capture
    this.state = STATES.INIT;
    return this.stateInit();
  }

  stateFallback() {
    return {
      status: 'fallback_sms',
      email: null,
      state: STATES.FALLBACK,
      message: "No problem. I'll send you a text to get your email."
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  parseSpokenCharacters(speech) {
    const lower = speech.toLowerCase();
    const chars = [];

    // Split by spaces and hyphens to get individual "words"
    const tokens = lower.split(/[\s\-]+/);

    for (const token of tokens) {
      // Check if it's a special character (at, dot, etc.)
      if (CHARACTER_MAP[token]) {
        chars.push(token);
        continue;
      }

      // Check if it maps to a character
      let found = false;
      for (const [char, aliases] of Object.entries(CHARACTER_MAP)) {
        if (aliases.includes(token)) {
          chars.push(char);
          found = true;
          break;
        }
      }

      if (!found && token.length === 1) {
        // Single character - accept as-is
        chars.push(token);
      }
    }

    return chars;
  }

  emailToReadableFormat(email) {
    // Convert: jacob@gmail.com → j-a-c-o-b at gmail dot com

    const parts = email.split('@');
    const username = parts[0];
    const domain = parts[1];

    // Username letters separated by hyphens
    const usernameParts = username.split('').join('-');

    // Domain with dots spelled out
    const domainParts = domain
      .split('.')
      .join(' dot ');

    return `${usernameParts} at ${domainParts}`;
  }
}

module.exports = { EmailCapture, STATES };
