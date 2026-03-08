/**
 * VAPI Event Webhook Handler
 * 
 * Receives events from VAPI AI during and after calls.
 * Uses modular prompt and config builders for easy customization.
 * 
 * Configure this URL in your VAPI dashboard under "Server URL".
 * 
 * Events handled:
 * - assistant-request: When call starts (returns custom assistant config)
 * - status-update: Call status changes
 * - transcript: Real-time conversation
 * - function-call: AI function execution
 * - tool-calls: AI tool/function execution (current Vapi event)
 * - end-of-call-report: Final analytics
 * 
 * VAPI Webhook Docs: https://docs.vapi.ai/server-url
 */

const {
  getBusinessByPhone,
  upsertCall,
  insertTranscript,
  createBooking,
  getCalcomCredentials
} = require('../lib/supabase');

const {
  buildAssistantConfig,
  buildDefaultConfig,
  buildBookingConfig,
  ASSISTANT_TYPES
} = require('../lib/vapi');

// Transcript sequence tracking (in-memory, per-instance)
const transcriptSequences = new Map();

/**
 * Main webhook handler
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const eventType = event.message?.type || 'unknown';

    console.log('🔔 VAPI Event:', {
      type: eventType,
      callId: event.message?.call?.id,
      timestamp: new Date().toISOString()
    });

    switch (eventType) {
      case 'assistant-request':
        return await handleAssistantRequest(event, res);
      
      case 'status-update':
        return await handleStatusUpdate(event, res);
      
      case 'transcript':
        return await handleTranscript(event, res);
      
      case 'function-call':
        return await handleFunctionCall(event, res);

      case 'tool-calls':
        return await handleToolCalls(event, res);
      
      case 'end-of-call-report':
        return await handleEndOfCallReport(event, res);
      
      default:
        console.log('ℹ️ Unhandled event type:', eventType);
        return res.status(200).json({ received: true });
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Check if this is a test call (should skip DB operations)
 */
function isTestCall(call) {
  const callId = call?.id || '';
  return callId.startsWith('test-') || callId.startsWith('debug-');
}

/**
 * Handle assistant-request: Return dynamic assistant configuration
 */
async function handleAssistantRequest(event, res) {
  const { call } = event.message;
  
  const phoneNumber = getBusinessPhoneNumber(call, event.message);
  const testMode = isTestCall(call);
  
  console.log('🤖 Assistant request for phone:', phoneNumber, testMode ? '(TEST MODE - no DB write)' : '');

  try {
    // Look up business
    const business = await getBusinessByPhone(phoneNumber);
    
    if (!business) {
      console.warn('⚠️ Business not found:', phoneNumber);
      return res.status(200).json({
        assistant: buildDefaultConfig()
      });
    }

    console.log('✅ Found business:', business.name);

    // Only create call record for real calls (not test calls)
    if (!testMode) {
      await upsertCall({
        business_id: business.id,
        vapi_call_id: call?.id,
        customer_phone: call?.customer?.number,
        from_phone: call?.customer?.number || 'unknown',
        to_phone: phoneNumber || 'unknown',
        status: 'queued',
        direction: 'inbound',
        metadata: { vapi_call: call }
      });
    } else {
      console.log('🧪 Test call - skipping DB insert');
    }

    // Check Cal.com integration
    const calcomIntegration = await getCalcomCredentials(business.id);
    const hasCalcom = !!(business.calcom_enabled && calcomIntegration?.access_token);

    // Build appropriate config
    // TODO: Get voice preference from business.ai_config in the future
    const voiceOptions = {
      voicePreset: 'tara',
      appointmentHandlingEnabled: business.appointment_handling_enabled
    }; // Using Tara (VAPI voice) as default
    
    let config;
    if (hasCalcom) {
      config = buildBookingConfig(business, calcomIntegration, voiceOptions);
      console.log('✅ Booking config generated with Cal.com + Tara voice');
    } else {
      config = buildAssistantConfig(business, {
        type: ASSISTANT_TYPES.BASIC,
        enableBooking: false,
        enableCallback: business.appointment_handling_enabled,
        ...voiceOptions
      });
      console.log('✅ Basic config generated with Tara voice');
    }

    // Debug: Log the generated prompt (remove in production)
    console.log('📝 Generated prompt preview:', 
      config.model.messages[0].content.substring(0, 100) + '...'
    );

    return res.status(200).json({ assistant: config });

  } catch (error) {
    console.error('❌ Error building assistant config:', error);
    return res.status(200).json({
      assistant: buildDefaultConfig()
    });
  }
}

/**
 * Handle status-update: Track call lifecycle
 */
async function handleStatusUpdate(event, res) {
  const { call, status } = event.message;
  const phoneNumber = getBusinessPhoneNumber(call, event.message);
  const testMode = isTestCall(call);

  console.log('📊 Status update:', { callId: call?.id, status, testMode });

  try {
    const business = await getBusinessByPhone(phoneNumber);
    if (!business) {
      return res.status(200).json({ received: true });
    }

    if (testMode) {
      console.log('🧪 Test call - skipping DB update');
      return res.status(200).json({ received: true });
    }

    await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: phoneNumber || 'unknown',
      status: mapVapiStatus(status),
      started_at: call?.startedAt ? new Date(call.startedAt).toISOString() : null,
      metadata: { vapi_status: status }
    });

  } catch (error) {
    console.error('❌ Error updating status:', error);
  }

  return res.status(200).json({ received: true });
}

/**
 * Handle transcript: Store conversation
 */
async function handleTranscript(event, res) {
  const { call, transcript, role } = event.message;
  const phoneNumber = getBusinessPhoneNumber(call, event.message);
  const testMode = isTestCall(call);

  console.log('💬 Transcript:', { 
    callId: call?.id, 
    role,
    text: transcript?.substring(0, 50) + '...',
    testMode
  });

  try {
    const business = await getBusinessByPhone(phoneNumber);
    if (!business) {
      return res.status(200).json({ received: true });
    }

    if (testMode) {
      console.log('🧪 Test call - skipping DB insert');
      return res.status(200).json({ received: true });
    }

    const callRecord = await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: phoneNumber || 'unknown'
    });

    // Track sequence
    const callKey = call?.id;
    const sequence = (transcriptSequences.get(callKey) || 0) + 1;
    transcriptSequences.set(callKey, sequence);

    await insertTranscript(
      callRecord.id,
      role === 'user' ? 'user' : 'assistant',
      transcript,
      sequence
    );

  } catch (error) {
    console.error('❌ Error saving transcript:', error);
  }

  return res.status(200).json({ received: true });
}

/**
 * Execute booking/callback logic for a single tool or function call
 */
async function executeFunctionCall(call, message, name, parameters) {
  const phoneNumber = getBusinessPhoneNumber(call, message);
  const business = await getBusinessByPhone(phoneNumber);

  if (!business) {
    console.error('❌ Business not found for phone:', phoneNumber);
    return {
      error: 'Business not configured',
      result: "I can't access the booking system right now. Let me take a message."
    };
  }

  console.log('✅ Business found:', business.name);

  if (name === 'checkAvailability' || name === 'createBooking') {
    if (!business.calcom_enabled) {
      console.log('⚠️ calcom_enabled is false');
      return {
        result: "Scheduling isn't available right now. Can I take a message for you?"
      };
    }

    const calcomIntegration = await getCalcomCredentials(business.id);
    if (!calcomIntegration?.access_token) {
      console.log('⚠️ No Cal.com access token');
      return {
        result: "Scheduling isn't available right now. Can I take a message for you?"
      };
    }

    console.log('✅ Cal.com ready');
  }

  switch (name) {
    case 'checkAvailability':
      return await handleCheckAvailability(business, parameters);

    case 'createBooking':
      return await handleCreateBooking(business, call, parameters);

    case 'scheduleCallback':
      return {
        result: "I've noted your request for a callback. Someone will contact you soon."
      };

    default:
      console.warn('⚠️ Unknown function:', name);
      return {
        error: `Function ${name} not implemented`,
        result: "I can't perform that action."
      };
  }
}

/**
 * Handle function-call: backward-compatible execution path
 */
async function handleFunctionCall(event, res) {
  const { call, functionCall } = event.message;
  const { name, parameters } = functionCall;
  const callId = call?.id;

  console.log('🔧 FUNCTION CALL:', { callId, name, parameters, timestamp: new Date().toISOString() });

  try {
    const payload = await executeFunctionCall(call, event.message, name, parameters);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('❌ Function call error:', error);
    return res.status(200).json({
      error: error.message,
      result: "I encountered an error. Let me take a message."
    });
  }
}

function getToolCallName(toolCall) {
  return toolCall?.name
    || toolCall?.function?.name
    || toolCall?.tool?.name
    || toolCall?.tool?.function?.name
    || toolCall?.toolCall?.name
    || toolCall?.toolCall?.function?.name;
}

function getToolCallParameters(toolCall) {
  const rawParameters = toolCall?.parameters
    || toolCall?.arguments
    || toolCall?.function?.arguments
    || toolCall?.function?.parameters
    || toolCall?.tool?.arguments
    || toolCall?.tool?.parameters
    || toolCall?.tool?.function?.arguments
    || toolCall?.tool?.function?.parameters
    || toolCall?.toolCall?.arguments
    || toolCall?.toolCall?.parameters
    || toolCall?.toolCall?.function?.arguments
    || toolCall?.toolCall?.function?.parameters
    || {};

  if (typeof rawParameters !== 'string') {
    return rawParameters;
  }

  try {
    return JSON.parse(rawParameters);
  } catch (error) {
    console.warn('⚠️ Failed to parse tool-call arguments as JSON:', rawParameters);
    return {};
  }
}

/**
 * Handle tool-calls: current Vapi execution path
 */
async function handleToolCalls(event, res) {
  const { call, toolCallList = [] } = event.message;
  const toolNames = toolCallList.map(getToolCallName);

  console.log('🛠️ TOOL CALLS:', {
    callId: call?.id,
    count: toolCallList.length,
    toolNames,
    timestamp: new Date().toISOString()
  });

  console.log('🧾 RAW TOOL CALL PAYLOAD:', JSON.stringify(toolCallList));

  try {
    const results = [];

    for (const toolCall of toolCallList) {
      const name = getToolCallName(toolCall);
      const parameters = getToolCallParameters(toolCall);

      const payload = await executeFunctionCall(call, event.message, name, parameters);
      results.push({
        name,
        toolCallId: toolCall.id,
        result: payload.result || payload.error || JSON.stringify(payload)
      });
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error('❌ Tool call error:', error);
    return res.status(200).json({
      results: toolCallList.map(toolCall => ({
        name: getToolCallName(toolCall),
        toolCallId: toolCall.id,
        result: "I encountered an error. Let me take a message."
      }))
    });
  }
}

/**
 * Handle end-of-call-report: Finalize call data
 */
async function handleEndOfCallReport(event, res) {
  const { call, endedReason, summary, transcript, recording, analysis } = event.message;
  const phoneNumber = getBusinessPhoneNumber(call, event.message);
  const testMode = isTestCall(call);

  console.log('📋 End of call:', { 
    callId: call?.id, 
    duration: call?.duration,
    reason: endedReason,
    testMode
  });

  try {
    const business = await getBusinessByPhone(phoneNumber);
    if (!business) {
      return res.status(200).json({ received: true });
    }

    if (testMode) {
      console.log('🧪 Test call - skipping DB update');
      return res.status(200).json({ received: true });
    }

    await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: phoneNumber || 'unknown',
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

    // Cleanup
    transcriptSequences.delete(call?.id);

  } catch (error) {
    console.error('❌ Error saving end-of-call report:', error);
  }

  return res.status(200).json({ received: true });
}

// ============================================================
// BUSINESS LOGIC HANDLERS
// ============================================================

async function handleCheckAvailability(business, parameters) {
  const { date, timePreference } = parameters;
  
  console.log('📅 Checking availability:', { date, timePreference, business: business.name });

  try {
    const { checkAvailability } = require('../lib/calcom');
    const slots = await checkAvailability(business.id, date, timePreference);

    if (slots?.length > 0) {
      const formatted = slots.slice(0, 3).map(s => 
        new Date(s).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: business.timezone || 'America/New_York'
        })
      );

      return {
        result: `I have availability at: ${formatted.join(', ')}. Which time works best for you?`,
        slots: slots
      };
    } else {
      return {
        result: `I don't have any availability on ${date}. Would you like to try another date?`
      };
    }

  } catch (error) {
    console.error('❌ Availability check failed:', error);
    return {
      error: 'Unable to check availability at this time'
    };
  }
}

async function handleCreateBooking(business, call, parameters) {
  const { name, email, phone, dateTime, notes } = parameters;
  
  console.log('🔧 CREATE BOOKING CALLED:', { 
    name, 
    email, 
    dateTime, 
    business: business.name,
    businessId: business.id,
    calcomEnabled: business.calcom_enabled,
    timestamp: new Date().toISOString()
  });

  try {
    const { createCalcomBooking } = require('../lib/calcom');
    
    console.log('📡 Calling Cal.com API...');
    
    const calcomBooking = await createCalcomBooking(business.id, {
      name,
      email,
      phone: phone || call?.customer?.number,
      start: dateTime,
      notes: notes || `Booked via AI assistant for ${business.name}`
    });
    const scheduledAt = calcomBooking?.start || calcomBooking?.startTime || new Date(dateTime).toISOString();
    
    console.log('✅ BOOKING CREATED SUCCESSFULLY:', {
      bookingId: calcomBooking?.id,
      bookingUid: calcomBooking?.uid,
      startTime: scheduledAt
    });

    // Get or create call record
    const callRecord = await upsertCall({
      business_id: business.id,
      vapi_call_id: call?.id,
      customer_phone: call?.customer?.number,
      from_phone: call?.customer?.number || 'unknown',
      to_phone: getBusinessPhoneNumber(call, event.message) || 'unknown'
    });

    // Get Cal.com integration for event type
    const calcomIntegration = await getCalcomCredentials(business.id);
    
    // Save booking to DB
    await createBooking({
      business_id: business.id,
      call_id: callRecord.id,
      calcom_booking_id: calcomBooking.id,
      calcom_uid: calcomBooking.uid,
      calcom_event_type_id: calcomIntegration?.config?.event_type_id || null,
      customer_name: name,
      customer_email: email,
      customer_phone: phone || call?.customer?.number,
      scheduled_at: scheduledAt,
      duration_minutes: calcomBooking?.lengthInMinutes || calcomBooking?.duration || 30,
      status: 'confirmed',
      notes: notes
    });

    const formattedTime = new Date(scheduledAt).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: business.timezone || 'America/New_York'
    });

    return {
      result: `Perfect! I've scheduled your appointment for ${formattedTime}. You'll receive a confirmation email at ${email}. Is there anything else I can help you with?`
    };

  } catch (error) {
    console.error('❌ BOOKING CREATION FAILED:', {
      error: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      business: business.name,
      timestamp: new Date().toISOString()
    });
    
    return {
      error: `Booking failed: ${error.message}`,
      result: "I wasn't able to complete the booking. Let me take a message and have someone follow up with you."
    };
  }
}

// ============================================================
// HELPERS
// ============================================================

function getBusinessPhoneNumber(call, message = null) {
  // VAPI sends phone number in different locations depending on configuration
  const possibleNumbers = [
    message?.phoneNumber?.number,           // New VAPI format (message level)
    message?.phoneNumber?.twilioPhoneNumber,
    call?.phoneNumber?.twilioPhoneNumber,   // Old formats (call level)
    call?.phoneNumber?.number,
    call?.to?.number,
    call?.to,
  ];
  
  // Find first valid phone number (starts with +)
  for (const num of possibleNumbers) {
    if (num && typeof num === 'string' && num.startsWith('+')) {
      return num;
    }
  }
  
  console.warn('⚠️ Could not extract phone number from VAPI payload');
  return null;
}

function mapVapiStatus(vapiStatus) {
  const map = {
    'queued': 'queued',
    'ringing': 'ringing',
    'in-progress': 'in-progress',
    'forwarding': 'in-progress',
    'ended': 'completed'
  };
  return map[vapiStatus] || vapiStatus;
}

function extractIntent(summary, transcript) {
  const text = `${summary || ''} ${transcript || ''}`.toLowerCase();
  
  if (text.includes('appointment') || text.includes('schedule') || text.includes('book')) {
    return 'booking';
  }
  if (text.includes('question') || text.includes('information')) {
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
