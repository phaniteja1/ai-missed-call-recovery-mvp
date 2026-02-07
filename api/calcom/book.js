/**
 * Cal.com Booking Creation Endpoint
 * 
 * Create a new appointment booking via Cal.com.
 * This endpoint can be used by:
 * - VAPI assistant during calls (via function calling)
 * - Frontend booking widget
 * - External integrations
 * 
 * URL: /api/calcom/book
 * Method: POST
 * Body: 
 *   - businessId (required): Business UUID
 *   - name (required): Customer name
 *   - email (required): Customer email
 *   - phone (optional): Customer phone
 *   - start (required): Appointment start time (ISO 8601)
 *   - notes (optional): Additional notes
 *   - callId (optional): Related call ID for tracking
 * 
 * Authentication: 
 * - For now, uses businessId from body
 * - TODO: Add proper API key or JWT authentication
 */

const { createCalcomBooking } = require('../../lib/calcom');
const { createBooking } = require('../../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { businessId, name, email, phone, start, notes, callId } = req.body;

    // Validate required parameters
    if (!businessId) {
      return res.status(400).json({
        error: 'Missing businessId',
        message: 'businessId is required'
      });
    }

    if (!name) {
      return res.status(400).json({
        error: 'Missing name',
        message: 'Customer name is required'
      });
    }

    if (!email) {
      return res.status(400).json({
        error: 'Missing email',
        message: 'Customer email is required'
      });
    }

    if (!start) {
      return res.status(400).json({
        error: 'Missing start time',
        message: 'Appointment start time is required (ISO 8601 format)'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email',
        message: 'Please provide a valid email address'
      });
    }

    // Validate start time format (ISO 8601)
    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid start time',
        message: 'start must be a valid ISO 8601 date-time string'
      });
    }

    // Check if appointment is in the future
    if (startDate < new Date()) {
      return res.status(400).json({
        error: 'Invalid start time',
        message: 'Appointment must be in the future'
      });
    }

    console.log('✨ Creating booking:', {
      businessId,
      name,
      email,
      start: startDate.toISOString()
    });

    // Create booking in Cal.com
    const calcomBooking = await createCalcomBooking(businessId, {
      name,
      email,
      phone,
      start: startDate.toISOString(),
      notes: notes || 'Booked via AI call assistant'
    });

    console.log('✅ Cal.com booking created:', calcomBooking.uid);

    // Get business's Cal.com event type and other details
    const { getCalcomCredentials } = require('../../lib/supabase');
    const credentials = await getCalcomCredentials(businessId);

    // Store booking in our database
    const dbBooking = await createBooking({
      business_id: businessId,
      call_id: callId || null,
      calcom_booking_id: calcomBooking.id,
      calcom_uid: calcomBooking.uid,
      calcom_event_type_id: credentials.calcom_event_type_id,
      customer_name: name,
      customer_email: email,
      customer_phone: phone || null,
      scheduled_at: startDate.toISOString(),
      duration_minutes: calcomBooking.duration || 30,
      status: 'confirmed',
      notes: notes || null
    });

    console.log('✅ Booking stored in database:', dbBooking.id);

    // Format response
    const formattedDateTime = startDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: credentials.timezone || 'America/New_York'
    });

    return res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: dbBooking.id,
        calcomUid: calcomBooking.uid,
        customerName: name,
        customerEmail: email,
        scheduledAt: startDate.toISOString(),
        scheduledAtFormatted: formattedDateTime,
        duration: calcomBooking.duration || 30,
        status: 'confirmed',
        confirmationUrl: calcomBooking.confirmationUrl || null,
        rescheduleUrl: calcomBooking.rescheduleUrl || null,
        cancelUrl: calcomBooking.cancelUrl || null
      }
    });

  } catch (error) {
    console.error('❌ Error creating booking:', error);

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

    if (error.response?.status === 409) {
      return res.status(409).json({
        error: 'Time slot unavailable',
        message: 'This time slot is no longer available. Please choose another time.'
      });
    }

    if (error.response?.status === 400) {
      return res.status(400).json({
        error: 'Invalid booking data',
        message: error.response?.data?.message || 'The booking data provided is invalid'
      });
    }

    // Generic error
    return res.status(500).json({
      error: 'Failed to create booking',
      message: error.message
    });
  }
};
