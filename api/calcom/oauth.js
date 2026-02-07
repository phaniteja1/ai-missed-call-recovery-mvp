/**
 * Cal.com OAuth2 Callback Handler
 * 
 * This endpoint handles the OAuth2 callback from Cal.com after
 * a business authorizes the integration.
 * 
 * Flow:
 * 1. Business clicks "Connect Cal.com" in dashboard
 * 2. Redirected to Cal.com authorization page
 * 3. Cal.com redirects back here with code
 * 4. Exchange code for access token
 * 5. Store credentials in database
 * 6. Redirect to success page
 * 
 * URL: /api/calcom/oauth
 * Method: GET
 * Query params: code, state
 */

const { exchangeCodeForToken, getEventTypes } = require('../../lib/calcom');
const { updateCalcomCredentials } = require('../../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('❌ Cal.com OAuth error:', error, error_description);
      return res.redirect(`/dashboard?error=calcom_auth_failed&message=${encodeURIComponent(error_description || error)}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'code and state are required'
      });
    }

    // Decode state to get business ID
    let businessId;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
      businessId = stateData.businessId;
    } catch (decodeError) {
      console.error('❌ Error decoding state:', decodeError);
      return res.status(400).json({ 
        error: 'Invalid state parameter',
        message: 'Could not decode business ID from state'
      });
    }

    if (!businessId) {
      return res.status(400).json({ 
        error: 'Missing business ID',
        message: 'State parameter did not contain business ID'
      });
    }

    console.log('🔐 Processing Cal.com OAuth for business:', businessId);

    // Exchange authorization code for access token
    const tokens = await exchangeCodeForToken(code);
    
    console.log('✅ Successfully obtained Cal.com access token');

    // Fetch event types to get the default one
    // We'll need to make an API call with the new token
    let defaultEventTypeId = null;
    try {
      // Temporarily use the new token to fetch event types
      // (This is a bit hacky but works for the initial setup)
      const axios = require('axios');
      const eventTypesResponse = await axios.get('https://api.cal.com/v2/event-types', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'cal-api-version': '2024-08-13'
        }
      });

      const eventTypes = eventTypesResponse.data?.data || [];
      if (eventTypes.length > 0) {
        // Use the first active event type as default
        const activeEventType = eventTypes.find(et => et.active) || eventTypes[0];
        defaultEventTypeId = activeEventType.id;
        console.log('✅ Found default event type:', activeEventType.title);
      }
    } catch (eventTypeError) {
      console.warn('⚠️ Could not fetch event types:', eventTypeError.message);
      // Non-critical - business can configure this later
    }

    // Store credentials in database
    await updateCalcomCredentials(businessId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      event_type_id: defaultEventTypeId
    });

    console.log('✅ Cal.com credentials stored successfully');

    // Redirect to success page
    return res.redirect(`/dashboard?success=calcom_connected&event_type_id=${defaultEventTypeId || 'none'}`);

  } catch (error) {
    console.error('❌ Error in Cal.com OAuth callback:', error);
    
    // Redirect to error page with details
    return res.redirect(`/dashboard?error=calcom_setup_failed&message=${encodeURIComponent(error.message)}`);
  }
};
