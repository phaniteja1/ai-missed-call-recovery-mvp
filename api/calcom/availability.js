/**
 * Cal.com Availability Check Endpoint
 * 
 * Check available appointment slots for a business.
 * This endpoint can be used by:
 * - VAPI assistant during calls (via function calling)
 * - Frontend dashboard/booking widget
 * - External integrations
 * 
 * URL: /api/calcom/availability
 * Method: GET
 * Query params: 
 *   - businessId (required): Business UUID
 *   - date (required): Date to check (YYYY-MM-DD)
 *   - timePreference (optional): 'morning', 'afternoon', 'evening', 'any'
 * 
 * Authentication: 
 * - For now, uses businessId from query
 * - TODO: Add proper API key or JWT authentication
 */

const { checkAvailability } = require('../../lib/calcom');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { businessId, date, timePreference = 'any' } = req.query;

    // Validate required parameters
    if (!businessId) {
      return res.status(400).json({
        error: 'Missing businessId parameter',
        message: 'businessId is required'
      });
    }

    if (!date) {
      return res.status(400).json({
        error: 'Missing date parameter',
        message: 'date is required (format: YYYY-MM-DD)'
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'date must be in YYYY-MM-DD format'
      });
    }

    // Validate timePreference
    const validTimePreferences = ['morning', 'afternoon', 'evening', 'any'];
    if (!validTimePreferences.includes(timePreference)) {
      return res.status(400).json({
        error: 'Invalid timePreference',
        message: `timePreference must be one of: ${validTimePreferences.join(', ')}`
      });
    }

    console.log('📅 Checking availability:', {
      businessId,
      date,
      timePreference
    });

    // Check availability via Cal.com
    const slots = await checkAvailability(businessId, date, timePreference);

    // Format response
    const formattedSlots = slots.map(slot => {
      const dateTime = new Date(slot);
      return {
        iso: slot,
        time: dateTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        date: dateTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
      };
    });

    console.log(`✅ Found ${slots.length} available slots`);

    return res.status(200).json({
      success: true,
      date,
      timePreference,
      availableSlots: formattedSlots,
      count: formattedSlots.length
    });

  } catch (error) {
    console.error('❌ Error checking availability:', error);

    // Handle specific errors
    if (error.message.includes('not connected to Cal.com')) {
      return res.status(400).json({
        error: 'Business not connected',
        message: 'This business has not connected their Cal.com account'
      });
    }

    if (error.message.includes('No default event type')) {
      return res.status(400).json({
        error: 'Configuration incomplete',
        message: 'Business needs to configure a default event type'
      });
    }

    // Generic error
    return res.status(500).json({
      error: 'Failed to check availability',
      message: error.message
    });
  }
};
