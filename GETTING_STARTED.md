# Getting Started - Running the AI Receptionist

This guide walks you through getting the system running **from zero to a working server** in 15 minutes.

## Step 1: Prerequisites (5 minutes)

### Install Node.js
- Download from https://nodejs.org/ (LTS version, 18+)
- Verify installation:
```bash
node --version   # Should be v18+ or v20+
npm --version    # Should be 9+
```

### Install Git (Optional but Recommended)
```bash
git clone https://github.com/your-repo/spa-ai-receptionist.git
cd spa-ai-receptionist
```

Or just download the ZIP and extract.

## Step 2: Install Dependencies (2 minutes)

```bash
# Navigate to project directory
cd "Day Spa Ai Receptionist"

# Install npm packages
npm install
```

This installs:
- `express` - Web server
- `dotenv` - Environment variables
- `ws` - WebSocket support
- `cors` - Cross-origin requests

## Step 3: Configure Environment (3 minutes)

### Copy Example Config
```bash
cp .env.example .env
```

### Edit `.env` File

For **local testing (no Twilio needed)**:
```env
PORT=3000
NODE_ENV=development
USE_MOCK_CLINIKO=true
DEBUG_CONVERSATION_ENGINE=true
```

For **Twilio integration** (you'll need these later):
```env
PORT=3000
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+64991234567
HUMAN_QUEUE_NUMBER=+64991235000
```

**For now, you only need PORT and NODE_ENV.**

## Step 4: Start the Server (2 minutes)

```bash
npm start
```

or

```bash
node server.js
```

You should see:
```
╔════════════════════════════════════════════════════╗
║  AI RECEPTIONIST SERVER                            ║
╚════════════════════════════════════════════════════╝

✅ Server running on port 3000

📋 Endpoints:
   GET  /health              - Health check
   POST /api/voice/inbound   - Twilio webhook
   POST /api/test/call       - Manual test (no Twilio needed)
   WS   /ws/call/:callSid    - ConversationRelay socket

🧪 Test without Twilio:
   curl -X POST http://localhost:3000/api/test/call
```

## Step 5: Test the System (2 minutes)

### Test 1: Health Check
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-01T14:30:00.000Z",
  "activeCalls": 0,
  "uptime": 12.345
}
```

### Test 2: Simulate a Complete Booking Call

Open another terminal:
```bash
curl -X POST http://localhost:3000/api/test/call \
  -H "Content-Type: application/json" \
  -d '{"businessPhone":"+64991234567"}'
```

Response (watch the server output in the first terminal):
```json
{
  "success": true,
  "business": "Relaxed Retreat Spa",
  "results": [
    {
      "step": "Request",
      "userInput": "I want to book a massage",
      "aiResponse": "Which service would you like to book? We offer: Relaxation Massage, Deep Tissue Massage, Facial, Custom Facial",
      "state": "GET_SERVICE",
      "escalated": false
    },
    ...
  ],
  "capturedData": {
    "name": "John Doe",
    "phone": "+6427123456",
    "email": "jacob@gmail.com",
    "service": "Relaxation Massage",
    "service_id": "massage_60",
    ...
  }
}
```

**✅ If you see this, the system is working!**

---

## Now What?

### Option A: Test More Edge Cases Locally

Test an escalation scenario:
```bash
curl -X POST http://localhost:3000/api/test/call \
  -H "Content-Type: application/json" \
  -d '{
    "businessPhone":"+64991234567",
    "testScenario":"escalation"
  }'
```

Test email capture specifically:
```bash
curl -X POST http://localhost:3000/api/test/call \
  -H "Content-Type: application/json" \
  -d '{
    "businessPhone":"+64991234567",
    "testScenario":"email_fallback"
  }'
```

### Option B: Deploy to Production (Next Phase)

See **DEPLOYING.md** for instructions to:
- Deploy to Heroku (5 minutes)
- Deploy to AWS (15 minutes)
- Deploy to Google Cloud (10 minutes)

### Option C: Integrate with Real Twilio

Follow **INTEGRATION_GUIDE.md**:
1. Set up Twilio account (~10 minutes)
2. Configure webhook URL (~5 minutes)
3. Test with real inbound call (~5 minutes)

---

## Common Issues

### Issue 1: "Port 3000 already in use"
```bash
# Find what's using it
lsof -i :3000

# Use a different port
PORT=3001 npm start
```

### Issue 2: "Cannot find module 'express'"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue 3: "Node not found"
```bash
# Node not installed correctly
# Download from https://nodejs.org/
# Or via package manager:
# macOS: brew install node
# Ubuntu: sudo apt-get install nodejs npm
```

### Issue 4: ".env file not found"
```bash
# Create it
cp .env.example .env
```

### Issue 5: "ConversationRelay WebSocket error"
This only happens when trying real Twilio. For local testing, ignore it.

---

## What the Server Does

```
Inbound Request
     ↓
POST /api/voice/inbound (Twilio webhook)
     ↓
Create Conversation Engine
     ↓
Send greeting TwiML
     ↓
WebSocket: /ws/call/{callSid}
     ↓
User speaks → Server processes → AI responds
     ↓
Save call logs (in future: PostgreSQL)
     ↓
Either:
  - Booking created → confirmation SMS/email
  - Escalate → transfer to human
  - Call ended
```

---

## Next Steps (In Order)

1. ✅ **Get it running locally** (you are here)
2. **Run the test suite**: `npm run test:flow`
3. **Deploy to staging**: Push to Heroku/AWS
4. **Set up Twilio account**: Get phone number
5. **Configure real APIs**: Cliniko, SendGrid, PostgreSQL
6. **Test with real call**: Call your Twilio number
7. **Go live**: Monitor and iterate

---

## Monitoring While Running

### Watch Logs
The server prints logs to console:
```
📞 [Inbound Call] SID: CA123456
   From: +64 27 123 4567
   To: +64 9 123 4567
   Tenant: spa_001
✅ [Call Initialized] Relaxed Retreat Spa

🔌 [WebSocket Connected] Call: CA123456
→ [Greeting] Hi, welcome to Relaxed Retreat Spa...
[Turn 1] User: "I want to book a massage" (confidence: 0.92)
→ AI: "Which service would you like?"
...
✅ [Call End] Reason: booking_created
```

### Check Health
```bash
# From another terminal
watch -n 1 'curl -s http://localhost:3000/health | jq'
```

---

## Architecture Reminder

```
┌──────────────────────────────────────────┐
│ Your Server (Node.js + Express)          │
│                                          │
│  GET /health                             │
│  POST /api/voice/inbound (TwiML)         │
│  POST /api/test/call (simulation)        │
│  WS /ws/call/:callSid (conversation)     │
│                                          │
│  Powered by:                             │
│  ├─ conversationEngine.js (state machine)
│  ├─ emailCapture.js (email handling)     │
│  ├─ tools.js (Cliniko, SMS, email)       │
│  └─ config.js (multi-tenant)             │
│                                          │
└──────────────────────────────────────────┘
         ↓ (when integrated)
┌──────────────────────────────────────────┐
│ External Services                        │
│  - Twilio Voice (phone routing)          │
│  - Cliniko API (bookings)                │
│  - SendGrid (email)                      │
│  - PostgreSQL (logs)                     │
└──────────────────────────────────────────┘
```

For now, all external services are **mocked**. The engine works perfectly in isolation.

---

## Testing Checklist

- [ ] Server starts without errors
- [ ] `/health` returns OK
- [ ] `/api/test/call` returns a booking result
- [ ] Terminal shows conversation transcript
- [ ] Email capture works (or triggers SMS fallback)
- [ ] Escalation context captures all details

If all pass: **✅ You're ready for the next phase!**

---

## Ready for Production?

When you're ready to connect real Twilio:

1. **Sign up for Twilio**: https://www.twilio.com/try-twilio
2. **Get a NZ phone number**: https://www.twilio.com/console/phone-numbers/search
3. **Configure webhook**: Point to your server's `/api/voice/inbound`
4. **Add credentials to .env**: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
5. **Deploy server**: Use Heroku, AWS, or your own server
6. **Test with real call**: Call your Twilio number

See **DEPLOYING.md** for detailed deployment steps.

---

## Troubleshooting

**"Still stuck?"** → Read ARCHITECTURE.md or INTEGRATION_GUIDE.md

**"Want to understand the code?"** → Read src/conversationEngine.js (it's the heart of it all)

**"Ready to integrate real APIs?"** → Follow INTEGRATION_GUIDE.md step-by-step

---

**Status**: ✅ You now have a working AI Receptionist server running locally
**Time Spent**: ~15 minutes
**Next Step**: Either test more, or deploy + integrate with real Twilio
