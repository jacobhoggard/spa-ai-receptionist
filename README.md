# AI Phone Receptionist for NZ Day Spas & Clinics

**Production-Ready Conversation Engine for Inbound Booking Calls**

## What This Is

A complete conversation state machine that handles:
- **Inbound call routing & greeting**
- **Intent classification** (book, reschedule, cancel, question)
- **Service booking** with date/time selection
- **Email capture** (letter-by-letter spelling with SMS fallback)
- **Rescheduling & cancellations**
- **Human escalation** with full context
- **Multi-tenant configuration** (no hardcoding per business)

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Running Tests

```bash
# Test email capture subsystem
npm run test:email

# Test full call flow
npm run test:flow

# Run all tests
npm run test
```

## Architecture

### Core Components

1. **ConversationEngine** (`src/conversationEngine.js`)
   - State machine for entire call flow
   - Manages conversation context
   - Orchestrates tool calls
   - Decides when to escalate

2. **Tools Layer** (`src/tools.js`)
   - Discrete, idempotent actions
   - Cliniko API integration (mocked for MVP)
   - SMS/Email sending
   - Booking lookups

3. **Email Capture** (`src/emailCapture.js`)
   - Character-by-character spelling mode
   - Validation and readback
   - SMS fallback for difficult captures
   - This is the differentiator for data quality

4. **Configuration** (`src/config.js`)
   - Multi-tenant business configs
   - Service definitions
   - Booking rules
   - Integration credentials

## Usage

### Basic Example

```javascript
const { ConversationEngine } = require('./src/conversationEngine');
const { loadBusinessConfig } = require('./src/config');

// Load business config
const config = loadBusinessConfig('spa_001');

// Create engine for new call
const engine = new ConversationEngine(config, {
  call_sid: 'CA123456',
  phone_from: '+64 27 123 4567',
  phone_to: '+64 9 123 4567'
});

// Process user input
const response = await engine.processInput('I want to book a massage', 0.85);

// Response structure:
// {
//   success: true,
//   action: 'speak',
//   text: 'What service would you like?',
//   nextState: 'GET_SERVICE',
//   capturedData: { ... },
//   shouldEscalate: false,
//   escalationReason: null
// }
```

## Call Flow Overview

### Booking Flow

```
INIT
  ↓
LISTENING (user says intent)
  ↓
CLASSIFY_INTENT (book/reschedule/cancel/question)
  ↓
GET_SERVICE → GET_NAME → GET_PHONE
  ↓
EMAIL_CAPTURE (letter-by-letter spelling)
  ├─ READBACK & CONFIRMATION
  └─ SMS_FALLBACK (if confidence low)
  ↓
GET_DATE_TIME → CHECK_AVAILABILITY
  ↓
CONFIRM_BOOKING → CREATE_BOOKING
  ↓
SEND_CONFIRMATION → CALL_END
```

### Escalation Points

The system escalates to a human when:
- User explicitly requests it ("speak to someone")
- ASR confidence too low on critical field
- API error (Cliniko unreachable)
- Email capture fails after 2 attempts + SMS
- Service not found in config
- User is frustrated/angry
- Booking conflicts or policy issues

## Email Capture (Critical Subsystem)

### Flow

1. **Instruction**: "Say your email slowly, letter by letter"
2. **Spelling Mode**: Capture each character, accept phonetic clarification
3. **Validation**: Check for @ and domain
4. **Readback**: "j-a-c-o-b at gmail dot com. Correct?"
5. **Confirmation**: User says yes/no
6. **Correction Loop**: Max 1 correction (if no)
7. **SMS Fallback**: If confidence still low, send SMS request

### Why This Works

- **No hallucination**: User controls every character
- **Confirmation**: Readback ensures accuracy
- **Graceful fallback**: SMS if difficult
- **No blocking**: Can continue booking without email initially
- **Follow-up**: SMS reply confirms email later

## Multi-Tenant Configuration

Each business is fully configured in `src/config.js`:

```javascript
{
  tenant_id: 'spa_001',
  business_name: 'Relaxed Retreat Spa',
  greeting_message: 'Hi, welcome to...',
  services: [ ... ],
  business_hours: { ... },
  escalation_rules: { ... },
  booking_rules: { ... },
  integrations: { ... }
}
```

**Key Principle**: Zero hardcoding. Add a new business by adding a config object.

## Database Models (for PostgreSQL)

See `ARCHITECTURE.md` for complete schema. Key tables:

- `businesses` - Multi-tenant configs
- `call_logs` - All inbound calls with transcripts
- `leads` - Captured customer details
- `booking_confirmations` - Booking records
- `call_sessions` - Session state (for recovery)

## Integration Points

### Cliniko API
- Check availability: `GET /appointments/available`
- Create appointment: `POST /appointments`
- Reschedule: `PUT /appointments/{id}`
- Cancel: `DELETE /appointments/{id}`
- Lookup booking: `GET /patients?phone={phone}`

(Currently mocked in `src/tools.js`)

### Twilio
- Voice gateway: Inbound call routing
- ConversationRelay: Speech-to-text, text-to-speech, barge-in
- Task Router: Human escalation queue
- SMS: Confirmations and email fallback

### Email/SMS
- SendGrid: Email confirmations with calendar invites
- Twilio SMS: Text confirmations and email fallback requests

## Development Roadmap

### Phase 1 (MVP - Complete)
- ✅ Conversation state machine
- ✅ Email capture subsystem
- ✅ Booking flow (single service)
- ✅ Reschedule/cancel flows
- ✅ Multi-tenant config system
- ✅ Escalation logic
- ✅ Error handling

### Phase 2 (Integration)
- [ ] Real Cliniko API integration
- [ ] PostgreSQL persistence
- [ ] Twilio webhook handler
- [ ] Real SMS/email sending
- [ ] Call recording & transcription
- [ ] Session recovery (call drop handling)

### Phase 3 (Advanced)
- [ ] NLP for better datetime parsing
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] A/B testing for scripts
- [ ] Custom practitioner preferences
- [ ] Complex cancellation policies

### Phase 4 (Scale)
- [ ] Admin panel for config updates
- [ ] Custom voice training per business
- [ ] Callback requests (if queue too long)
- [ ] Integration with CRM systems
- [ ] Billing & usage tracking
- [ ] White-label product packaging

## Key Design Principles

1. **Reliability over Cleverness**
   - Simple keyword matching > complex NLP (initially)
   - Explicit confirmation > assumptions
   - Escalate when unsure

2. **Data Quality First**
   - Email capture is hardened
   - All critical details confirmed
   - No hallucinated bookings

3. **User Experience**
   - Natural conversation (no robotic)
   - Allow interruption (barge-in)
   - Clear escalation to humans
   - Fast response times

4. **Operational Reality**
   - Multi-tenant from the ground up
   - Deterministic tool actions
   - Graceful degradation on errors
   - Full audit trail

## NZ-Specific Considerations

- ✅ Phone format: +64 XXXX XXXXXX
- ✅ SMS compliance: Clear consent tracking
- ✅ Privacy: Call recording disclosure
- ✅ Timezones: NZ local time handling
- ✅ Business hours: Regional variations

## Testing

### Unit Tests
```bash
npm run test:email    # Email capture edge cases
```

### Integration Tests
```bash
npm run test:flow     # Full call flow (booking, reschedule, escalation)
```

### Manual Testing
Use the test simulator in `tests/testCallFlow.js` to trace through any scenario.

## Performance Targets

- **Call answer time**: < 2 seconds
- **Response time**: < 1 second per turn
- **Email capture**: < 2 minutes for confirmed email
- **Booking creation**: < 3 seconds (after confirmation)
- **Escalation**: < 30 seconds to human agent

## Monitoring & Logs

All calls logged with:
- `call_sid` (Twilio ID)
- `transcript` (speech-to-text)
- `captured_data` (name, phone, email, service, datetime)
- `escalation_reason` (if applicable)
- `duration` (seconds)
- `outcome` (booked / escalated / error)

## Security

- ⚠️ API keys encrypted in config
- ⚠️ PII not logged (except minimal contact info)
- ⚠️ HTTPS only for all external calls
- ⚠️ Session isolation per call
- ⚠️ Rate limiting on tool calls

## Contributing

When adding features:
1. Keep state machine flat (no nested states)
2. All tool actions must be idempotent
3. Escalate on uncertainty
4. Test with real NZ phone formats
5. Update this README

## License

Proprietary - SkinTech Limited

---

**Last Updated**: April 2026
**Status**: MVP Complete - Ready for Integration Testing
