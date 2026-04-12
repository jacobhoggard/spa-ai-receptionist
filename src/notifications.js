/**
 * Notification System
 * Sends WhatsApp message to business owner when call ends
 */

const twilio = require('twilio');
const NotificationModel = require('./models/Notification');

let twilioClient = null;

/**
 * Initialize Twilio client
 */
function initializeTwilioClient() {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio WhatsApp client initialized');
  } else {
    console.warn('⚠️  TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set. WhatsApp notifications disabled.');
  }
}

/**
 * Send WhatsApp message to business owner after call ends
 */
async function sendBookingWhatsApp(businessId, callId, capturedData) {
  const toNumber = process.env.WHATSAPP_NOTIFY_TO || '+64211305723';
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!fromNumber) {
    console.warn('⚠️  TWILIO_WHATSAPP_FROM not set. Cannot send WhatsApp notification.');
    return false;
  }

  const message = buildWhatsAppMessage(capturedData);

  try {
    if (twilioClient) {
      const result = await twilioClient.messages.create({
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:${toNumber}`,
        body: message
      });

      console.log(`📱 WhatsApp sent to ${toNumber} (SID: ${result.sid})`);

      await NotificationModel.logNotification(
        businessId,
        callId,
        'whatsapp',
        toNumber,
        'New Booking Request',
        message,
        'sent'
      );

      return true;
    } else {
      console.log(`📝 WhatsApp notification (not sent - Twilio not configured):\n${message}`);

      await NotificationModel.logNotification(
        businessId,
        callId,
        'whatsapp',
        toNumber,
        'New Booking Request',
        message,
        'pending',
        'Twilio not configured'
      );

      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending WhatsApp:`, error.message);

    try {
      await NotificationModel.logNotification(
        businessId,
        callId,
        'whatsapp',
        toNumber,
        'New Booking Request',
        message,
        'failed',
        error.message
      );
    } catch (logError) {
      console.error('Failed to log notification error:', logError.message);
    }

    return false;
  }
}

/**
 * Build the WhatsApp message body
 */
function buildWhatsAppMessage(capturedData) {
  const lines = [
    '*New Booking Request via Ava*',
    '',
    `Name: ${capturedData.name || 'Not captured'}`,
    `Phone: ${capturedData.phone || 'Not captured'}`,
  ];

  if (capturedData.email) {
    lines.push(`Email: ${capturedData.email}`);
  }

  if (capturedData.service) {
    lines.push(`Service: ${capturedData.service}`);
  }

  if (capturedData.preferred_datetime) {
    lines.push(`Preferred Time: ${capturedData.preferred_datetime}`);
  }

  if (capturedData.therapist) {
    lines.push(`Therapist Preference: ${capturedData.therapist}`);
  }

  lines.push('');
  lines.push('Please follow up to confirm their appointment.');

  return lines.join('\n');
}

/**
 * Send notification after call ends
 */
async function sendBookingNotifications(businessId, callId, capturedData) {
  console.log(`\n📢 Sending WhatsApp notification for call ${callId}...`);

  const sent = await sendBookingWhatsApp(businessId, callId, capturedData);

  console.log(`✅ WhatsApp notification ${sent ? 'sent' : 'pending/failed'}\n`);

  return { whatsappSent: sent };
}

/**
 * Extract a value from ElevenLabs data_collection_results
 * Results can be { value, rationale } objects or plain strings
 */
function getField(dataCollection, key) {
  const entry = dataCollection[key];
  if (!entry) return null;
  if (typeof entry === 'string') return entry.trim() || null;
  if (typeof entry === 'object' && entry.value) {
    const v = String(entry.value).trim();
    // Treat placeholder / not-collected values as empty
    if (!v || v.toLowerCase() === 'null' || v.toLowerCase() === 'not provided' || v.toLowerCase() === 'unknown') return null;
    return v;
  }
  return null;
}

/**
 * Send post-call summary WhatsApp after ElevenLabs call ends
 */
async function sendPostCallSummary(conversationId, summary, durationSecs, dataCollection = {}) {
  const toNumber = process.env.WHATSAPP_NOTIFY_TO || '+64211305723';
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!fromNumber) {
    console.warn('⚠️  TWILIO_WHATSAPP_FROM not set. Cannot send post-call summary.');
    return false;
  }

  const mins = Math.floor(durationSecs / 60);
  const secs = durationSecs % 60;
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Pull structured fields from ElevenLabs data collection
  const callerName        = getField(dataCollection, 'caller_name');
  const treatmentRequested = getField(dataCollection, 'treatment_requested');
  const treatmentDuration  = getField(dataCollection, 'treatment_duration');
  const preferredDatetime  = getField(dataCollection, 'preferred_datetime');
  const preferredTherapist = getField(dataCollection, 'preferred_therapist');
  const contactPhone       = getField(dataCollection, 'contact_phone');
  const contactEmail       = getField(dataCollection, 'contact_email');

  // Build treatment line (combine service + duration if both present)
  let treatmentLine = treatmentRequested || null;
  if (treatmentLine && treatmentDuration) treatmentLine += ` — ${treatmentDuration}`;

  // Determine whether we have structured data or need to fall back to summary
  const hasStructuredData = callerName || treatmentLine || preferredDatetime || contactPhone;

  let message;

  if (hasStructuredData) {
    const lines = ['*📞 New Call — Ava @ Sanctuary*', ''];

    lines.push(`*Call received from:* ${callerName || 'Not captured'}`);
    lines.push(`*Treatment requested:* ${treatmentLine || 'Not captured'}`);
    lines.push(`*Date & time:* ${preferredDatetime || 'Not captured'}`);
    lines.push(`*Preferred therapist:* ${preferredTherapist || 'No preference'}`);
    lines.push(`*Contact number:* ${contactPhone || 'Not captured'}`);
    lines.push(`*Contact email:* ${contactEmail || 'Not provided'}`);
    lines.push('');
    lines.push(`_Call duration: ${durationStr}_`);
    lines.push('');
    lines.push('Please follow up to confirm their appointment. ✅');

    message = lines.join('\n');
  } else {
    // Fallback: use AI transcript summary when data collection isn't configured yet
    message = [
      '*📞 New Call — Ava @ Sanctuary*',
      '',
      `_Call duration: ${durationStr}_`,
      '',
      '*Summary:*',
      summary || 'No summary available.',
      '',
      'Please follow up if action is required.'
    ].join('\n');
  }

  try {
    if (twilioClient) {
      const result = await twilioClient.messages.create({
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:${toNumber}`,
        body: message
      });
      console.log(`📱 Post-call summary sent to ${toNumber} (SID: ${result.sid})`);
      return true;
    } else {
      console.log(`📝 Post-call summary (Twilio not configured):\n${message}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending post-call summary:', error.message);
    return false;
  }
}

module.exports = {
  initializeTwilioClient,
  sendBookingWhatsApp,
  sendBookingNotifications,
  sendPostCallSummary
};
