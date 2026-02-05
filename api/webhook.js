/**
 * Twilio Voice Webhook Handler
 * 
 * This endpoint receives incoming voice calls from Twilio and returns TwiML responses.
 * Configure this URL as your Twilio phone number's voice webhook.
 */

const twilio = require('twilio');

/**
 * Main webhook handler for incoming Twilio voice calls
 * @param {Request} req - Vercel request object
 * @param {Response} res - Vercel response object
 */
module.exports = async (req, res) => {
  // Only accept POST requests from Twilio
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate the request is from Twilio (optional but recommended for production)
    const twilioSignature = req.headers['x-twilio-signature'];
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    // For development, you can skip validation by commenting out the block below
    if (authToken && twilioSignature) {
      const url = `https://${req.headers.host}${req.url}`;
      const isValid = twilio.validateRequest(
        authToken,
        twilioSignature,
        url,
        req.body
      );
      
      if (!isValid) {
        console.error('Invalid Twilio signature');
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

    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();

    // Welcome message and gather speech input
    const gather = twiml.gather({
      input: 'speech',
      action: '/api/handle-speech',
      method: 'POST',
      timeout: 5,
      speechTimeout: 'auto',
      language: 'en-US',
      hints: 'support, sales, information, help, speak to someone'
    });

    gather.say({
      voice: 'Polly.Joanna'
    }, 'Hello! Thank you for calling. What can I help you with today?');

    // If no input received, offer to leave a voicemail
    twiml.say({
      voice: 'Polly.Joanna'
    }, "I didn't catch that. Let me connect you with our voicemail system.");
    
    twiml.record({
      action: '/api/handle-recording',
      method: 'POST',
      maxLength: 120,
      transcribe: true,
      transcribeCallback: '/api/transcription',
      playBeep: true
    });

    twiml.say({
      voice: 'Polly.Joanna'
    }, 'Thank you for your message. We will get back to you soon. Goodbye!');
    
    twiml.hangup();

    // Return TwiML response with proper content type
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());

  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    
    // Return a fallback TwiML response even on error
    const errorTwiml = new twilio.twiml.VoiceResponse();
    errorTwiml.say({
      voice: 'Polly.Joanna'
    }, 'We are experiencing technical difficulties. Please try again later.');
    errorTwiml.hangup();
    
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(errorTwiml.toString());
  }
};
