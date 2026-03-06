/**
 * Prompt Builders
 * 
 * Functions to construct prompts by filling templates with business data.
 * These handle the dynamic injection of business-specific information.
 */

const {
  BASE_SYSTEM_TEMPLATE,
  DEFAULT_GUIDELINES,
  BOOKING_GUIDELINES,
  FIRST_MESSAGES,
  END_CALL_MESSAGES
} = require('./templates');

/**
 * Get today's hours from business_hours JSON
 * @param {Object} businessHours - Business hours JSON from DB
 * @param {string} timezone - Business timezone
 * @returns {string} Formatted hours for today
 */
function getTodaysHours(businessHours, timezone = 'America/New_York') {
  if (!businessHours) return '9:00 AM - 5:00 PM';
  
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = new Date().toLocaleDateString('en-US', { 
    timeZone: timezone,
    weekday: 'short'
  }).toLowerCase().slice(0, 3);
  
  const todayHours = businessHours[today];
  
  if (!todayHours || todayHours.closed) {
    return 'Closed today';
  }
  
  return `${todayHours.start} - ${todayHours.end}`;
}

/**
 * Format full business hours for prompt
 * @param {Object} businessHours - Business hours JSON
 * @returns {string} Formatted weekly hours
 */
function formatBusinessHours(businessHours) {
  if (!businessHours) return 'Monday-Friday: 9:00 AM - 5:00 PM';
  
  const dayNames = {
    mon: 'Monday',
    tue: 'Tuesday', 
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday'
  };
  
  return Object.entries(businessHours)
    .map(([day, hours]) => {
      const dayName = dayNames[day] || day;
      if (hours.closed) return `${dayName}: Closed`;
      return `${dayName}: ${hours.start} - ${hours.end}`;
    })
    .join(', ');
}

/**
 * Replace template variables in a string
 * @param {string} template - Template string with {{variables}}
 * @param {Object} variables - Key-value pairs to replace
 * @returns {string} Filled template
 */
function fillTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

/**
 * Build system prompt for a business
 * @param {Object} business - Business object from DB
 * @param {Object} options - Configuration options
 * @returns {string} Complete system prompt
 */
function buildSystemPrompt(business, options = {}) {
  const {
    enableBooking = false,
    personality = 'a friendly and professional AI assistant',
    tone = 'Friendly, empathetic, and efficient'
  } = options;

  // Get business data with fallbacks
  const businessName = business?.name || 'our business';
  const timezone = business?.timezone || 'America/New_York';
  const businessHours = business?.business_hours;
  
  // Build services list from DB or use default
  const servicesList = business?.services?.length > 0 
    ? business.services.join(', ')
    : 'general services';
  
  // Build specialties if available
  const specialtiesText = business?.specialties?.length > 0
    ? `\n- Specialties: ${business.specialties.join(', ')}`
    : '';
  
  // Build custom instructions from DB
  const dbInstructions = business?.ai_instructions || '';
  
  // Build FAQ section if available
  let faqSection = '';
  if (business?.faq_data && Array.isArray(business.faq_data) && business.faq_data.length > 0) {
    faqSection = '\n\nFREQUENTLY ASKED QUESTIONS:\n' + 
      business.faq_data.map(faq => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n');
  }
  
  // Combine all business details
  const businessDetails = `${dbInstructions}${specialtiesText}${faqSection}`;
  
  // Build business details section for bottom of prompt
  const detailsSection = businessDetails 
    ? `\n\nADDITIONAL BUSINESS DETAILS:\n${businessDetails}`
    : '';
  
  // Build template variables
  const variables = {
    businessName,
    personality,
    services: servicesList,
    timezone,
    todayHours: getTodaysHours(businessHours, timezone),
    customInstructions: '',
    guidelines: enableBooking ? BOOKING_GUIDELINES : DEFAULT_GUIDELINES,
    bookingSection: enableBooking 
      ? '\nBOOKING FUNCTIONS:\n- Use checkAvailability() to find open slots\n- Use createBooking() to confirm appointments\n- Always confirm details before booking'
      : '',
    tone,
    businessDetails: detailsSection
  };

  // Use base template with variables
  return fillTemplate(BASE_SYSTEM_TEMPLATE, variables);
}

/**
 * Build first message for a business
 * @param {Object} business - Business object from DB
 * @param {Object} options - Configuration options
 * @returns {string} First message
 */
function buildFirstMessage(business, options = {}) {
  const {
    enableBooking = false
  } = options;

  const businessName = business?.name || 'us';
  
  // Use custom greeting from DB if available
  if (business?.custom_greeting) {
    return fillTemplate(business.custom_greeting, { businessName });
  }

  // Select template based on configuration
  let template;
  if (enableBooking) {
    template = FIRST_MESSAGES.booking;
  } else {
    template = FIRST_MESSAGES.generic;
  }

  return fillTemplate(template, { businessName });
}

/**
 * Build end call message
 * @param {Object} business - Business object from DB
 * @param {Object} options - Configuration options
 * @returns {string} End call message
 */
function buildEndCallMessage(business, options = {}) {
  const {
    enableBooking = false
  } = options;

  const businessName = business?.name || 'us';

  // Use custom closing from DB if available
  if (business?.custom_closing) {
    return fillTemplate(business.custom_closing, { businessName });
  }

  // Select template and fill with business name
  const template = enableBooking 
    ? END_CALL_MESSAGES.booking 
    : END_CALL_MESSAGES.generic;
  
  return fillTemplate(template, { businessName });
}

/**
 * Get voice configuration for a business
 * @param {Object} business - Business object from DB
 * @param {Object} options - Configuration options
 * @returns {Object} Voice config for VAPI
 */
function getVoiceConfig(business, options = {}) {
  const { VOICE_PRESETS } = require('./templates');
  
  // Use voice preset from DB, or from options, or default to tara
  const voicePreset = business?.ai_voice_preset || options.voicePreset || 'tara';
  
  // Get preset or default to tara
  const preset = VOICE_PRESETS[voicePreset] || VOICE_PRESETS.tara;
  
  return {
    provider: preset.provider,
    voiceId: preset.voiceId
  };
}

module.exports = {
  buildSystemPrompt,
  buildFirstMessage,
  buildEndCallMessage,
  getVoiceConfig,
  getTodaysHours,
  formatBusinessHours,
  fillTemplate
};
