/**
 * Debug endpoint to test Cal.com connection
 */
const { getBusinessByPhone, getCalcomCredentials } = require('../../lib/supabase');
const { checkAvailability } = require('../../lib/calcom');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const phone = req.query.phone;
  
  if (!phone) {
    return res.status(400).json({ error: 'Missing phone parameter' });
  }
  
  try {
    // 1. Get business by phone
    const business = await getBusinessByPhone(phone);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // 2. Get Cal.com credentials
    const credentials = await getCalcomCredentials(business.id);
    if (!credentials) {
      return res.status(404).json({ error: 'Cal.com credentials not found' });
    }
    
    const eventTypeId = credentials.config?.event_type_id;
    
    // 3. Test availability
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    let slots = [];
    let slotsError = null;
    try {
      slots = await checkAvailability(business.id, dateStr);
    } catch (error) {
      slotsError = error.message;
    }
    
    return res.status(200).json({
      success: true,
      business: {
        id: business.id,
        name: business.name,
        phone: phone
      },
      credentials: {
        has_access_token: !!credentials.access_token,
        has_event_type_id: !!eventTypeId,
        event_type_id: eventTypeId,
        token_expires_at: credentials.token_expires_at,
        time_zone: credentials.time_zone
      },
      availability_test: {
        date: dateStr,
        slots_found: slots.length,
        slots: slots.slice(0, 5),
        error: slotsError
      }
    });
    
  } catch (error) {
    console.error('💥 Test failed:', error);
    return res.status(500).json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    });
  }
};
