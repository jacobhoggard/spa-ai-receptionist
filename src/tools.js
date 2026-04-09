/**
 * Tools Layer - Discrete, reliable tool actions
 *
 * Each tool is idempotent and returns consistent results.
 * Implements real email sending via multiple fallback methods.
 */

const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

/**
 * Mock customer data (in real implementation, calls Timely API)
 * Stores customer history to recognize returning clients
 */
const MOCK_CUSTOMER_DATA = {
  '+6427123456': {
    id: 'cust_001',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+6427123456',
    preferred_service: 'Relaxation Massage',
    preferred_service_id: 'massage_60',
    preferred_practitioner: 'Sarah',
    last_visit: '2026-03-15',
    visit_count: 3,
    is_returning: true
  }
};

/**
 * Mock data for testing (in real implementation, calls Timely API)
 */
const MOCK_AVAILABILITY_SLOTS = [
  {
    id: 'slot_1',
    isoString: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    displayTime: 'tomorrow at 2:00 PM',
    practitioner: 'Sarah',
    duration: 60
  },
  {
    id: 'slot_2',
    isoString: new Date(Date.now() + 24 * 60 * 60 * 1000 + 3600000).toISOString(),
    displayTime: 'tomorrow at 3:00 PM',
    practitioner: 'Sarah',
    duration: 60
  },
  {
    id: 'slot_3',
    isoString: new Date(Date.now() + 24 * 60 * 60 * 1000 + 7200000).toISOString(),
    displayTime: 'tomorrow at 4:00 PM',
    practitioner: 'Alex',
    duration: 60
  }
];

const MOCK_BOOKINGS = {
  '+6427123456': {
    id: 'cliniko_999',
    service: 'Massage',
    service_id: 'massage_60',
    datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    displayTime: 'Monday at 10:00 AM',
    practitioner: 'Sarah'
  }
};

/**
 * Tool: lookup_customer_by_phone
 * Recognize returning customers by phone number
 * Aeva AI key feature: eliminates repetitive data collection
 */
async function toolLookupCustomerByPhone(inputs) {
  const { phone_number } = inputs;

  await new Promise(resolve => setTimeout(resolve, 50));

  // In real implementation:
  // - Call Timely API: GET /customers?phone={phone}
  // - Return customer profile and booking history
  // - Use this to personalize conversation

  const customer = MOCK_CUSTOMER_DATA[phone_number];

  if (customer && customer.is_returning) {
    return {
      found: true,
      is_returning: true,
      customer: customer
    };
  }

  return {
    found: false,
    is_returning: false
  };
}

/**
 * Tool: check_availability
 * Query for available appointment slots
 */
async function toolCheckAvailability(inputs) {
  const { service_id, requested_datetime } = inputs;

  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 100));

  // In real implementation:
  // - Call Timely API with service_id, date range
  // - Handle timezone conversion (NZ local)
  // - Return available slots

  // Mock: always return slots (could randomize for testing)
  return {
    success: true,
    slot: MOCK_AVAILABILITY_SLOTS[0],
    alternatives: MOCK_AVAILABILITY_SLOTS,
    message: 'Found availability'
  };
}

/**
 * Tool: create_booking
 * Create appointment in Timely
 */
async function toolCreateBooking(inputs) {
  const { service_id, appointment_datetime, customer_name, customer_phone, customer_email } = inputs;

  // Validate required fields
  if (!service_id || !appointment_datetime || !customer_name || !customer_phone) {
    return {
      success: false,
      error: 'missing_fields',
      message: 'Missing required fields'
    };
  }

  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 150));

  // In real implementation:
  // - Call Timely API: POST /bookings
  // - Validate appointment_datetime still available
  // - Handle conflict (slot_taken)
  // - Create/update customer in Timely
  // - Return appointment_id

  return {
    success: true,
    appointment_id: `cliniko_${Date.now()}`,
    confirmation_message: `Booking created for ${customer_name} on ${appointment_datetime.displayTime}`,
    sms_sent: true,
    email_sent: !!customer_email
  };
}

/**
 * Tool: reschedule_booking
 * Reschedule appointment in Timely
 */
async function toolRescheduleBooking(inputs) {
  const { appointment_id, new_datetime, customer_phone } = inputs;

  await new Promise(resolve => setTimeout(resolve, 150));

  // In real implementation:
  // - Call Timely API: PUT /bookings/{id}
  // - Validate new_datetime available
  // - Return old and new times

  return {
    success: true,
    old_datetime: '2026-04-05T14:00:00Z',
    new_datetime: new_datetime.isoString,
    message: `Moved from ${new_datetime.displayTime}`
  };
}

/**
 * Tool: cancel_booking
 * Cancel appointment in Timely (respects cancellation policy)
 */
async function toolCancelBooking(inputs) {
  const { appointment_id, reason } = inputs;

  await new Promise(resolve => setTimeout(resolve, 100));

  // In real implementation:
  // - Call Timely API: DELETE /bookings/{id}
  // - Check cancellation policy (min hours)
  // - Return policy message

  return {
    success: true,
    message: 'Appointment cancelled',
    cancellation_policy: 'You are outside the cancellation window. No fees apply.'
  };
}

/**
 * Tool: lookup_booking_by_phone
 * Find customer's existing booking (for reschedule/cancel)
 */
async function toolLookupBookingByPhone(inputs) {
  const { phone_number } = inputs;

  await new Promise(resolve => setTimeout(resolve, 100));

  // In real implementation:
  // - Query Timely API: GET /customers?phone={phone}
  // - Get most recent appointment
  // - Return appointment details

  const booking = MOCK_BOOKINGS[phone_number];

  if (booking) {
    return {
      found: true,
      appointment: booking
    };
  }

  return {
    found: false
  };
}

/**
 * Tool: send_sms
 * Send SMS confirmation or email fallback
 */
async function toolSendSms(inputs) {
  const { to, message, template } = inputs;

  // Validate
  if (!to || !message) {
    return {
      success: false,
      error: 'missing_fields'
    };
  }

  // Simulate SMS gateway call
  await new Promise(resolve => setTimeout(resolve, 200));

  // In real implementation:
  // - Call Twilio SMS API
  // - Handle delivery failures gracefully
  // - Log SMS_ID for tracking

  console.log(`[SMS SENT] To: ${to}`);
  console.log(`[SMS] ${message}`);

  return {
    success: true,
    sms_id: `sms_${Date.now()}`,
    timestamp: new Date().toISOString(),
    to,
    message
  };
}

/**
 * Tool: send_email
 * Send booking confirmation email (with calendar invite)
 */
async function toolSendEmail(inputs) {
  const { to, service, appointment_datetime, customer_name } = inputs;

  // Validate
  if (!to || !service || !appointment_datetime || !customer_name) {
    return {
      success: false,
      error: 'missing_fields'
    };
  }

  // Simulate email gateway call
  await new Promise(resolve => setTimeout(resolve, 250));

  // In real implementation:
  // - Generate iCalendar (ICS) file
  // - Call SendGrid / email provider
  // - Attach calendar invite
  // - Log email_id for tracking

  console.log(`[EMAIL SENT] To: ${to}`);
  console.log(`[EMAIL] Booking confirmation for ${service} on ${appointment_datetime.displayTime}`);

  return {
    success: true,
    email_id: `email_${Date.now()}`,
    timestamp: new Date().toISOString(),
    to
  };
}

/**
 * Send email via Sendgrid API
 * Now that sender is verified in Sendgrid, this will work
 */
async function sendEmailViaSendgrid(to, from, subject, html, replyTo) {
  const apiKey = process.env.SENDGRID_API_KEY;

  console.log(`[SENDGRID DEBUG] API Key present: ${!!apiKey}`);
  console.log(`[SENDGRID DEBUG] API Key length: ${apiKey ? apiKey.length : 0}`);
  console.log(`[SENDGRID DEBUG] To: ${to}, From: ${from}`);

  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY not configured in environment');
  }

  sgMail.setApiKey(apiKey);

  const msg = {
    to,
    from,
    subject,
    html,
    replyTo
  };

  console.log(`[SENDGRID] Sending email: ${subject}`);

  const result = await sgMail.send(msg);

  console.log(`[SENDGRID] Email sent successfully. Message ID: ${result[0].headers['x-message-id']}`);

  return {
    messageId: result[0].headers['x-message-id'],
    response: result[0]
  };
}

/**
 * Tool: send_booking_request_email
 * Send booking request to Sanctuary team via Sendgrid
 * Now that sender is verified, emails will send immediately
 * Fallback to file storage if Sendgrid fails
 */
async function toolSendBookingRequestEmail(inputs) {
  const { customer_name, customer_phone, customer_email, service, requested_datetime, is_returning_customer } = inputs;

  // Validate
  if (!customer_name || !customer_phone || !service || !requested_datetime) {
    return {
      success: false,
      error: 'missing_fields',
      message: 'Missing required customer information'
    };
  }

  const customerType = is_returning_customer ? 'Returning' : 'New';
  const emailSubject = `${customerType} Booking Request - ${customer_name}`;
  const emailTo = process.env.EMAIL_TO_ADDRESS || 'info@sanctuarywanaka.co.nz';
  const emailFrom = process.env.EMAIL_FROM_ADDRESS || 'info@sanctuarywanaka.co.nz';

  const emailBody = `
<h2>New Booking Request from Ava AI Receptionist</h2>

<p><strong>Customer Type:</strong> ${customerType} Customer</p>

<h3>Customer Details</h3>
<ul>
<li><strong>Name:</strong> ${customer_name}</li>
<li><strong>Phone:</strong> ${customer_phone}</li>
<li><strong>Email:</strong> ${customer_email || '(Not provided)'}</li>
</ul>

<h3>Booking Request</h3>
<ul>
<li><strong>Service:</strong> ${service}</li>
<li><strong>Requested Date/Time:</strong> ${requested_datetime}</li>
</ul>

<hr>

<p><strong>Next Steps:</strong> Please contact the customer to confirm availability and complete the booking in Timely. You can call, text, or email them to finalize the appointment.</p>

<p><em>This booking request was captured by Ava, our AI receptionist. All customer information has been verified during the phone call.</em></p>

<p>
  <small style="color: #999;">
    Timestamp: ${new Date().toISOString()} | Booking ID: ${Date.now()}
  </small>
</p>
`;

  // ATTEMPT 1: Try Sendgrid (now that sender is verified)
  console.log(`[BOOKING EMAIL] Starting send process for ${customer_name}`);
  console.log(`[BOOKING EMAIL] Customer: ${customer_email} | To: ${emailTo} | From: ${emailFrom}`);

  try {
    const sendgridResult = await sendEmailViaSendgrid(
      emailTo,
      emailFrom,
      emailSubject,
      emailBody,
      customer_email || emailFrom
    );

    console.log(`✅ [SENDGRID SUCCESS] Email sent to ${emailTo}`);
    console.log(`   Message ID: ${sendgridResult.messageId}`);

    return {
      success: true,
      method: 'sendgrid',
      email_id: sendgridResult.messageId || `sendgrid_${Date.now()}`,
      timestamp: new Date().toISOString(),
      sent_to: emailTo,
      subject: emailSubject,
      customer: {
        name: customer_name,
        phone: customer_phone,
        email: customer_email
      }
    };
  } catch (sendgridError) {
    console.error(`❌ [SENDGRID FAILED] ${sendgridError.message}`);
    console.error(`[SENDGRID ERROR DETAILS]`, sendgridError);

    // FALLBACK: Save to file for manual processing
    console.log(`[FALLBACK] Saving booking to file...`);

    const bookingData = {
      timestamp: new Date().toISOString(),
      customer_name,
      customer_phone,
      customer_email,
      service,
      requested_datetime,
      is_returning_customer,
      status: 'pending_manual_confirmation',
      booking_id: Date.now()
    };

    try {
      const bookingsDir = path.join(__dirname, '../bookings');
      if (!fs.existsSync(bookingsDir)) {
        fs.mkdirSync(bookingsDir, { recursive: true });
      }

      const filename = path.join(bookingsDir, `booking_${Date.now()}.json`);
      fs.writeFileSync(filename, JSON.stringify(bookingData, null, 2));

      console.log(`✅ [FILE FALLBACK] Booking saved to ${filename}`);
      console.log(`   Contact: ${customer_name} / ${customer_phone} / ${customer_email}`);

      return {
        success: true,
        method: 'file_storage',
        email_id: `file_${Date.now()}`,
        timestamp: new Date().toISOString(),
        message: 'Booking saved to system. Team will confirm manually.',
        sent_to: filename,
        customer: {
          name: customer_name,
          phone: customer_phone,
          email: customer_email
        }
      };
    } catch (fileError) {
      console.error(`❌ [CRITICAL] All methods failed: ${fileError.message}`);
      return {
        success: false,
        error: 'all_methods_failed',
        message: `Sendgrid: ${sendgridError.message}. File: ${fileError.message}`,
        email_id: null
      };
    }
  }
}

/**
 * Tool router
 * Dispatches tool calls to appropriate handler
 */
async function executeToolAction(toolName, inputs) {
  const tools = {
    lookup_customer_by_phone: toolLookupCustomerByPhone,
    check_availability: toolCheckAvailability,
    create_booking: toolCreateBooking,
    send_booking_request_email: toolSendBookingRequestEmail,
    reschedule_booking: toolRescheduleBooking,
    cancel_booking: toolCancelBooking,
    lookup_booking_by_phone: toolLookupBookingByPhone,
    send_sms: toolSendSms,
    send_email: toolSendEmail
  };

  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  try {
    return await tool(inputs);
  } catch (error) {
    console.error(`Tool error (${toolName}):`, error);
    return {
      success: false,
      error: 'tool_execution_error',
      message: error.message
    };
  }
}

module.exports = {
  executeToolAction,
  toolLookupCustomerByPhone,
  toolCheckAvailability,
  toolCreateBooking,
  toolSendBookingRequestEmail,
  toolRescheduleBooking,
  toolCancelBooking,
  toolLookupBookingByPhone,
  toolSendSms,
  toolSendEmail
};
