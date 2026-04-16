/**
 * Notification Model
 * Operations for notifications_log table
 */

const { query, getAll } = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * Log a notification (email or SMS)
 */
async function logNotification(businessId, callId, notificationType, recipient, subject, message, status = 'sent', errorMessage = null) {
  if (!businessId || !callId || !notificationType || !recipient) {
    throw new Error('Missing required fields for logNotification');
  }

  const result = await query(
    `INSERT INTO notifications_log (id, business_id, call_id, notification_type, recipient, subject, message, status, error_message, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING *`,
    [
      uuidv4(),
      businessId,
      callId,
      notificationType,
      recipient,
      subject,
      message,
      status,
      errorMessage
    ]
  );

  const notification = result.rows[0];

  if (status === 'sent') {
    console.log(`📧 Notification logged: ${notificationType} to ${recipient}`);
  } else {
    console.warn(`⚠️  Notification failed: ${notificationType} to ${recipient}`);
  }

  return notification;
}

/**
 * Get recent notifications for a business
 */
async function getBusinessNotifications(businessId, limit = 50) {
  return getAll(
    `SELECT * FROM notifications_log
     WHERE business_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [businessId, limit]
  );
}

/**
 * Get notifications by status
 */
async function getNotificationsByStatus(businessId, status = 'failed') {
  return getAll(
    `SELECT * FROM notifications_log
     WHERE business_id = $1 AND status = $2
     ORDER BY created_at DESC`,
    [businessId, status]
  );
}

/**
 * Get notification stats
 */
async function getNotificationStats(businessId) {
  const result = await query(
    `SELECT
       notification_type,
       status,
       COUNT(*) as count
     FROM notifications_log
     WHERE business_id = $1
       AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY notification_type, status`,
    [businessId]
  );

  return result.rows;
}

module.exports = {
  logNotification,
  getBusinessNotifications,
  getNotificationsByStatus,
  getNotificationStats
};
