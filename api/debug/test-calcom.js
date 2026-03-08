/**
 * Debug endpoint to test Cal.com connection
 */
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const phone = req.query.phone;
  
  console.log('🔍 Testing Cal.com connection for phone:', phone);
  
  if (!phone) {
    return res.status(400).json({ error: 'Missing phone parameter' });
  }
  
  try {
    // 1. Get business by phone
    const { data: phoneData, error: phoneError } = await supabase
      .from('business_phone_numbers')
      .select('business_id, phone_number')
      .eq('phone_number', phone)
      .single();
    
    if (phoneError || !phoneData) {
      return res.status(404).json({ error: 'Business not found', phoneError });
    }
    
    const businessId = phoneData.business_id;
    console.log('✅ Business found:', businessId);
    
    // 2. Get Cal.com credentials
    const { data: integration, error: integError } = await supabase
      .from('business_integrations')
      .select('*')
      .eq('business_id', businessId)
      .eq('integration_type', 'calcom')
      .single();
    
    if (integError || !integration) {
      return res.status(404).json({ error: 'Cal.com integration not found', integError });
    }
    
    const credentials = {
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
      token_expires_at: integration.token_expires_at,
      config: integration.config || {},
      time_zone: integration.time_zone || 'America/New_York'
    };
    
    const eventTypeId = credentials.config?.event_type_id;
    
    console.log('✅ Credentials found, event_type_id:', eventTypeId);
    console.log('   Token expires at:', credentials.token_expires_at);
    
    // 3. Test access token validity
    let tokenValid = false;
    let userInfo = null;
    try {
      const meResponse = await axios.get('https://api.cal.com/v2/me', {
        headers: { Authorization: `Bearer ${credentials.access_token}` }
      });
      tokenValid = meResponse.status === 200;
      userInfo = meResponse.data?.data;
      console.log('✅ Access token is valid, user:', userInfo?.name);
    } catch (error) {
      console.log('❌ Access token invalid:', error.response?.status, error.response?.data?.message);
    }
    
    // 4. Test availability API (authenticated endpoint)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
    
    let slots = [];
    let slotsError = null;
    try {
      const startDate = new Date(tomorrow);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(tomorrow);
      endDate.setHours(23, 59, 59, 999);
      
      const url = 'https://api.cal.com/v2/slots';
      const params = {
        eventTypeId: parseInt(eventTypeId, 10),
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
      
      console.log('📅 Testing slots API:', url);
      console.log('   Params:', JSON.stringify(params));
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${credentials.access_token}` },
        params
      });
      
      console.log('✅ Slots API success');
      
      // Parse slots from various possible response formats
      const data = response.data;
      slots = data.data?.slots || data.slots || data.result?.slots || [];
      
    } catch (error) {
      slotsError = {
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
        data: error.response?.data
      };
      console.log('❌ Slots API error:', slotsError.status, slotsError.message);
    }
    
    return res.status(200).json({
      success: true,
      business: {
        id: businessId,
        phone: phone
      },
      credentials: {
        has_access_token: !!credentials.access_token,
        has_event_type_id: !!eventTypeId,
        event_type_id: eventTypeId,
        token_expires_at: credentials.token_expires_at,
        token_valid: tokenValid
      },
      user_info: userInfo,
      availability_test: {
        date: dateStr,
        slots_found: slots.length,
        slots: slots.slice(0, 5), // First 5 slots
        error: slotsError
      }
    });
    
  } catch (error) {
    console.error('💥 Test failed:', error);
    return res.status(500).json({
      error: 'Test failed',
      message: error.message
    });
  }
}
