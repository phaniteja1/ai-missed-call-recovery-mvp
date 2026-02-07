/**
 * Supabase Client for Multi-tenant Database Access
 * 
 * This module provides a configured Supabase client with proper
 * authentication and row-level security (RLS) support.
 * 
 * Environment variables required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_KEY: Service role key (bypasses RLS for server operations)
 * - SUPABASE_ANON_KEY: Anonymous key (for client-side if needed)
 */

const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!SUPABASE_SERVICE_KEY) {
  console.warn('⚠️ SUPABASE_SERVICE_KEY not set - server operations may fail');
}

/**
 * Service client - bypasses RLS, use for server-side operations
 * This should be used in webhook handlers and background jobs
 */
const supabaseService = SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Anonymous client - respects RLS, use for client-facing operations
 * This should be used when you have a business_id in the JWT
 */
const supabaseAnon = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * Get business by phone number (for webhook lookups)
 * @param {string} phoneNumber - Phone number to lookup (E.164 format recommended)
 * @returns {Promise<Object|null>} Business object or null
 */
async function getBusinessByPhone(phoneNumber) {
  if (!supabaseService) throw new Error('Supabase service client not initialized');
  
  const { data, error } = await supabaseService
    .from('businesses')
    .select('*')
    .eq('phone_number', phoneNumber)
    .eq('active', true)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error('Error fetching business:', error);
    return null;
  }

  return data;
}

/**
 * Create or update a call record
 * @param {Object} callData - Call data object
 * @returns {Promise<Object>} Created/updated call record
 */
async function upsertCall(callData) {
  if (!supabaseService) throw new Error('Supabase service client not initialized');
  
  const { data, error } = await supabaseService
    .from('calls')
    .upsert(callData, {
      onConflict: 'vapi_call_id',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting call:', error);
    throw error;
  }

  return data;
}

/**
 * Insert a transcript entry
 * @param {string} callId - UUID of the call
 * @param {string} role - 'user', 'assistant', or 'system'
 * @param {string} text - Transcript text
 * @param {number} sequenceNumber - Order in conversation
 * @returns {Promise<Object>} Created transcript record
 */
async function insertTranscript(callId, role, text, sequenceNumber = null) {
  if (!supabaseService) throw new Error('Supabase service client not initialized');
  
  const { data, error } = await supabaseService
    .from('call_transcripts')
    .insert({
      call_id: callId,
      role,
      text,
      sequence_number: sequenceNumber,
      timestamp: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting transcript:', error);
    throw error;
  }

  return data;
}

/**
 * Create a booking record
 * @param {Object} bookingData - Booking data object
 * @returns {Promise<Object>} Created booking record
 */
async function createBooking(bookingData) {
  if (!supabaseService) throw new Error('Supabase service client not initialized');
  
  const { data, error } = await supabaseService
    .from('bookings')
    .insert(bookingData)
    .select()
    .single();

  if (error) {
    console.error('Error creating booking:', error);
    throw error;
  }

  // Update the related call to mark booking_created = true
  if (bookingData.call_id) {
    await supabaseService
      .from('calls')
      .update({ 
        booking_created: true,
        booking_id: data.id 
      })
      .eq('id', bookingData.call_id);
  }

  return data;
}

/**
 * Get business's Cal.com credentials
 * @param {string} businessId - UUID of the business
 * @returns {Promise<Object|null>} Cal.com credentials or null
 */
async function getCalcomCredentials(businessId) {
  if (!supabaseService) throw new Error('Supabase service client not initialized');
  
  const { data, error } = await supabaseService
    .from('businesses')
    .select('calcom_access_token, calcom_refresh_token, calcom_token_expires_at, calcom_event_type_id')
    .eq('id', businessId)
    .single();

  if (error) {
    console.error('Error fetching Cal.com credentials:', error);
    return null;
  }

  return data;
}

/**
 * Update business's Cal.com credentials (after OAuth)
 * @param {string} businessId - UUID of the business
 * @param {Object} credentials - Cal.com OAuth tokens
 * @returns {Promise<Object>} Updated business record
 */
async function updateCalcomCredentials(businessId, credentials) {
  if (!supabaseService) throw new Error('Supabase service client not initialized');
  
  const { data, error } = await supabaseService
    .from('businesses')
    .update({
      calcom_access_token: credentials.access_token,
      calcom_refresh_token: credentials.refresh_token,
      calcom_token_expires_at: credentials.expires_at,
      calcom_event_type_id: credentials.event_type_id || null
    })
    .eq('id', businessId)
    .select()
    .single();

  if (error) {
    console.error('Error updating Cal.com credentials:', error);
    throw error;
  }

  return data;
}

/**
 * Get recent calls for a business (for analytics/dashboard)
 * @param {string} businessId - UUID of the business
 * @param {number} limit - Number of calls to retrieve
 * @returns {Promise<Array>} Array of call records
 */
async function getRecentCalls(businessId, limit = 50) {
  if (!supabaseService) throw new Error('Supabase service client not initialized');
  
  const { data, error } = await supabaseService
    .from('calls')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent calls:', error);
    return [];
  }

  return data;
}

module.exports = {
  supabaseService,
  supabaseAnon,
  getBusinessByPhone,
  upsertCall,
  insertTranscript,
  createBooking,
  getCalcomCredentials,
  updateCalcomCredentials,
  getRecentCalls
};
