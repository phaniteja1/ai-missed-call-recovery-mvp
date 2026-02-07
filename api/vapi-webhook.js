/**
 * Vapi Event Webhook Handler with Database Persistence
 * 
 * Receives events from Vapi AI during and after calls and persists
 * them to Supabase for multi-tenant analytics and Cal.com integration.
 * 
 * Configure this URL in your Vapi dashboard under "Server URL".
 * 
 * Events handled:
 * - assistant-request: When call starts (can return custom assistant config)
 * - status-update: Call status changes (ringing, in-progress, ended)
 * - transcript: Real-time conversation transcript
 * - function-call: When assistant wants to call a function (e.g., book appointment)
 * - end-of-call-report: Final call summary and analytics
 * 
 * Vapi Webhook Docs: https://docs.vapi.ai/server-url
 */

const {
  getBusinessByPhone,
  upsertCall,
  insertTranscript,
  createBooking
} = require('../lib/supabase');

// Counter for transcript sequence numbers (per call)
const transcriptSequences = new Map();

/**
 * Main webhook handler for Vapi events
 * @param {Request} req - Vercel request object
 * @param {Response} res - Vercel response object
 */
module.exports = async (req, res) => {
  // Only accept POST requests from Vapi
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const eventType = event.message?.type || 'unknown';

    console.log('🔔 Vapi event received:', {
      type: eventType,
      callId: event.message?.call?.id,
      timestamp: new Date().toISOString()
    });

    // Handle different event types
    switch (eventType) {
      case 'assistant-request':
        return await handleAssistantRequest(event, res);
      
      case 'status-update':
        return await handleStatusUpdate(event, res);
      
      case 'transcript':
        return await handleTranscript(event, res);
      
      case 'function-call':
        return await handleFunctionCall(event, res);
      
      case 'end-of-call-report':
        return await handleEndOfCallReport(event, res);
      
      default:
        console.log('ℹ️ Unhandled event type:', eventType);
        return res.status(200).json({ received: true });
    }

  } catch (error) {
    console.error('❌ Error handling Vapi webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Handle assistant-request event
 * Called when Vapi needs assistant configuration
 * Return custom assistant config with Cal.com booking functions
 */
async function handleAssistantRequest(event, res) {
  const { call } = event.message;
  
  console.log('🤖 Assistant requested for call:', call?.id);

  try {
    // Look up business by phone number to customize assistant
    const business = await getBusinessByPhone(call?.phoneNumber?.number);
    
    if (!business) {
      console.warn('⚠️ Business not found for phone:', call?.phoneNumber?.number);
      // Return default assistant config
      return res.status(200).json({
        assistant: getDefaultAssistantConfig()
      });
    }

    console.log('✅ Found business:', business.name);

    // Create initial call record
    await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: call?.phoneNumber?.number || 'unknown',
      status: 'queued',
      direction: 'inbound',
      metadata: {
        vapi_call: call
      }
    });

    // Check if Cal.com is connected via business_integrations
    const { getCalcomCredentials } = require('../lib/supabase');
    const calcomIntegration = await getCalcomCredentials(business.id);
    const hasCalcom = calcomIntegration && calcomIntegration.access_token;

    // Return assistant config with booking functions if Cal.com is connected
    const assistantConfig = hasCalcom
      ? getAssistantConfigWithBooking(business)
      : getDefaultAssistantConfig();

    return res.status(200).json({ assistant: assistantConfig });

  } catch (error) {
    console.error('❌ Error in assistant-request:', error);
    return res.status(200).json({
      assistant: getDefaultAssistantConfig()
    });
  }
}

/**
 * Handle status-update event
 * Track call lifecycle and persist status changes
 */
async function handleStatusUpdate(event, res) {
  const { call, status } = event.message;
  
  console.log('📊 Call status update:', {
    callId: call?.id,
    status: status,
    from: call?.customer?.number
  });

  try {
    // Find business for this call
    const business = await getBusinessByPhone(call?.phoneNumber?.number);
    if (!business) {
      console.warn('⚠️ Business not found for status update');
      return res.status(200).json({ received: true });
    }

    // Update call status
    await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: call?.phoneNumber?.number || 'unknown',
      status: mapVapiStatus(status),
      started_at: call?.startedAt ? new Date(call.startedAt).toISOString() : null,
      metadata: {
        vapi_status: status
      }
    });

    console.log('✅ Call status updated in database');

  } catch (error) {
    console.error('❌ Error updating call status:', error);
  }

  return res.status(200).json({ received: true });
}

/**
 * Handle transcript event
 * Store real-time conversation in database
 */
async function handleTranscript(event, res) {
  const { call, transcript, role } = event.message;
  
  console.log('💬 Transcript:', {
    callId: call?.id,
    role: role,
    text: transcript?.substring(0, 100) + '...'
  });

  try {
    // Find business for this call
    const business = await getBusinessByPhone(call?.phoneNumber?.number);
    if (!business) {
      console.warn('⚠️ Business not found for transcript');
      return res.status(200).json({ received: true });
    }

    // Get or create the call record
    const callRecord = await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: call?.phoneNumber?.number || 'unknown'
    });

    // Track sequence number for this call
    const callKey = call?.id;
    if (!transcriptSequences.has(callKey)) {
      transcriptSequences.set(callKey, 0);
    }
    const sequence = transcriptSequences.get(callKey);
    transcriptSequences.set(callKey, sequence + 1);

    // Insert transcript
    await insertTranscript(
      callRecord.id,
      role === 'user' ? 'user' : 'assistant',
      transcript,
      sequence
    );

    console.log('✅ Transcript saved to database');

  } catch (error) {
    console.error('❌ Error saving transcript:', error);
  }

  return res.status(200).json({ received: true });
}

/**
 * Handle function-call event
 * Execute custom functions like checking availability or booking appointments
 */
async function handleFunctionCall(event, res) {
  const { call, functionCall } = event.message;
  const { name, parameters } = functionCall;
  
  console.log('🔧 Function call requested:', {
    callId: call?.id,
    function: name,
    parameters: parameters
  });

  try {
    // Find business for this call
    const business = await getBusinessByPhone(call?.phoneNumber?.number);
    if (!business) {
      return res.status(200).json({
        error: 'Business not configured for bookings'
      });
    }

    // Route to appropriate function handler
    switch (name) {
      case 'checkAvailability':
        return await handleCheckAvailability(business, parameters, res);
      
      case 'createBooking':
        return await handleCreateBooking(business, call, parameters, res);
      
      default:
        console.warn('⚠️ Unknown function:', name);
        return res.status(200).json({
          error: `Function ${name} not implemented`
        });
    }

  } catch (error) {
    console.error('❌ Error executing function:', error);
    return res.status(200).json({
      error: 'Failed to execute function',
      message: error.message
    });
  }
}

/**
 * Handle end-of-call-report event
 * Store comprehensive call analytics and summary
 */
async function handleEndOfCallReport(event, res) {
  const { call, endedReason, summary, transcript, recording, analysis } = event.message;
  
  console.log('📋 End of call report:', {
    callId: call?.id,
    duration: call?.duration,
    endedReason: endedReason
  });

  try {
    // Find business for this call
    const business = await getBusinessByPhone(call?.phoneNumber?.number);
    if (!business) {
      console.warn('⚠️ Business not found for end-of-call report');
      return res.status(200).json({ received: true });
    }

    // Get or create the call record
    const callRecord = await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: call?.phoneNumber?.number || 'unknown',
      status: 'completed',
      started_at: call?.startedAt ? new Date(call.startedAt).toISOString() : null,
      ended_at: call?.endedAt ? new Date(call.endedAt).toISOString() : null,
      duration_seconds: call?.duration || null,
      ended_reason: endedReason,
      recording_url: recording?.url,
      full_transcript: transcript,
      summary: summary,
      sentiment: analysis?.sentiment || null,
      intent: analysis?.intent || extractIntent(summary, transcript),
      metadata: {
        vapi_analysis: analysis,
        vapi_call: call
      }
    });

    console.log('✅ Call record finalized in database');

    // Clean up transcript sequence tracking
    transcriptSequences.delete(call?.id);

    // TODO: Trigger follow-up actions
    // - Send notification if booking wasn't created but customer showed interest
    // - Send summary email to business owner
    // - Update CRM with call notes

  } catch (error) {
    console.error('❌ Error saving end-of-call report:', error);
  }

  return res.status(200).json({ received: true });
}

/**
 * Check availability via Cal.com API
 * This will be called by the assistant during the conversation
 */
async function handleCheckAvailability(business, parameters, res) {
  const { date, timePreference } = parameters;
  
  console.log('📅 Checking availability:', { date, timePreference });

  try {
    // Import Cal.com helper (to be created)
    const { checkAvailability } = require('../lib/calcom');
    
    const slots = await checkAvailability(
      business.id,
      date,
      timePreference
    );

    if (slots && slots.length > 0) {
      const formattedSlots = slots.slice(0, 3).map(slot => {
        const time = new Date(slot).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        return time;
      });

      return res.status(200).json({
        result: `I have availability at: ${formattedSlots.join(', ')}. Which time works best for you?`,
        slots: slots
      });
    } else {
      return res.status(200).json({
        result: `I don't have any availability on ${date}. Would you like to try another date?`
      });
    }

  } catch (error) {
    console.error('❌ Error checking availability:', error);
    return res.status(200).json({
      error: 'Unable to check availability at this time'
    });
  }
}

/**
 * Create booking via Cal.com API
 * This will be called by the assistant when customer confirms a time
 */
async function handleCreateBooking(business, call, parameters, res) {
  const { name, email, phone, dateTime, notes } = parameters;
  
  console.log('✨ Creating booking:', { name, email, dateTime });

  try {
    // Import Cal.com helper (to be created)
    const { createCalcomBooking } = require('../lib/calcom');
    
    const calcomBooking = await createCalcomBooking(
      business.id,
      {
        name,
        email,
        phone: phone || call?.customer?.number,
        start: dateTime,
        notes: notes || `Booked via AI call assistant`
      }
    );

    // Get the call record
    const callRecord = await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: call?.phoneNumber?.number || 'unknown'
    });

    // Get Cal.com integration to get event_type_id
    const { getCalcomCredentials } = require('../lib/supabase');
    const calcomIntegration = await getCalcomCredentials(business.id);
    const eventTypeId = calcomIntegration?.config?.event_type_id || null;

    // Store booking in database
    await createBooking({
      business_id: business.id,
      call_id: callRecord.id,
      calcom_booking_id: calcomBooking.id,
      calcom_uid: calcomBooking.uid,
      calcom_event_type_id: eventTypeId,
      customer_name: name,
      customer_email: email,
      customer_phone: phone || call?.customer?.number,
      scheduled_at: new Date(dateTime).toISOString(),
      duration_minutes: 30,
      status: 'confirmed',
      notes: notes
    });

    console.log('✅ Booking created successfully');

    const formattedTime = new Date(dateTime).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return res.status(200).json({
      result: `Perfect! I've scheduled your appointment for ${formattedTime}. You'll receive a confirmation email at ${email} with all the details. Is there anything else I can help you with?`
    });

  } catch (error) {
    console.error('❌ Error creating booking:', error);
    return res.status(200).json({
      error: 'Unable to create booking. Let me transfer you to someone who can help.'
    });
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get default assistant configuration (no booking functions)
 */
function getDefaultAssistantConfig() {
  return {
    model: {
      provider: 'openai',
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a friendly and professional AI assistant handling incoming calls.

Your goals:
1. Greet the caller warmly
2. Ask how you can help them today
3. Listen actively and respond naturally
4. Collect their contact information if they want a callback
5. Provide helpful information about our services
6. Thank them for calling before ending

Be conversational, empathetic, and efficient. Keep responses concise (1-2 sentences max).`
        }
      ],
      temperature: 0.7,
      maxTokens: 150
    },
    voice: {
      provider: '11labs',
      voiceId: '21m00Tcm4TlvDq8ikWAM' // Rachel - warm, professional
    },
    firstMessage: "Hello! Thanks for calling. How can I help you today?",
    endCallMessage: "Thank you for calling! Have a great day.",
    recordingEnabled: true
  };
}

/**
 * Get assistant configuration with Cal.com booking functions
 */
function getAssistantConfigWithBooking(business) {
  return {
    model: {
      provider: 'openai',
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a friendly AI scheduling assistant for ${business.name}.

Your goals:
1. Greet the caller warmly
2. Ask if they'd like to schedule an appointment
3. Check availability using the checkAvailability function
4. Collect: full name, email, phone number, and preferred date/time
5. Create the booking using createBooking function
6. Confirm the appointment details
7. Thank them for calling

Be conversational and helpful. Guide them through booking smoothly.`
        }
      ],
      temperature: 0.7,
      maxTokens: 200
    },
    voice: {
      provider: '11labs',
      voiceId: '21m00Tcm4TlvDq8ikWAM'
    },
    firstMessage: `Hello! Thanks for calling ${business.name}. Would you like to schedule an appointment today?`,
    endCallMessage: "Thank you for calling! We look forward to seeing you.",
    recordingEnabled: true,
    functions: [
      {
        name: 'checkAvailability',
        description: 'Check available appointment times for a given date',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date to check availability (YYYY-MM-DD format)'
            },
            timePreference: {
              type: 'string',
              enum: ['morning', 'afternoon', 'evening', 'any'],
              description: 'Preferred time of day'
            }
          },
          required: ['date']
        }
      },
      {
        name: 'createBooking',
        description: 'Create an appointment booking',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Customer full name'
            },
            email: {
              type: 'string',
              description: 'Customer email address'
            },
            phone: {
              type: 'string',
              description: 'Customer phone number'
            },
            dateTime: {
              type: 'string',
              description: 'Appointment date and time (ISO 8601 format)'
            },
            notes: {
              type: 'string',
              description: 'Additional notes or reason for appointment'
            }
          },
          required: ['name', 'email', 'dateTime']
        }
      }
    ]
  };
}

/**
 * Map Vapi status to our database status enum
 */
function mapVapiStatus(vapiStatus) {
  const statusMap = {
    'queued': 'queued',
    'ringing': 'ringing',
    'in-progress': 'in-progress',
    'forwarding': 'in-progress',
    'ended': 'completed'
  };
  return statusMap[vapiStatus] || vapiStatus;
}

/**
 * Extract intent from conversation (simple keyword matching)
 * TODO: Use GPT-4 for better intent classification
 */
function extractIntent(summary, transcript) {
  const text = `${summary || ''} ${transcript || ''}`.toLowerCase();
  
  if (text.includes('appointment') || text.includes('schedule') || text.includes('book')) {
    return 'booking';
  }
  if (text.includes('question') || text.includes('information') || text.includes('how')) {
    return 'inquiry';
  }
  if (text.includes('problem') || text.includes('issue') || text.includes('complaint')) {
    return 'complaint';
  }
  if (text.includes('cancel') || text.includes('reschedule')) {
    return 'modification';
  }
  
  return 'general';
}
