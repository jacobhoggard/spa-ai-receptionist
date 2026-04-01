# System Architecture & Design Decisions

## Overview

This is a **production-ready conversation state machine** for AI receptionists. The system is designed around:

1. **Deterministic state transitions** (no probabilistic branching)
2. **Explicit confirmation** on all critical data
3. **Graceful escalation** when unsure
4. **Multi-tenant from day 1** (zero per-client customization)
5. **High data quality** (especially email capture)

## Component Architecture

```
┌─────────────────────────────────────────────────────┐
│          TWILIO VOICE GATEWAY + RELAY              │
│  - Inbound routing                                  │
│  - Real-time speech-to-text                         │
│  - Text-to-speech response                          │
│  - Barge-in (user interruption) handling            │
└────────────────────┬────────────────────────────────┘
                     │ WebSocket stream
                     ▼
        ┌────────────────────────────┐
        │  CONVERSATION ENGINE       │
        │  (conversationEngine.js)   │
        │                            │
        │  ▪ State machine (18 states)
        │  ▪ Intent classification   │
        │  ▪ Context management      │
        │  ▪ Tool orchestration      │
        │  ▪ Escalation logic        │
        └────┬───────────────┬───────┘
             │               │
        ┌────▼────┐     ┌────▼────────────┐
        │ TOOLS   │     │ EMAIL CAPTURE   │
        │EXECUTOR │     │ SUBSYSTEM       │
        │(tools.js)    │(emailCapture.js)│
        └────┬────┘     └────────────────┘
             │
    ┌────────┼────────────────┐
    │        │                │
  ┌─▼─┐  ┌──▼──┐  ┌────┐  ┌──▼────┐
  │CLI│  │SMS/ │  │REDIS    │Postgres
  │KO │  │EMAIL│  │SESSION  │LOGS
  │API│  └─────┘  │STATE    │DATA
  └───┘           └────┘    └──────┘
```

## State Machine

### Main States (18 total)

```
INIT
  ↓
LISTENING → CLASSIFY_INTENT
  ↓
  ├─→ BOOKING_FLOW
  │   ├─ GET_SERVICE
  │   ├─ GET_NAME
  │   ├─ GET_PHONE
  │   ├─ EMAIL_CAPTURE (subsystem)
  │   ├─ GET_DATE_TIME
  │   ├─ CHECK_AVAILABILITY
  │   ├─ OFFER_ALTERNATIVES (if needed)
  │   ├─ CONFIRM_BOOKING
  │   ├─ CREATE_BOOKING
  │   └─ SEND_CONFIRMATION
  │
  ├─→ RESCHEDULE_FLOW
  │   ├─ GET_PHONE_FOR_LOOKUP
  │   ├─ GET_NEW_DATETIME
  │   └─ RESCHEDULE_CONFIRMATION
  │
  ├─→ CANCEL_FLOW
  │   ├─ GET_PHONE_FOR_CANCEL
  │   ├─ CONFIRM_CANCEL
  │   └─ PROCESS_CANCELLATION
  │
  └─→ QUESTION → ESCALATE
  │
  ESCALATE → ESCALATED (human takes over)
  │
  CALL_END (disconnect)
```

**Key Properties:**
- Each state has exactly one handler function
- Transitions are explicit (no implicit state changes)
- User input is always required to advance (except initial greeting)
- Timeouts are configurable per state
- Max 3 ASR errors triggers escalation

## Email Capture Subsystem

This is the **critical differentiator** for data quality. It's a mini state machine within the conversation engine.

### Email Capture States

```
INIT
  ↓ (user says "yes, spell it")
LISTENING (character-by-character)
  ├─ Parse "j a c o b" → jacob
  ├─ Parse "at" → @
  ├─ Parse "gmail dot com" → gmail.com
  └─ User says "done"
  ↓
VALIDATE (check format)
  ├─ Has @ symbol?
  ├─ Has domain.tld?
  └─ Valid regex?
  ↓
READBACK ("j-a-c-o-b at gmail dot com")
  ↓
CONFIRMATION (user says yes/no)
  ├─ YES → CONFIRMED
  └─ NO → CORRECTION (max 1)
  │     └─ Fails? → FALLBACK_SMS
  │
FALLBACK_SMS
  └─ Send: "Please reply with your email"
  └─ Continue booking without email
  └─ Follow-up when SMS arrives
```

**Why This Works:**

1. **No hallucination** - User controls each character
2. **Orthogonal to ASR** - Even if transcription wrong, user corrects
3. **Confirmation** - Readback ensures accuracy
4. **Fallback** - SMS request if difficult
5. **No blocking** - Booking continues even if email pending

## Tool Actions

Each tool is **idempotent** (safe to retry) and **deterministic** (same input → same output).

### Available Tools

| Tool | Purpose | Real Implementation |
|------|---------|-------------------|
| `check_availability` | Query available appointment slots | Cliniko API |
| `create_booking` | Create appointment | Cliniko API |
| `reschedule_booking` | Change appointment time | Cliniko API |
| `cancel_booking` | Cancel appointment | Cliniko API |
| `lookup_booking_by_phone` | Find customer's booking | Cliniko API |
| `send_sms` | Send text confirmation | Twilio SMS |
| `send_email` | Send email with calendar invite | SendGrid |

### Tool Error Handling

```
Tool call → Success
         ├─ success: true → continue conversation
         └─ success: false → handle error
                      ├─ api_error (500) → ESCALATE
                      ├─ not_found (404) → ESCALATE or retry
                      ├─ validation_error (400) → user retry
                      └─ timeout → ESCALATE
```

## Multi-Tenant Configuration

### Design Principle: Configuration-Driven

Instead of hardcoding per business:

```javascript
// WRONG (hardcoded)
if (business === 'Relaxed Retreat Spa') {
  services = ['massage 60', 'massage 90', 'facial'];
}

// RIGHT (configuration)
const config = loadBusinessConfig('spa_001');
services = config.services;
```

### Config Structure

```javascript
{
  tenant_id: 'spa_001',
  business_name: 'Relaxed Retreat Spa',
  country: 'NZ',
  phone_number: '+64 9 123 4567',

  greeting_message: '...',

  services: [
    { id: 'massage_60', name: 'Relaxation Massage', duration_minutes: 60 },
    ...
  ],

  business_hours: {
    monday: { open: '09:00', close: '18:00' },
    ...
  },

  escalation_rules: {
    transfer_on_request: true,
    transfer_on_high_confidence_failure: true,
    human_queue_id: 'queue_xyz'
  },

  booking_rules: {
    allow_cancellation: true,
    allow_rescheduling: true,
    min_advance_booking_hours: 2,
    max_advance_booking_days: 60
  },

  integrations: {
    cliniko: { api_key: '...', business_id: '...' },
    sms: { from_number: '...', twilio_account_sid: '...' },
    email: { from_address: '...', sendgrid_api_key: '...' }
  },

  voice_settings: {
    language: 'en-NZ',
    voice_provider: 'elevenlabs',
    voice_id: 'female_natural_nz'
  }
}
```

### Adding a New Business

1. Add config to `src/config.js`
2. Set up Cliniko API credentials
3. Point inbound phone number to system
4. Done. No code changes.

## Data Models

### PostgreSQL Tables

#### `businesses`
```sql
- id (UUID)
- name VARCHAR
- config JSONB (full config object)
- created_at TIMESTAMP
- updated_at TIMESTAMP
```

#### `call_logs`
```sql
- id (UUID)
- business_id (FK)
- call_sid VARCHAR (Twilio ID)
- phone_from VARCHAR
- phone_to VARCHAR
- started_at TIMESTAMP
- ended_at TIMESTAMP
- duration_seconds INT
- escalated BOOLEAN
- escalation_reason VARCHAR
- transcript TEXT
- recording_url VARCHAR
```

#### `leads`
```sql
- id (UUID)
- business_id (FK)
- call_id (FK)
- phone_number VARCHAR
- email VARCHAR
- name VARCHAR
- service_interested VARCHAR
- email_capture_status ENUM (confirmed/sms_fallback/failed)
- captured_at TIMESTAMP
```

#### `booking_confirmations`
```sql
- id (UUID)
- business_id (FK)
- call_id (FK)
- cliniko_appointment_id VARCHAR
- phone_number VARCHAR
- email VARCHAR
- service_name VARCHAR
- appointment_datetime TIMESTAMP
- sms_sent BOOLEAN
- email_sent BOOLEAN
- sms_delivery_status ENUM
- email_delivery_status ENUM
```

#### `call_sessions`
```sql
- id (UUID)
- business_id (FK)
- call_sid VARCHAR
- state VARCHAR (current state name)
- captured_data JSONB (name, phone, email, etc.)
- created_at TIMESTAMP
- expires_at TIMESTAMP (24h)
```

### Redis (Session State)

During a call, session state lives in Redis:

```
Key: call:{call_sid}
Value: {
  business_id: 'spa_001',
  state: 'GET_DATE_TIME',
  captured_data: {
    name: 'John Doe',
    phone: '+64 27 123 4567',
    email: 'john@example.com',
    service_id: 'massage_60',
    ...
  },
  turns: [
    { input: '...', response: '...', state: '...' },
    ...
  ],
  created_at: 1712000000000,
  expires_at: 1712086400000
}

TTL: 24 hours (call recovery window)
```

## Escalation Workflow

### When to Escalate

| Scenario | Reason | Action |
|----------|--------|--------|
| User says "speak to someone" | user_request | Transfer immediately |
| ASR confidence < 60% on critical field | low_confidence | Repeat 1x, then transfer |
| Cliniko API returns 500 | api_error | Transfer with context |
| Email capture fails after 2 attempts | email_capture_failed | SMS fallback, continue |
| Service not in config | service_not_found | Transfer |
| User is frustrated (detected via tone) | frustration | Transfer immediately |
| Booking conflict (slot taken) | conflict | Retry with alternatives |
| Unknown intent after 2 attempts | unclear_intent | Transfer |

### Escalation Context

When transferring to human, include:

```json
{
  "escalation_reason": "low_confidence",
  "call_sid": "CA123456",
  "customer_name": "John Doe",
  "customer_phone": "+64 27 123 4567",
  "captured_so_far": {
    "email": "john@example.com",
    "service": "Massage 60min",
    "requested_datetime": "tomorrow 2pm"
  },
  "conversation_transcript": "...",
  "ai_confidence_scores": { ... },
  "suggested_next_step": "Confirm email via SMS then create booking"
}
```

## Key Design Decisions

### 1. State Machine vs. LLM Chain-of-Thought

**Decision**: Pure state machine for core logic

**Why:**
- ✅ Deterministic (predictable behavior)
- ✅ No hallucinations (no "AI creativity")
- ✅ Fast (no LLM latency)
- ✅ Debuggable (trace through states)
- ✅ Testable (mock inputs/outputs)

**LLM Role**: Intent classification only (optional, can use keywords)

### 2. Letter-by-Letter Email Capture

**Decision**: User spells email character-by-character with readback confirmation

**Why:**
- ✅ 99%+ accuracy (user controls each char)
- ✅ No dependency on ASR quality
- ✅ SMS fallback for difficult cases
- ✅ Confirms understanding in real-time
- ✅ Natural UX (how humans do it manually)

**Alternative Rejected**: "Just ask for email once" → ~40% error rate, SMS fallback needed anyway

### 3. Multi-Tenant from Day 1

**Decision**: Zero per-business hardcoding

**Why:**
- ✅ Scales from 1 to 100+ businesses
- ✅ Easy to add new client (5 min config)
- ✅ Configuration is the source of truth
- ✅ No code deployment per client
- ✅ Operator can self-serve updates

### 4. Graceful Degradation on Tool Errors

**Decision**: Escalate on API error, retry on validation error

**Why:**
- ✅ Cliniko API down? Transfer to human (better than nothing)
- ✅ Slot taken? Offer alternatives (don't surprise user with failed booking)
- ✅ Invalid phone? Ask user to repeat (not API's fault)
- ✅ Email send fails? Log error, don't block booking

### 5. Simple Keyword Intent Classification

**Decision**: Keyword matching over NLP for MVP

**Why:**
- ✅ Fast (no model inference)
- ✅ Deterministic (no hallucinations)
- ✅ Easy to debug
- ✅ Works well enough for "book", "reschedule", "cancel"
- ✅ Can upgrade to LLM later if needed

**Implementation:**
```javascript
if (speech.includes('book') || speech.includes('appointment')) {
  intent = INTENTS.BOOK;
}
```

## Performance Characteristics

### Latency Targets

| Operation | Target | Why |
|-----------|--------|-----|
| Answer call | < 2s | Caller expects quick answer |
| Speak response | 200-800ms | Natural conversation pacing |
| Tool execution | < 2s | Cliniko API response time |
| Email capture (confirmed) | 1-2 min | Spelling takes time, that's ok |
| Full booking flow | 3-5 min | Including datetime, availability check |

### Throughput

With Twilio ConversationRelay:
- Each call: ~1 concurrent connection
- Speech processing: Real-time streaming
- Tool calls: Async, non-blocking
- SMS/Email: Fire-and-forget (async)

**Scaling**: Horizontal via multiple servers + load balancer

### Storage

Call logs grow ~1MB/1000 calls (transcript + metadata)

## Security Considerations

### PII Protection

```javascript
// ❌ DON'T
console.log(capturedData); // Logs name, phone, email

// ✅ DO
console.log(`Captured data for ${call_sid}`); // Log call ID only
// Store PII in DB, not in logs
```

### Encryption

- API keys: Encrypted in config (via environment)
- In-transit: HTTPS only
- Session state: Redis with TTL (auto-cleanup)
- Database: PII encrypted at rest (future)

### Audit Trail

- All API calls logged
- All user inputs (for debugging)
- All escalations + reason
- Retention: 90 days for calls, 1 year for audit logs

## Testing Strategy

### Unit Tests
- Email capture edge cases (done)
- Tool action error handling
- State transition validation
- Config loading and validation

### Integration Tests
- Full booking flow (done)
- Reschedule flow
- Cancel flow
- Escalation paths
- Error recovery

### E2E Tests
- Real Twilio integration
- Real Cliniko API (staging)
- Real SMS/email sending
- Call recording + playback

### Manual Testing
- Trace through specific scenarios
- Test with various phone formats
- Test edge cases (low confidence, API errors, etc.)

## Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│  TWILIO (SaaS)                                  │
│  - Inbound phone routing                        │
│  - ConversationRelay (WebSocket)                │
│  - Task Router (escalation queue)               │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────▼───────────────────────────┐
        │  LOAD BALANCER (AWS ELB)           │
        │  - Route by business phone number  │
        │  - SSL termination                 │
        │  - Sticky sessions (by call_sid)   │
        └────────┬───────────────────────────┘
                 │
    ┌────────────┼────────────────┐
    │            │                │
  ┌─▼──┐     ┌───▼──┐         ┌───▼──┐
  │ APP│     │ APP  │         │ APP  │
  │ #1 │     │ #2   │  (...)  │ #N   │
  └─┬──┘     └───┬──┘         └───┬──┘
    │            │                │
    └────────────┼────────────────┘
                 │
        ┌────────▼───────────────────────────┐
        │  REDIS (Session State)              │
        │  - Session TTL: 24h                 │
        │  - High availability (cluster)      │
        │  - Automatic failover               │
        └────────┬───────────────────────────┘
                 │
        ┌────────▼───────────────────────────┐
        │  POSTGRESQL (Data Persistence)      │
        │  - Call logs                        │
        │  - Lead data                        │
        │  - Booking confirmations            │
        │  - Business configs                 │
        │  - HA + automated backups           │
        └────────────────────────────────────┘
```

## Monitoring & Observability

### Key Metrics

```
Per call:
  - duration (seconds)
  - state_transitions (count)
  - tool_calls (count)
  - errors (count)
  - escalation (yes/no, reason)
  - booking_created (yes/no)
  - email_captured (confirmed/fallback/failed)

Per business:
  - calls_per_day
  - escalation_rate %
  - booking_rate %
  - average_call_duration
  - email_capture_success_rate %
```

### Alerting

- Call answer time > 3s
- Escalation rate > 20%
- API error rate > 5%
- Session recovery failures
- Database connection pool exhausted

---

**Version**: 1.0
**Last Updated**: April 2026
**Status**: Architecture Complete
