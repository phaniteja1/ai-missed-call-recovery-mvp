/**
 * Vapi Event Webhook Handler
 * 
 * Receives events from Vapi AI during and after calls.
 * Configure this URL in your Vapi dashboard under "Server URL".
 * 
 * Events include:
 * - assistant-request: When call starts (can return custom assistant config)
 * - status-update: Call status changes (ringing, in-progress, ended)
 * - transcript: Real-time conversation transcript
 * - function-call: When assistant wants to call a function
 * - end-of-call-report: Final call summary and analytics
 * 
 * Vapi Webhook Docs: https://docs.vapi.ai/server-url
 */

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
        return handleAssistantRequest(event, res);
      
      case 'status-update':
        return handleStatusUpdate(event, res);
      
      case 'transcript':
        return handleTranscript(event, res);
      
      case 'function-call':
        return handleFunctionCall(event, res);
      
      case 'end-of-call-report':
        return handleEndOfCallReport(event, res);
      
      default:
        console.log('ℹ️ Unhandled event type:', eventType);
        return res.status(200).json({ received: true });
    }

  } catch (error) {
    console.error('❌ Error handling Vapi webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Handle assistant-request event
 * Called when Vapi needs assistant configuration
 * Return custom assistant config or empty object to use default
 */
function handleAssistantRequest(event, res) {
  const { call } = event.message;
  
  console.log('🤖 Assistant requested for call:', call?.id);

  // Option 1: Return empty to use assistantId from webhook.js
  // return res.status(200).json({});

  // Option 2: Return custom assistant configuration
  const assistantConfig = {
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
      voiceId: '21m00Tcm4TlvDq8ikWAM' // Rachel - warm, professional female voice
      // Other options: 'pNInz6obpgDQGcFmaJgB' (Adam - male)
    },
    firstMessage: "Hello! Thanks for calling. How can I help you today?",
    endCallMessage: "Thank you for calling! Have a great day.",
    recordingEnabled: true,
    // Optional: Add function calling for actions like booking appointments
    // functions: [
    //   {
    //     name: 'scheduleCallback',
    //     description: 'Schedule a callback for the customer',
    //     parameters: {
    //       type: 'object',
    //       properties: {
    //         phoneNumber: { type: 'string' },
    //         preferredTime: { type: 'string' }
    //       }
    //     }
    //   }
    // ]
  };

  return res.status(200).json({ assistant: assistantConfig });
}

/**
 * Handle status-update event
 * Track call lifecycle: queued → ringing → in-progress → ended
 */
function handleStatusUpdate(event, res) {
  const { call, status } = event.message;
  
  console.log('📊 Call status update:', {
    callId: call?.id,
    status: status,
    from: call?.customer?.number,
    timestamp: new Date().toISOString()
  });

  // TODO: Store status updates in database for analytics
  // await db.calls.update(call.id, { status, updatedAt: new Date() });

  return res.status(200).json({ received: true });
}

/**
 * Handle transcript event
 * Real-time conversation transcript as it happens
 */
function handleTranscript(event, res) {
  const { call, transcript, role } = event.message;
  
  console.log('💬 Transcript:', {
    callId: call?.id,
    role: role, // 'user' or 'assistant'
    text: transcript,
    timestamp: new Date().toISOString()
  });

  // TODO: Store transcripts for review and training
  // await db.transcripts.create({
  //   callId: call.id,
  //   role,
  //   text: transcript,
  //   timestamp: new Date()
  // });

  return res.status(200).json({ received: true });
}

/**
 * Handle function-call event
 * Execute custom functions when assistant requests them
 */
function handleFunctionCall(event, res) {
  const { call, functionCall } = event.message;
  const { name, parameters } = functionCall;
  
  console.log('🔧 Function call requested:', {
    callId: call?.id,
    function: name,
    parameters: parameters
  });

  // Example: Handle callback scheduling
  if (name === 'scheduleCallback') {
    const { phoneNumber, preferredTime } = parameters;
    
    // TODO: Actually schedule the callback
    // await scheduleService.createCallback({
    //   phoneNumber,
    //   preferredTime,
    //   callId: call.id
    // });

    console.log(`📅 Callback scheduled for ${phoneNumber} at ${preferredTime}`);
    
    return res.status(200).json({
      result: `Callback scheduled successfully for ${preferredTime}. We'll call you back at ${phoneNumber}.`
    });
  }

  // Unknown function
  return res.status(200).json({
    error: `Function ${name} not implemented`
  });
}

/**
 * Handle end-of-call-report event
 * Comprehensive call analytics and summary
 */
function handleEndOfCallReport(event, res) {
  const { call, endedReason, summary, transcript, recording } = event.message;
  
  console.log('📋 End of call report:', {
    callId: call?.id,
    from: call?.customer?.number,
    duration: call?.duration,
    endedReason: endedReason,
    recordingUrl: recording?.url,
    timestamp: new Date().toISOString()
  });

  console.log('📝 Call Summary:', summary);
  console.log('📜 Full Transcript:', transcript);

  // TODO: Store complete call data
  // await db.calls.create({
  //   id: call.id,
  //   customerNumber: call.customer.number,
  //   duration: call.duration,
  //   endedReason,
  //   summary,
  //   transcript,
  //   recordingUrl: recording?.url,
  //   metadata: call.metadata,
  //   createdAt: call.startedAt,
  //   endedAt: call.endedAt
  // });

  // TODO: Send notification or follow-up
  // if (call.metadata?.needsFollowUp) {
  //   await notificationService.sendToTeam({
  //     title: 'Call requires follow-up',
  //     callId: call.id,
  //     summary
  //   });
  // }

  return res.status(200).json({ received: true });
}
