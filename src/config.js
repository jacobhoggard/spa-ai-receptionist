/**
 * Configuration Loader - Multi-tenant Config Management
 *
 * In production:
 * - Loads from PostgreSQL
 * - Caches in Redis
 * - Invalidates on updates
 *
 * For MVP:
 * - Loads from in-memory config
 * - Can be easily replaced with DB queries
 */

// Sample business configurations (in production, these come from DB)
const BUSINESS_CONFIGS = {
  spa_001: {
    tenant_id: 'spa_001',
    business_name: 'Relaxed Retreat Spa',
    country: 'NZ',
    phone_number: '+64 9 123 4567',

    greeting_message: 'Hi, welcome to Relaxed Retreat Spa. I can help you book an appointment, reschedule, or answer questions.',

    services: [
      {
        id: 'massage_60',
        name: 'Relaxation Massage',
        duration_minutes: 60,
        cliniko_service_id: 'svc_abc123'
      },
      {
        id: 'massage_90',
        name: 'Deep Tissue Massage',
        duration_minutes: 90,
        cliniko_service_id: 'svc_abc124'
      },
      {
        id: 'facial_45',
        name: 'Facial',
        duration_minutes: 45,
        cliniko_service_id: 'svc_def456'
      },
      {
        id: 'facial_60',
        name: 'Custom Facial',
        duration_minutes: 60,
        cliniko_service_id: 'svc_def457'
      }
    ],

    business_hours: {
      monday: { open: '09:00', close: '18:00' },
      tuesday: { open: '09:00', close: '18:00' },
      wednesday: { open: '09:00', close: '20:00' },
      thursday: { open: '09:00', close: '18:00' },
      friday: { open: '09:00', close: '21:00' },
      saturday: { open: '10:00', close: '17:00' },
      sunday: null
    },

    escalation_rules: {
      transfer_on_request: true,
      transfer_on_high_confidence_failure: true,
      transfer_on_frustration: true,
      human_queue_id: 'queue_xyz_001'
    },

    booking_rules: {
      allow_cancellation: true,
      allow_rescheduling: true,
      min_advance_booking_hours: 2,
      max_advance_booking_days: 60,
      cancellation_policy_url: 'https://relaxedretreat.co.nz/cancellation'
    },

    integrations: {
      cliniko: {
        api_key: 'ENCRYPTED_KEY_HERE',
        business_id: 'cliniko_spa_001'
      },
      sms: {
        from_number: '+64 2 0123 456',
        twilio_account_sid: 'ACCOUNT_SID',
        twilio_auth_token: 'ENCRYPTED_TOKEN'
      },
      email: {
        from_address: 'noreply@relaxedretreat.co.nz',
        from_name: 'Relaxed Retreat Spa',
        sendgrid_api_key: 'ENCRYPTED_KEY_HERE'
      }
    },

    voice_settings: {
      language: 'en-NZ',
      voice_provider: 'elevenlabs',
      voice_id: 'female_natural_nz',
      speaking_rate: 1.0,
      emotion: 'professional_warm'
    }
  },

  clinic_002: {
    tenant_id: 'clinic_002',
    business_name: 'Skin Clinic Auckland',
    country: 'NZ',
    phone_number: '+64 9 987 6543',

    greeting_message: 'Hi, you\'ve reached Skin Clinic Auckland. I can book your appointment or help answer questions.',

    services: [
      {
        id: 'consult_30',
        name: 'Consultation',
        duration_minutes: 30,
        cliniko_service_id: 'svc_skin_001'
      },
      {
        id: 'laser_45',
        name: 'Laser Treatment',
        duration_minutes: 45,
        cliniko_service_id: 'svc_skin_002'
      }
    ],

    business_hours: {
      monday: { open: '10:00', close: '17:00' },
      tuesday: { open: '10:00', close: '17:00' },
      wednesday: { open: '10:00', close: '19:00' },
      thursday: { open: '10:00', close: '17:00' },
      friday: { open: '10:00', close: '17:00' },
      saturday: null,
      sunday: null
    },

    escalation_rules: {
      transfer_on_request: true,
      transfer_on_high_confidence_failure: true,
      transfer_on_frustration: true,
      human_queue_id: 'queue_xyz_002'
    },

    booking_rules: {
      allow_cancellation: true,
      allow_rescheduling: true,
      min_advance_booking_hours: 4,
      max_advance_booking_days: 30,
      cancellation_policy_url: 'https://skinclinic.co.nz/terms'
    },

    integrations: {
      cliniko: {
        api_key: 'ENCRYPTED_KEY_HERE',
        business_id: 'cliniko_clinic_002'
      },
      sms: {
        from_number: '+64 2 0987 654',
        twilio_account_sid: 'ACCOUNT_SID',
        twilio_auth_token: 'ENCRYPTED_TOKEN'
      },
      email: {
        from_address: 'noreply@skinclinic.co.nz',
        from_name: 'Skin Clinic Auckland',
        sendgrid_api_key: 'ENCRYPTED_KEY_HERE'
      }
    },

    voice_settings: {
      language: 'en-NZ',
      voice_provider: 'elevenlabs',
      voice_id: 'female_professional_nz',
      speaking_rate: 0.95,
      emotion: 'professional'
    }
  }
};

/**
 * Load business configuration
 * In production, this queries PostgreSQL
 *
 * @param {string} tenantId - Business tenant ID
 * @returns {Object} - Business configuration
 */
function loadBusinessConfig(tenantId) {
  const config = BUSINESS_CONFIGS[tenantId];

  if (!config) {
    throw new Error(`Business config not found for tenant: ${tenantId}`);
  }

  // In production, validate and decrypt sensitive keys
  // validateConfig(config);
  // decryptSensitiveKeys(config);

  return config;
}

/**
 * Get tenant ID from phone number
 * Routes inbound calls to correct business
 *
 * In production:
 * - Query DB: SELECT tenant_id FROM phone_numbers WHERE phone = ?
 * - Cache result
 *
 * @param {string} phoneNumber - E.164 format phone
 * @returns {string} - Tenant ID
 */
function getTenantIdFromPhone(phoneNumber) {
  // Mapping of inbound phone numbers to tenants
  const PHONE_TO_TENANT = {
    '+6491234567': 'spa_001',
    '+6499876543': 'clinic_002'
  };

  const tenantId = PHONE_TO_TENANT[phoneNumber];

  if (!tenantId) {
    throw new Error(`No tenant configured for phone: ${phoneNumber}`);
  }

  return tenantId;
}

/**
 * List all configured tenants (for admin)
 */
function listAllTenants() {
  return Object.keys(BUSINESS_CONFIGS).map(id => ({
    tenantId: id,
    businessName: BUSINESS_CONFIGS[id].business_name
  }));
}

/**
 * Validate configuration structure
 */
function validateConfig(config) {
  const requiredFields = [
    'tenant_id',
    'business_name',
    'greeting_message',
    'services',
    'business_hours',
    'integrations'
  ];

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required config field: ${field}`);
    }
  }

  // Validate services
  if (!Array.isArray(config.services) || config.services.length === 0) {
    throw new Error('At least one service must be configured');
  }

  for (const service of config.services) {
    if (!service.id || !service.name || !service.duration_minutes) {
      throw new Error('Invalid service configuration');
    }
  }

  return true;
}

module.exports = {
  loadBusinessConfig,
  getTenantIdFromPhone,
  listAllTenants,
  validateConfig
};
