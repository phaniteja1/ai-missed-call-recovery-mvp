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
  APPOINTMENT_HANDLING,
  DENTAL_SECTION,
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
 * Infer broad business type from stored business data.
 * This keeps prompt specialization lightweight and deterministic.
 * @param {Object} business - Business object from DB
 * @returns {string} Inferred type
 */
function inferBusinessType(business) {
  const text = [
    business?.name,
    Array.isArray(business?.services) ? business.services.join(' ') : '',
    Array.isArray(business?.specialties) ? business.specialties.join(' ') : '',
    business?.ai_instructions
  ].filter(Boolean).join(' ').toLowerCase();

  if (/(dental|dentist|dentistry|teeth|tooth|oral)/.test(text)) {
    return 'dental';
  }

  if (/(hvac|heating|cooling|air conditioning|ac repair|furnace|thermostat|ventilation)/.test(text)) {
    return 'hvac';
  }

  return 'general';
}

/**
 * Determine how the assistant should talk about appointments.
 * @param {Object} business - Business object from DB
 * @param {Object} options - Builder options
 * @returns {string} Handling mode
 */
function getAppointmentHandlingMode(business, options = {}) {
  const appointmentHandlingEnabled = options.appointmentHandlingEnabled;
  const directBookingEnabled = options.enableBooking === true;
  const callbackEnabled = options.enableCallback === true;

  if (directBookingEnabled) {
    return 'booking';
  }

  if (appointmentHandlingEnabled === false) {
    return 'none';
  }

  if (callbackEnabled || appointmentHandlingEnabled === true) {
    return 'callback';
  }

  return 'none';
}

/**
 * Build domain-specific instructions.
 * @param {Object} business - Business object from DB
 * @param {Object} options - Builder options
 * @returns {string} Prompt section
 */
function buildIndustrySection(business, options = {}) {
  const businessType = inferBusinessType(business);

  if (businessType === 'dental') {
    return DENTAL_SECTION;
  }

  if (businessType === 'hvac') {
    return `HVAC CALL HANDLING:
- Identify whether the caller needs heating help, cooling help, maintenance, installation, or emergency service.
- If the caller reports no heat, no cooling, burning smells, smoke, gas odor, or other immediate safety concerns, advise them to seek appropriate emergency help when necessary and note the urgency for the team.
- Do not diagnose equipment failures with certainty. Gather symptoms, location, and urgency, then route appropriately.
- If appointment handling is not direct, collect callback details and explain that the team will follow up.`;
  }

  return 'INDUSTRY-SPECIFIC HANDLING:\n- Use the business reference to answer simple questions and collect the details needed for follow-up.';
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
    enableCallback = false,
    appointmentHandlingEnabled,
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
  
  // Build custom instructions from DB. These are reference notes, not operating rules.
  const dbInstructions = business?.ai_instructions || '';
  
  // Build FAQ section if available (now as simple text)
  let faqSection = '';
  if (business?.faq_data && typeof business.faq_data === 'string' && business.faq_data.trim().length > 0) {
    faqSection = '\n\nFREQUENTLY ASKED QUESTIONS:\n' + business.faq_data.trim();
  }
  
  // Combine all business details
  const businessDetails = [dbInstructions, specialtiesText, faqSection]
    .filter(Boolean)
    .join('\n');
  
  // Build business details section for bottom of prompt
  const detailsSection = businessDetails || 'No additional business reference provided.';
  const appointmentMode = getAppointmentHandlingMode(business, {
    enableBooking,
    enableCallback,
    appointmentHandlingEnabled
  });
  
  // Build template variables
  const variables = {
    businessName,
    personality,
    services: servicesList,
    timezone,
    todayHours: getTodaysHours(businessHours, timezone),
    guidelines: enableBooking ? BOOKING_GUIDELINES : DEFAULT_GUIDELINES,
    appointmentHandling: APPOINTMENT_HANDLING[appointmentMode],
    tone,
    industrySection: buildIndustrySection(business, options),
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
  template = enableBooking ? FIRST_MESSAGES.booking : FIRST_MESSAGES.generic;

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
