/**
 * Business Model
 * Operations for businesses table (tenants)
 */

const { query, getOne, getAll } = require('../db');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');

// Cache business lookups for 5 minutes to reduce DB hits
const businessCache = new NodeCache({ stdTTL: 300 });

/**
 * Get business by Twilio AI phone number
 */
async function getBusinessByAiPhone(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number required');
  }

  // Check cache first
  const cacheKey = `phone_${phoneNumber}`;
  const cached = businessCache.get(cacheKey);
  if (cached) {
    console.log(`📦 Business retrieved from cache: ${cached.business_name}`);
    return cached;
  }

  // Query database
  const result = await query(
    `SELECT * FROM businesses
     WHERE ai_phone_number = $1 AND is_active = true`,
    [phoneNumber]
  );

  if (result.rows.length === 0) {
    throw new Error(`No business found for phone number: ${phoneNumber}`);
  }

  const business = result.rows[0];
  businessCache.set(cacheKey, business);
  console.log(`✅ Business found: ${business.business_name}`);
  return business;
}

/**
 * Get business by tenant ID
 */
async function getBusinessByTenantId(tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID required');
  }

  const cacheKey = `tenant_${tenantId}`;
  const cached = businessCache.get(cacheKey);
  if (cached) return cached;

  const business = await getOne(
    'SELECT * FROM businesses WHERE tenant_id = $1 AND is_active = true',
    [tenantId]
  );

  if (business) {
    businessCache.set(cacheKey, business);
  }

  return business;
}

/**
 * Get business by ID
 */
async function getBusinessById(id) {
  return getOne('SELECT * FROM businesses WHERE id = $1', [id]);
}

/**
 * Create a new business (for onboarding)
 */
async function createBusiness(tenantId, businessName, aiPhoneNumber, emailNotificationTo, config = {}) {
  if (!tenantId || !businessName || !aiPhoneNumber) {
    throw new Error('Missing required fields for createBusiness');
  }

  const result = await query(
    `INSERT INTO businesses (id, tenant_id, business_name, ai_phone_number, email_notification_to, config)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      uuidv4(),
      tenantId,
      businessName,
      aiPhoneNumber,
      emailNotificationTo,
      JSON.stringify(config)
    ]
  );

  const business = result.rows[0];
  // Invalidate cache
  businessCache.del(`tenant_${tenantId}`);
  businessCache.del(`phone_${aiPhoneNumber}`);

  console.log(`✨ Business created: ${businessName}`);
  return business;
}

/**
 * Update business config
 */
async function updateBusinessConfig(businessId, config) {
  const result = await query(
    `UPDATE businesses
     SET config = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [businessId, JSON.stringify(config)]
  );

  if (result.rows.length > 0) {
    const business = result.rows[0];
    // Invalidate caches
    businessCache.del(`tenant_${business.tenant_id}`);
    businessCache.del(`phone_${business.ai_phone_number}`);
  }

  return result.rows[0];
}

/**
 * Update notification email
 */
async function updateNotificationEmail(businessId, email) {
  const result = await query(
    `UPDATE businesses
     SET email_notification_to = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [businessId, email]
  );

  return result.rows[0];
}

/**
 * Get all active businesses
 */
async function getAllBusinesses() {
  return getAll('SELECT * FROM businesses WHERE is_active = true ORDER BY created_at DESC');
}

/**
 * Clear business cache (for testing or updates)
 */
function clearCache() {
  businessCache.flushAll();
  console.log('Business cache cleared');
}

module.exports = {
  getBusinessByAiPhone,
  getBusinessByTenantId,
  getBusinessById,
  createBusiness,
  updateBusinessConfig,
  updateNotificationEmail,
  getAllBusinesses,
  clearCache
};
