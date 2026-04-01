/**
 * Conversation Engine - Core State Machine for AI Receptionist
 *
 * Manages the entire call flow:
 * - INIT → intent classification → flow-specific states → CALL_END/ESCALATE
 *
 * This is the "brain" that orchestrates all tool calls, captures data,
 * and decides when to escalate.
 */

const { executeToolAction } = require('./tools');
const { EmailCapture } = require('./emailCapture');

const STATES = {
  INIT: 'INIT',
  LISTENING: 'LISTENING',
  CLASSIFY_INTENT: 'CLASSIFY_INTENT',

  // Booking flow
  BOOKING_FLOW: 'BOOKING_FLOW',
  GET_SERVICE: 'GET_SERVICE',
  GET_NAME: 'GET_NAME',
  GET_PHONE: 'GET_PHONE',
  GET_EMAIL: 'GET_EMAIL',
  EMAIL_CAPTURE: 'EMAIL_CAPTURE',
  EMAIL_CONFIRMATION: 'EMAIL_CONFIRMATION',
  EMAIL_FALLBACK: 'EMAIL_FALLBACK',
  GET_DATE_TIME: 'GET_DATE_TIME',
  CHECK_AVAILABILITY: 'CHECK_AVAILABILITY',
  OFFER_ALTERNATIVES: 'OFFER_ALTERNATIVES',
  CONFIRM_BOOKING: 'CONFIRM_BOOKING',
  CREATE_BOOKING: 'CREATE_BOOKING',
  SEND_CONFIRMATION: 'SEND_CONFIRMATION',

  // Reschedule flow
  RESCHEDULE_FLOW: 'RESCHEDULE_FLOW',
  GET_PHONE_FOR_LOOKUP: 'GET_PHONE_FOR_LOOKUP',
  GET_NEW_DATETIME: 'GET_NEW_DATETIME',
  RESCHEDULE_CONFIRMATION: 'RESCHEDULE_CONFIRMATION',

  // Cancel flow
  CANCEL_FLOW: 'CANCEL_FLOW',
  GET_PHONE_FOR_CANCEL: 'GET_PHONE_FOR_CANCEL',
  CONFIRM_CANCEL: 'CONFIRM_CANCEL',
  PROCESS_CANCELLATION: 'PROCESS_CANCELLATION',

  // End states
  CALL_END: 'CALL_END',
  ESCALATE: 'ESCALATE',
  ESCALATED: 'ESCALATED'
};

const INTENTS = {
  BOOK: 'book',
  RESCHEDULE: 'reschedule',
  CANCEL: 'cancel',
  QUESTION: 'question',
  UNCLEAR: 'unclear'
};

class ConversationEngine {
  constructor(businessConfig, callContext = {}) {
    this.businessConfig = businessConfig;
    this.callContext = callContext; // { call_sid, phone_from, phone_to }

    // Session state (persists during call)
    this.state = STATES.INIT;
    this.capturedData = {
      name: null,
      phone: null,
      email: null,
      service: null,
      service_id: null,
      requested_datetime: null,
      confirmed_datetime: null,
      intent: null,
      appointment_id: null // For reschedule/cancel
    };

    // Conversation history
    this.turns = [];
    this.errorCount = 0;
    this.maxErrors = 3;

    // Email capture subsystem
    this.emailCapture = new EmailCapture();

    // Metrics
    this.startTime = Date.now();
  }

  /**
   * Main entry point: process user input and return AI response
   * @param {string} userSpeech - Raw speech from user
   * @param {number} confidence - ASR confidence 0-1
   * @param {boolean} interrupted - True if user barged in
   * @returns {Promise<Object>} - AI response with action, text, next state, etc.
   */
  async processInput(userSpeech, confidence = 0.85, interrupted = false) {
    // Log turn
    this.turns.push({
      state: this.state,
      userInput: userSpeech,
      confidence,
      interrupted,
      timestamp: Date.now()
    });

    try {
      // Route to state handler
      const handler = this.getStateHandler(this.state);
      const response = await handler.call(this, userSpeech, confidence);

      return {
        success: true,
        action: response.action, // 'speak', 'transfer', 'end'
        text: response.text,
        nextState: response.nextState,
        capturedData: this.capturedData,
        toolsToCall: response.toolsToCall || [],
        shouldEscalate: response.shouldEscalate || false,
        escalationReason: response.escalationReason || null
      };
    } catch (error) {
      console.error(`Error in state ${this.state}:`, error);
      this.errorCount++;

      if (this.errorCount >= this.maxErrors) {
        return this.createEscalationResponse(
          'max_errors',
          `System error after ${this.errorCount} attempts`
        );
      }

      return {
        success: false,
        action: 'speak',
        text: "I'm having trouble. Let me connect you with someone.",
        nextState: STATES.ESCALATE,
        shouldEscalate: true,
        escalationReason: 'internal_error'
      };
    }
  }

  // ============================================================================
  // STATE HANDLERS
  // ============================================================================

  async stateInit(userSpeech, confidence) {
    // First input - greeting already sent, now waiting for intent
    this.state = STATES.LISTENING;

    return {
      action: 'speak',
      text: this.businessConfig.greeting_message ||
            "Hi! I can help you book an appointment, reschedule, or answer questions.",
      nextState: STATES.LISTENING
    };
  }

  async stateListening(userSpeech, confidence) {
    if (confidence < 0.6) {
      return {
        action: 'speak',
        text: "I didn't quite catch that. Could you repeat?",
        nextState: STATES.LISTENING
      };
    }

    this.state = STATES.CLASSIFY_INTENT;
    return this.stateClassifyIntent(userSpeech, confidence);
  }

  async stateClassifyIntent(userSpeech, confidence) {
    // Simple keyword-based intent detection
    const speech = userSpeech.toLowerCase();

    let intent = INTENTS.UNCLEAR;
    if (speech.includes('book') || speech.includes('appointment')) {
      intent = INTENTS.BOOK;
    } else if (speech.includes('reschedule') || speech.includes('change')) {
      intent = INTENTS.RESCHEDULE;
    } else if (speech.includes('cancel')) {
      intent = INTENTS.CANCEL;
    } else if (speech.includes('question') || speech.includes('how') || speech.includes('when')) {
      intent = INTENTS.QUESTION;
    }

    // Low confidence on intent
    if (confidence < 0.7 && intent === INTENTS.UNCLEAR) {
      return this.createEscalationResponse(
        'unclear_intent',
        "I couldn't understand what you need. Let me connect you with someone."
      );
    }

    this.capturedData.intent = intent;

    // Route to appropriate flow
    switch (intent) {
      case INTENTS.BOOK:
        this.state = STATES.GET_SERVICE;
        return this.stateGetService();

      case INTENTS.RESCHEDULE:
        this.state = STATES.GET_PHONE_FOR_LOOKUP;
        return this.stateGetPhoneForLookup();

      case INTENTS.CANCEL:
        this.state = STATES.GET_PHONE_FOR_CANCEL;
        return this.stateGetPhoneForCancel();

      case INTENTS.QUESTION:
        return this.createEscalationResponse(
          'question_asked',
          "Let me connect you with someone who can answer that."
        );

      default:
        return this.createEscalationResponse(
          'unclear_intent',
          "I want to make sure I help you correctly. Let me get someone."
        );
    }
  }

  // ============================================================================
  // BOOKING FLOW
  // ============================================================================

  async stateGetService(userSpeech, confidence) {
    if (userSpeech === undefined) {
      // Initial prompt
      return {
        action: 'speak',
        text: `Which service would you like to book? We offer: ${this.getServiceNames()}`,
        nextState: STATES.GET_SERVICE
      };
    }

    // Try to match service
    const matched = this.matchService(userSpeech);

    if (!matched) {
      return this.createEscalationResponse(
        'service_not_matched',
        `I couldn't find "${userSpeech}" in our services. Let me connect you.`
      );
    }

    this.capturedData.service = matched.name;
    this.capturedData.service_id = matched.id;
    this.state = STATES.GET_NAME;

    return {
      action: 'speak',
      text: `Great! ${matched.name}. What's your name?`,
      nextState: STATES.GET_NAME
    };
  }

  async stateGetName(userSpeech, confidence) {
    if (userSpeech === undefined) {
      return {
        action: 'speak',
        text: "What's your name, please?",
        nextState: STATES.GET_NAME
      };
    }

    this.capturedData.name = userSpeech;
    this.state = STATES.GET_PHONE;

    return {
      action: 'speak',
      text: `Nice to meet you, ${userSpeech}. What's your phone number?`,
      nextState: STATES.GET_PHONE
    };
  }

  async stateGetPhone(userSpeech, confidence) {
    if (userSpeech === undefined) {
      return {
        action: 'speak',
        text: "What's your phone number? Please include the area code.",
        nextState: STATES.GET_PHONE
      };
    }

    // Validate phone format (basic)
    const phoneClean = userSpeech.replace(/\D/g, '');
    if (phoneClean.length < 9) {
      return {
        action: 'speak',
        text: "That doesn't look like a complete number. Please try again.",
        nextState: STATES.GET_PHONE
      };
    }

    // Store with + prefix
    this.capturedData.phone = `+64${phoneClean.slice(-9)}`;
    this.state = STATES.GET_EMAIL;

    return {
      action: 'speak',
      text: `Perfect. Now I need your email address. Please spell it out letter by letter, slowly.`,
      nextState: STATES.EMAIL_CAPTURE,
      toolsToCall: [
        {
          tool: 'enter_email_capture',
          mode: 'start'
        }
      ]
    };
  }

  async stateEmailCapture(userSpeech, confidence) {
    // Delegate to email capture subsystem
    const result = await this.emailCapture.processInput(userSpeech, confidence);

    if (result.status === 'confirmed') {
      this.capturedData.email = result.email;
      this.state = STATES.GET_DATE_TIME;

      return {
        action: 'speak',
        text: `Perfect! Now, what date and time would you like to book?`,
        nextState: STATES.GET_DATE_TIME
      };
    } else if (result.status === 'fallback_sms') {
      this.capturedData.email = null;
      this.capturedData.email_capture_status = 'sms_fallback';
      this.state = STATES.GET_DATE_TIME;

      return {
        action: 'speak',
        text: `No problem. I'll send you a text to get your email. For now, what date and time works for you?`,
        nextState: STATES.GET_DATE_TIME,
        toolsToCall: [
          {
            tool: 'send_sms',
            to: this.capturedData.phone,
            message: `Hi ${this.capturedData.name}! Please reply with your email address so we can confirm your booking.`,
            template: 'email_fallback'
          }
        ]
      };
    } else if (result.status === 'waiting') {
      // Still in email capture
      return {
        action: 'speak',
        text: result.prompt,
        nextState: STATES.EMAIL_CAPTURE
      };
    } else {
      // Error or max retries
      return this.createEscalationResponse(
        'email_capture_failed',
        "Let me connect you with someone to get your email details."
      );
    }
  }

  async stateGetDateTime(userSpeech, confidence) {
    if (userSpeech === undefined) {
      return {
        action: 'speak',
        text: "What date and time would you like? For example, 'tomorrow at 2pm' or 'next Tuesday at 10am'",
        nextState: STATES.GET_DATE_TIME
      };
    }

    // Parse datetime (simplified - real version would use NLP)
    const parsed = this.parseDateTime(userSpeech);

    if (!parsed) {
      return {
        action: 'speak',
        text: "I didn't understand that date. Please try again, like 'tomorrow at 2pm'",
        nextState: STATES.GET_DATE_TIME
      };
    }

    this.capturedData.requested_datetime = parsed;
    this.state = STATES.CHECK_AVAILABILITY;

    return this.stateCheckAvailability();
  }

  async stateCheckAvailability(userSpeech, confidence) {
    // Call tool to check availability
    const result = await executeToolAction('check_availability', {
      service_id: this.capturedData.service_id,
      requested_datetime: this.capturedData.requested_datetime
    });

    if (!result.success) {
      if (result.error === 'api_error') {
        return this.createEscalationResponse(
          'cliniko_api_error',
          "I'm having trouble checking availability. Let me get someone to help."
        );
      }

      // No availability
      if (result.alternatives && result.alternatives.length > 0) {
        this.state = STATES.OFFER_ALTERNATIVES;
        const slots = result.alternatives.slice(0, 3).map(s => s.displayTime).join(', ');
        return {
          action: 'speak',
          text: `Unfortunately, that time isn't available. How about ${slots}?`,
          nextState: STATES.OFFER_ALTERNATIVES
        };
      }

      return this.createEscalationResponse(
        'no_availability',
        "I'm not finding availability. Let me connect you so we can find a time."
      );
    }

    // Availability confirmed
    this.capturedData.confirmed_datetime = result.slot;
    this.state = STATES.CONFIRM_BOOKING;

    return {
      action: 'speak',
      text: `Great! I can book you for ${this.capturedData.service} on ${result.slot.displayTime} with ${result.slot.practitioner}. Is that correct?`,
      nextState: STATES.CONFIRM_BOOKING
    };
  }

  async stateOfferAlternatives(userSpeech, confidence) {
    // User selecting from offered slots (simplified - real version more complex)
    // For now, take the first offered slot
    this.capturedData.confirmed_datetime = this.capturedData.alternatives[0];
    this.state = STATES.CONFIRM_BOOKING;

    return {
      action: 'speak',
      text: `Perfect! Booking confirmed for ${this.capturedData.service}. Let me create that for you now.`,
      nextState: STATES.CREATE_BOOKING
    };
  }

  async stateConfirmBooking(userSpeech, confidence) {
    const speech = userSpeech.toLowerCase();

    if (speech.includes('yes') || speech.includes('correct')) {
      this.state = STATES.CREATE_BOOKING;
      return this.stateCreateBooking();
    } else if (speech.includes('no')) {
      this.state = STATES.GET_DATE_TIME;
      return {
        action: 'speak',
        text: "No problem. Let's try a different time. What works better?",
        nextState: STATES.GET_DATE_TIME
      };
    }

    return {
      action: 'speak',
      text: "Is that correct? Say yes or no.",
      nextState: STATES.CONFIRM_BOOKING
    };
  }

  async stateCreateBooking(userSpeech, confidence) {
    // Call tool to create booking
    const result = await executeToolAction('create_booking', {
      service_id: this.capturedData.service_id,
      appointment_datetime: this.capturedData.confirmed_datetime,
      customer_name: this.capturedData.name,
      customer_phone: this.capturedData.phone,
      customer_email: this.capturedData.email
    });

    if (!result.success) {
      if (result.error === 'slot_taken') {
        // Slot taken - offer alternatives
        this.state = STATES.GET_DATE_TIME;
        return {
          action: 'speak',
          text: "That slot was just taken. Let's find another time. What else works for you?",
          nextState: STATES.GET_DATE_TIME
        };
      }

      return this.createEscalationResponse(
        'booking_creation_failed',
        "I couldn't create the booking. Let me connect you with someone."
      );
    }

    this.capturedData.appointment_id = result.appointment_id;
    this.state = STATES.SEND_CONFIRMATION;

    return this.stateSendConfirmation();
  }

  async stateSendConfirmation(userSpeech, confidence) {
    // Send SMS confirmation
    const smsResult = await executeToolAction('send_sms', {
      to: this.capturedData.phone,
      message: `Booking confirmed: ${this.capturedData.service} on ${this.capturedData.confirmed_datetime.displayTime}. Thanks!`,
      template: 'booking_confirmation'
    });

    // Send email if captured
    if (this.capturedData.email) {
      await executeToolAction('send_email', {
        to: this.capturedData.email,
        service: this.capturedData.service,
        appointment_datetime: this.capturedData.confirmed_datetime,
        customer_name: this.capturedData.name
      });
    }

    this.state = STATES.CALL_END;

    return {
      action: 'speak',
      text: `Perfect! You're all booked. You'll get a text${this.capturedData.email ? ' and email' : ''} confirmation. Thanks!`,
      nextState: STATES.CALL_END
    };
  }

  // ============================================================================
  // RESCHEDULE & CANCEL FLOWS (abbreviated for token efficiency)
  // ============================================================================

  async stateGetPhoneForLookup(userSpeech, confidence) {
    if (userSpeech === undefined) {
      return {
        action: 'speak',
        text: "What's the phone number on your booking?",
        nextState: STATES.GET_PHONE_FOR_LOOKUP
      };
    }

    const phoneClean = userSpeech.replace(/\D/g, '');
    const phone = `+64${phoneClean.slice(-9)}`;

    const result = await executeToolAction('lookup_booking_by_phone', {
      phone_number: phone
    });

    if (!result.found) {
      return this.createEscalationResponse(
        'booking_not_found',
        "I couldn't find a booking with that number. Let me get someone to help."
      );
    }

    this.capturedData.appointment_id = result.appointment.id;
    this.capturedData.phone = phone;
    this.state = STATES.GET_NEW_DATETIME;

    return {
      action: 'speak',
      text: `I found your booking for ${result.appointment.service} on ${result.appointment.displayTime}. When would you like to reschedule to?`,
      nextState: STATES.GET_NEW_DATETIME
    };
  }

  async stateGetNewDatetime(userSpeech, confidence) {
    const parsed = this.parseDateTime(userSpeech);

    if (!parsed) {
      return {
        action: 'speak',
        text: "I didn't understand that date. Please try again.",
        nextState: STATES.GET_NEW_DATETIME
      };
    }

    this.capturedData.requested_datetime = parsed;

    const result = await executeToolAction('check_availability', {
      service_id: this.capturedData.service_id,
      requested_datetime: parsed
    });

    if (!result.success) {
      return {
        action: 'speak',
        text: "That time isn't available. What else works for you?",
        nextState: STATES.GET_NEW_DATETIME
      };
    }

    this.capturedData.confirmed_datetime = result.slot;
    this.state = STATES.RESCHEDULE_CONFIRMATION;

    return {
      action: 'speak',
      text: `I can move you to ${result.slot.displayTime}. Is that OK?`,
      nextState: STATES.RESCHEDULE_CONFIRMATION
    };
  }

  async stateGetPhoneForCancel(userSpeech, confidence) {
    if (userSpeech === undefined) {
      return {
        action: 'speak',
        text: "What's the phone number on your booking?",
        nextState: STATES.GET_PHONE_FOR_CANCEL
      };
    }

    const phoneClean = userSpeech.replace(/\D/g, '');
    const phone = `+64${phoneClean.slice(-9)}`;

    const result = await executeToolAction('lookup_booking_by_phone', {
      phone_number: phone
    });

    if (!result.found) {
      return this.createEscalationResponse(
        'booking_not_found',
        "I couldn't find that booking."
      );
    }

    this.capturedData.appointment_id = result.appointment.id;
    this.capturedData.phone = phone;
    this.state = STATES.CONFIRM_CANCEL;

    return {
      action: 'speak',
      text: `I found your booking for ${result.appointment.service} on ${result.appointment.displayTime}. Do you want to cancel?`,
      nextState: STATES.CONFIRM_CANCEL
    };
  }

  async stateConfirmCancel(userSpeech, confidence) {
    const speech = userSpeech.toLowerCase();

    if (speech.includes('yes')) {
      this.state = STATES.PROCESS_CANCELLATION;
      return this.stateProcessCancellation();
    }

    return {
      action: 'speak',
      text: "No problem. Anything else I can help with?",
      nextState: STATES.LISTENING
    };
  }

  async stateProcessCancellation(userSpeech, confidence) {
    const result = await executeToolAction('cancel_booking', {
      appointment_id: this.capturedData.appointment_id
    });

    if (!result.success) {
      return this.createEscalationResponse(
        'cancellation_failed',
        "I couldn't cancel that booking. Let me get someone."
      );
    }

    this.state = STATES.CALL_END;

    return {
      action: 'speak',
      text: `Your booking has been cancelled. ${result.message || 'Thanks!'}`,
      nextState: STATES.CALL_END
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  getStateHandler(state) {
    const handlers = {
      [STATES.INIT]: this.stateInit,
      [STATES.LISTENING]: this.stateListening,
      [STATES.CLASSIFY_INTENT]: this.stateClassifyIntent,
      [STATES.GET_SERVICE]: this.stateGetService,
      [STATES.GET_NAME]: this.stateGetName,
      [STATES.GET_PHONE]: this.stateGetPhone,
      [STATES.EMAIL_CAPTURE]: this.stateEmailCapture,
      [STATES.GET_DATE_TIME]: this.stateGetDateTime,
      [STATES.CHECK_AVAILABILITY]: this.stateCheckAvailability,
      [STATES.OFFER_ALTERNATIVES]: this.stateOfferAlternatives,
      [STATES.CONFIRM_BOOKING]: this.stateConfirmBooking,
      [STATES.CREATE_BOOKING]: this.stateCreateBooking,
      [STATES.SEND_CONFIRMATION]: this.stateSendConfirmation,
      [STATES.GET_PHONE_FOR_LOOKUP]: this.stateGetPhoneForLookup,
      [STATES.GET_NEW_DATETIME]: this.stateGetNewDatetime,
      [STATES.GET_PHONE_FOR_CANCEL]: this.stateGetPhoneForCancel,
      [STATES.CONFIRM_CANCEL]: this.stateConfirmCancel,
      [STATES.PROCESS_CANCELLATION]: this.stateProcessCancellation
    };

    return handlers[state] || (() => {
      throw new Error(`No handler for state ${state}`);
    });
  }

  matchService(speech) {
    const services = this.businessConfig.services || [];
    const lower = speech.toLowerCase();

    for (const service of services) {
      if (lower.includes(service.name.toLowerCase()) ||
          lower.includes(service.id)) {
        return service;
      }
    }

    return null;
  }

  getServiceNames() {
    return (this.businessConfig.services || [])
      .map(s => s.name)
      .join(', ');
  }

  parseDateTime(speech) {
    // Simplified date parser (real version would be much more sophisticated)
    // For MVP, just return a mock datetime object

    if (speech.toLowerCase().includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      return {
        isoString: tomorrow.toISOString(),
        displayTime: `tomorrow at ${tomorrow.getHours()}:00`,
        practitioner: 'available staff'
      };
    }

    // For now, default to tomorrow 2pm
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    return {
      isoString: tomorrow.toISOString(),
      displayTime: `tomorrow at 2:00 PM`,
      practitioner: 'available staff'
    };
  }

  createEscalationResponse(reason, message) {
    this.state = STATES.ESCALATE;

    return {
      action: 'transfer',
      text: message,
      nextState: STATES.ESCALATED,
      shouldEscalate: true,
      escalationReason: reason,
      escalationContext: {
        callContext: this.callContext,
        capturedData: this.capturedData,
        reason,
        conversationHistory: this.turns
      }
    };
  }
}

module.exports = { ConversationEngine, STATES, INTENTS };
