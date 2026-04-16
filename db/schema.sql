-- ============================================================================
-- AI RECEPTIONIST DATABASE SCHEMA
-- ============================================================================
-- Multi-tenant support for NZ spas & clinics
-- Run this once on PostgreSQL database

-- ============================================================================
-- BUSINESSES TABLE - Store all tenant configurations
-- ============================================================================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  tenant_id VARCHAR(50) UNIQUE NOT NULL, -- spa_001, spa_002, etc
  business_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(50), -- spa, clinic, salon, etc

  -- Phone Numbers
  existing_phone_number VARCHAR(20), -- Their original number (for reference)
  ai_phone_number VARCHAR(20) UNIQUE NOT NULL, -- Our Twilio number
  phone_provider VARCHAR(50), -- Spark, Vodafone, 2degrees, etc

  -- Notifications
  email_notification_to VARCHAR(255), -- Where to send booking request emails
  sms_notification_to VARCHAR(20), -- Where to send SMS alerts

  -- Configuration (stored as JSON for flexibility)
  config JSONB,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_businesses_ai_phone ON businesses(ai_phone_number);
CREATE INDEX idx_businesses_tenant_id ON businesses(tenant_id);

-- ============================================================================
-- CALL_LOGS TABLE - Store all inbound calls
-- ============================================================================
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_sid VARCHAR(100) UNIQUE NOT NULL, -- Twilio call ID

  -- Call Info
  phone_from VARCHAR(20) NOT NULL, -- Caller's number
  phone_to VARCHAR(20) NOT NULL, -- Which AI number they called

  -- Timing
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_seconds INT,

  -- Outcome
  transcript TEXT, -- Full conversation
  escalated BOOLEAN DEFAULT false, -- Was transferred to human?
  escalation_reason VARCHAR(255),

  -- Recording
  recording_url VARCHAR(500), -- Twilio recording URL

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_call_logs_business_id ON call_logs(business_id);
CREATE INDEX idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);

-- ============================================================================
-- LEADS TABLE - Captured customer details from calls
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,

  -- Customer Details
  name VARCHAR(255),
  phone_number VARCHAR(20),
  email VARCHAR(255),

  -- Request Details
  service_interested VARCHAR(255),
  preferred_datetime VARCHAR(255),

  -- Status
  email_capture_status VARCHAR(50), -- confirmed, sms_fallback, failed

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leads_business_id ON leads(business_id);
CREATE INDEX idx_leads_call_id ON leads(call_id);
CREATE INDEX idx_leads_phone_number ON leads(phone_number);
CREATE INDEX idx_leads_created_at ON leads(created_at);

-- ============================================================================
-- NOTIFICATIONS_LOG TABLE - Track all notifications sent
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,

  -- Notification Details
  notification_type VARCHAR(50), -- email, sms
  recipient VARCHAR(255),
  subject VARCHAR(500),
  message TEXT,

  -- Status
  status VARCHAR(50), -- sent, failed, pending
  error_message TEXT,

  -- Timestamps
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_log_business_id ON notifications_log(business_id);
CREATE INDEX idx_notifications_log_call_id ON notifications_log(call_id);
CREATE INDEX idx_notifications_log_status ON notifications_log(status);

-- ============================================================================
-- Add updated_at trigger for businesses table
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_businesses_updated_at
BEFORE UPDATE ON businesses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Sample Data - Sanctuary Day Spa (for testing)
-- ============================================================================
INSERT INTO businesses (
  tenant_id,
  business_name,
  business_type,
  existing_phone_number,
  ai_phone_number,
  phone_provider,
  email_notification_to,
  sms_notification_to,
  config
) VALUES (
  'sanctuary_001',
  'Sanctuary Day Spa',
  'spa',
  '+64 3 668 1200',
  '+64 3 555 1234',
  'Spark',
  'info@sanctuarywanaka.co.nz',
  '+64 27 123 4567',
  '{
    "services": [
      {"id": "lymphatic_60", "name": "Lymphatic Massage 60min"},
      {"id": "lymphatic_90", "name": "Lymphatic Massage 90min"},
      {"id": "relaxation_30", "name": "Relaxation Massage 30min"},
      {"id": "relaxation_45", "name": "Relaxation Massage 45min"},
      {"id": "relaxation_60", "name": "Relaxation Massage 60min"},
      {"id": "relaxation_90", "name": "Relaxation Massage 90min"},
      {"id": "firm_30", "name": "Firm Pressure Massage 30min"},
      {"id": "firm_45", "name": "Firm Pressure Massage 45min"},
      {"id": "firm_60", "name": "Firm Pressure Massage 60min"},
      {"id": "firm_90", "name": "Firm Pressure Massage 90min"},
      {"id": "hotstones_60", "name": "Hot Stone Massage 60min"},
      {"id": "hotstones_90", "name": "Hot Stone Massage 90min"},
      {"id": "pregnancy_60", "name": "Pregnancy Massage 60min"},
      {"id": "pregnancy_90", "name": "Pregnancy Massage 90min"},
      {"id": "couple_60", "name": "Couple Massage 60min"},
      {"id": "couple_90", "name": "Couple Massage 90min"},
      {"id": "facial_algotherm_45", "name": "Algotherm Facial 45min"},
      {"id": "facial_algotherm_60", "name": "Algotherm Facial 60min"},
      {"id": "facial_dermaplaning_60", "name": "Dermaplaning Facial 60min"},
      {"id": "facial_advanced_60", "name": "Advanced Facial 60min"},
      {"id": "body_treatment_60", "name": "Body Treatment 60min"}
    ],
    "greeting_message": "Welcome to Sanctuary Day Spa. How can I help you today?"
  }'
) ON CONFLICT(tenant_id) DO NOTHING;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- SELECT COUNT(*) FROM businesses;
-- SELECT * FROM businesses WHERE tenant_id = 'spa_001';
-- SELECT COUNT(*) FROM call_logs WHERE business_id = (SELECT id FROM businesses WHERE tenant_id = 'spa_001');
