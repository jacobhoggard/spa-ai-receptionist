/**
 * CallLog Model
 * Operations for call_logs table
 */

const { query, getOne } = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new call log entry (when call starts)
 */
async function createCallLog(businessId, callSid, phoneFrom, phoneTo) {
  if (!businessId || !callSid || !phoneFrom || !phoneTo) {
    throw new Error('Missing required fields for createCallLog');
  }

  const result = await query(
    `INSERT INTO call_logs (id, business_id, call_sid, phone_from, phone_to, started_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [uuidv4(), businessId, callSid, phoneFrom, phoneTo]
  );

  console.log(`📝 Call log created: ${callSid} for business ${businessId}`);
  return result.rows[0];
}

/**
 * Update call log when it ends
 */
async function endCallLog(callSid, durationSeconds, transcript, recordingUrl = null) {
  if (!callSid) {
    throw new Error('callSid required for endCallLog');
  }

  const result = await query(
    `UPDATE call_logs
     SET ended_at = NOW(),
         duration_seconds = $2,
         transcript = $3,
         recording_url = $4
     WHERE call_sid = $1
     RETURNING *`,
    [callSid, durationSeconds, transcript, recordingUrl]
  );

  if (result.rows.length === 0) {
    console.warn(`⚠️  Call log not found for end: ${callSid}`);
    return null;
  }

  console.log(`✅ Call log ended: ${callSid} (duration: ${durationSeconds}s)`);
  return result.rows[0];
}

/**
 * Mark a call as escalated
 */
async function markEscalated(callSid, escalationReason) {
  if (!callSid) throw new Error('callSid required');

  const result = await query(
    `UPDATE call_logs
     SET escalated = true, escalation_reason = $2
     WHERE call_sid = $1
     RETURNING *`,
    [callSid, escalationReason]
  );

  return result.rows[0];
}

/**
 * Get call log by SID
 */
async function getCallBySid(callSid) {
  return getOne('SELECT * FROM call_logs WHERE call_sid = $1', [callSid]);
}

/**
 * Get all calls for a business
 */
async function getBusinessCalls(businessId, limit = 50) {
  const result = await query(
    `SELECT * FROM call_logs
     WHERE business_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [businessId, limit]
  );
  return result.rows;
}

/**
 * Get call stats for a business
 */
async function getBusinessStats(businessId) {
  const result = await query(
    `SELECT
       COUNT(*) as total_calls,
       SUM(CASE WHEN escalated THEN 1 ELSE 0 END) as escalated_count,
       AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))::INT as avg_duration_seconds,
       MAX(created_at) as last_call_at
     FROM call_logs
     WHERE business_id = $1
       AND created_at > NOW() - INTERVAL '30 days'`,
    [businessId]
  );

  return result.rows[0] || {};
}

module.exports = {
  createCallLog,
  endCallLog,
  markEscalated,
  getCallBySid,
  getBusinessCalls,
  getBusinessStats
};
