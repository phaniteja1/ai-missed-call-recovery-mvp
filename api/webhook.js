/**
 * Twilio Voice Webhook Handler with Vapi AI Integration
 * 
 * This endpoint receives incoming voice calls from Twilio and forwards them to Vapi AI.
 * Configure this URL as your Twilio phone number's voice webhook.
 * 
 * Flow:
 * 1. Twilio receives call → POST to this webhook
 * 2. We initiate a Vapi Web Call via API
 * 3. Return TwiML <Connect><Stream> to bridge Twilio ↔ Vapi
 * 4. Vapi handles the AI conversation
 * 5. Call events sent to /api/vapi-webhook
 */

const twilio = require('twilio');

/**
 * Main webhook handler for incoming Twilio voice calls
 * Forwards call to Vapi AI assistant
 * 
 * @param {Request} req - Vercel request object
 * @param {Response} res - Vercel response object
 */
module.exports = async (req, res) => {
  // Only accept POST requests from Twilio
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate the request is from Twilio (recommended for production)
    const twilioSignature = req.headers['x-twilio-signature'];
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (authToken && twilioSignature) {
      const url = `https://${req.headers.host}${req.url}`;
      const isValid = twilio.validateRequest(
        authToken,
        twilioSignature,
        url,
        req.body
      );
      
      if (!isValid) {
        console.error('❌ Invalid Twilio signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    // Extract call details from Twilio webhook payload
    const {
      CallSid,
      From,
      To,
      CallStatus,
      Direction,
      CallerCity,
      CallerState,
      CallerCountry
    } = req.body;

    // Log incoming call details
    console.log('📞 Incoming call:', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus,
      direction: Direction,
      location: `${CallerCity}, ${CallerState}, ${CallerCountry}`,
      timestamp: new Date().toISOString()
    });

    // Check Vapi configuration
    const vapiApiKey = process.env.VAPI_API_KEY;
    const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;
    
    if (!vapiApiKey) {
      console.error('❌ VAPI_API_KEY not configured');
      return sendErrorResponse(res, 'Service configuration error. Please contact support.');
    }

    // Initiate Vapi Web Call
    console.log('🤖 Initiating Vapi AI call...');
    
    const vapiCallResponse = await fetch('https://api.vapi.ai/call/web', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: vapiAssistantId, // Uses default assistant if not specified
        metadata: {
          twilioCallSid: CallSid,
          callerNumber: From,
          twilioNumber: To,
          callerLocation: `${CallerCity}, ${CallerState}`,
          timestamp: new Date().toISOString()
        },
        // Optional: Provide assistant configuration inline (overrides assistantId)
        // assistant: {
        //   model: {
        //     provider: "openai",
        //     model: "gpt-4",
        //     messages: [{
        //       role: "system",
        //       content: "You are a friendly AI assistant handling incoming calls..."
        //     }]
        //   },
        //   voice: {
        //     provider: "11labs",
        //     voiceId: "21m00Tcm4TlvDq8ikWAM" // Rachel
        //   }
        // }
      })
    });

    if (!vapiCallResponse.ok) {
      const errorData = await vapiCallResponse.text();
      console.error('❌ Vapi API error:', errorData);
      return sendErrorResponse(res, 'AI service temporarily unavailable. Please try again.');
    }

    const vapiCall = await vapiCallResponse.json();
    console.log('✅ Vapi call initiated:', vapiCall.id);

    // Create TwiML response to connect Twilio to Vapi via WebSocket
    const twiml = new twilio.twiml.VoiceResponse();
    
    const connect = twiml.connect();
    const stream = connect.stream({
      url: vapiCall.webCallUrl // Vapi WebSocket URL
    });

    // Return TwiML to establish the WebSocket connection
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());

  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    return sendErrorResponse(res, 'We are experiencing technical difficulties. Please try again later.');
  }
};

/**
 * Helper function to send error TwiML response
 * @param {Response} res - Vercel response object
 * @param {string} message - Error message to speak
 */
function sendErrorResponse(res, message) {
  const errorTwiml = new twilio.twiml.VoiceResponse();
  errorTwiml.say({
    voice: 'Polly.Joanna'
  }, message);
  errorTwiml.hangup();
  
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(errorTwiml.toString());
}
