/**
 * Health Check Endpoint
 * 
 * Simple status endpoint to verify the service is running
 */

module.exports = async (req, res) => {
  return res.status(200).json({
    status: 'ok',
    service: 'AI Missed Call Recovery MVP',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    endpoints: {
      webhook: '/api/webhook',
      handleSpeech: '/api/handle-speech',
      handleRecording: '/api/handle-recording',
      transcription: '/api/transcription',
      status: '/api/status'
    }
  });
};
