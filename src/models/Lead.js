/**
 * Lead Model
 * Operations for leads table (captured customer details)
 */

const { query, getAll } = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new lead from captured call data
 */
async function createLead(businessId, callId, phoneNumber, email, name, serviceInterested, preferredDatetime) {
  if (!businessId || !callId) {
    throw new Error('Missing required fields for createLead');
  }

  const result = await query(
    `INSERT INTO leads (id, business_id, call_id, phone_number, email, name, service_interested, preferred_datetime)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      uuidv4(),
      businessId,
      callId,
      phoneNumber || null,
      email || null,
      name || null,
      serviceInterested || null,
      preferredDatetime || null
    ]
  );

  console.log(`📋 Lead created: ${name} (${phoneNumber})`);
  return result.rows[0];
}

/**
 * Get all leads for a business
 */
async function getBusinessLeads(businessId, limit = 100) {
  return getAll(
    `SELECT * FROM leads
     WHERE business_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [businessId, limit]
  );
}

/**
 * Get leads from last N days
 */
async function getLeadsRecent(businessId, days = 7) {
  return getAll(
    `SELECT * FROM leads
     WHERE business_id = $1
       AND created_at > NOW() - INTERVAL '1 day' * $2
     ORDER BY created_at DESC`,
    [businessId, days]
  );
}

/**
 * Get lead count by email capture status
 */
async function getEmailCaptureStats(businessId) {
  const result = await query(
    `SELECT
       email_capture_status,
       COUNT(*) as count
     FROM leads
     WHERE business_id = $1
       AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY email_capture_status`,
    [businessId]
  );

  return result.rows;
}

module.exports = {
  createLead,
  getBusinessLeads,
  getLeadsRecent,
  getEmailCaptureStats
};
