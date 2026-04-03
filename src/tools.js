/**
 * Tools Layer - Discrete, reliable tool actions
 *
 * Each tool is idempotent and returns consistent results.
 * Currently mocked for testing. Real implementations call Timely API, Twilio, etc.
 */

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
 * Tool: send_booking_request_email
 * Send booking request to Sanctuary team
 * Ava captures details → email to team for manual confirmation in Timely
 */
async function toolSendBookingRequestEmail(inputs) {
  const { customer_name, customer_phone, customer_email, service, requested_datetime, is_returning_customer } = inputs;

  // Validate
  if (!customer_name || !customer_phone || !service || !requested_datetime) {
    return {
      success: false,
      error: 'missing_fields'
    };
  }

  // Simulate email gateway call
  await new Promise(resolve => setTimeout(resolve, 250));

  // In real implementation:
  // - Call SendGrid / email provider
  // - Send to info@sanctuarywanaka.co.nz
  // - Include customer details, preferred service, requested time
  // - Professional formatting for team

  const customerType = is_returning_customer ? 'Returning' : 'New';
  const emailSubject = `${customerType} Booking Request - ${customer_name}`;

  const emailBody = `
<h2>New Booking Request from Ava AI Receptionist</h2>

<p><strong>Customer Type:</strong> ${customerType} Customer</p>

<h3>Customer Details</h3>
<ul>
<li><strong>Name:</strong> ${customer_name}</li>
<li><strong>Phone:</strong> ${customer_phone}</li>
<li><strong>Email:</strong> ${customer_email}</li>
</ul>

<h3>Booking Request</h3>
<ul>
<li><strong>Service:</strong> ${service}</li>
<li><strong>Requested Date/Time:</strong> ${requested_datetime}</li>
</ul>

<hr>

<p><strong>Next Steps:</strong> Please contact the customer to confirm availability and complete the booking in Timely. You can call, text, or email them to finalize the appointment.</p>

<p><em>This booking request was captured by Ava, our AI receptionist. All customer information has been verified.</em></p>
`;

  console.log(`[BOOKING REQUEST EMAIL SENT] To: info@sanctuarywanaka.co.nz`);
  console.log(`Subject: ${emailSubject}`);
  console.log(emailBody);

  return {
    success: true,
    email_id: `booking_request_${Date.now()}`,
    timestamp: new Date().toISOString(),
    sent_to: 'info@sanctuarywanaka.co.nz',
    subject: emailSubject
  };
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
