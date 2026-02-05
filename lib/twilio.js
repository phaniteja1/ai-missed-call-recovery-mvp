/**
 * Twilio Helper Utilities
 * 
 * Reusable functions for interacting with Twilio API
 */

const twilio = require('twilio');

/**
 * Get configured Twilio client
 * @returns {import('twilio').Twilio} Twilio client instance
 */
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Missing Twilio credentials in environment variables');
  }

  return twilio(accountSid, authToken);
}

/**
 * Fetch call details from Twilio API
 * @param {string} callSid - The call SID to fetch
 * @returns {Promise<import('twilio/lib/rest/api/v2010/account/call').CallInstance>}
 */
async function getCallDetails(callSid) {
  const client = getTwilioClient();
  return await client.calls(callSid).fetch();
}

/**
 * Fetch recording details and audio URL
 * @param {string} recordingSid - The recording SID to fetch
 * @returns {Promise<import('twilio/lib/rest/api/v2010/account/recording').RecordingInstance>}
 */
async function getRecording(recordingSid) {
  const client = getTwilioClient();
  return await client.recordings(recordingSid).fetch();
}

/**
 * Send SMS notification
 * @param {string} to - Recipient phone number
 * @param {string} body - Message body
 * @returns {Promise<import('twilio/lib/rest/api/v2010/account/message').MessageInstance>}
 */
async function sendSMS(to, body) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!from) {
    throw new Error('Missing TWILIO_PHONE_NUMBER in environment variables');
  }

  return await client.messages.create({
    body,
    from,
    to
  });
}

/**
 * Make an outbound call
 * @param {string} to - Recipient phone number
 * @param {string} twimlUrl - URL that returns TwiML instructions
 * @returns {Promise<import('twilio/lib/rest/api/v2010/account/call').CallInstance>}
 */
async function makeCall(to, twimlUrl) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!from) {
    throw new Error('Missing TWILIO_PHONE_NUMBER in environment variables');
  }

  return await client.calls.create({
    to,
    from,
    url: twimlUrl,
    method: 'POST'
  });
}

module.exports = {
  getTwilioClient,
  getCallDetails,
  getRecording,
  sendSMS,
  makeCall
};
