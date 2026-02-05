/**
 * Speech Input Handler
 * 
 * Processes speech input gathered from the caller
 */

const twilio = require('twilio');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      CallSid,
      SpeechResult,
      Confidence
    } = req.body;

    // Log speech recognition result
    console.log('🗣️ Speech recognized:', {
      callSid: CallSid,
      speech: SpeechResult,
      confidence: Confidence,
      timestamp: new Date().toISOString()
    });

    const twiml = new twilio.twiml.VoiceResponse();

    // TODO: Add AI processing here (OpenAI, Claude, etc.)
    // For now, acknowledge and offer voicemail
    
    twiml.say({
      voice: 'Polly.Joanna'
    }, `I heard you say: ${SpeechResult}. Let me record a message for you.`);

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
    }, 'Thank you. Goodbye!');
    
    twiml.hangup();

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());

  } catch (error) {
    console.error('❌ Error handling speech:', error);
    
    const errorTwiml = new twilio.twiml.VoiceResponse();
    errorTwiml.say({
      voice: 'Polly.Joanna'
    }, 'Sorry, there was an error. Please try again.');
    errorTwiml.hangup();
    
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(errorTwiml.toString());
  }
};
