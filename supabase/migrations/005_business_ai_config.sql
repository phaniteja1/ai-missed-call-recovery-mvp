-- ============================================================-- Add AI Configuration and Business Details to Businesses Table-- ============================================================
-- Add AI config columns to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS ai_instructions TEXT,
ADD COLUMN IF NOT EXISTS services TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS faq_data TEXT,  -- Simple text format, easy to scrape/paste
ADD COLUMN IF NOT EXISTS custom_greeting TEXT,
ADD COLUMN IF NOT EXISTS custom_closing TEXT,
ADD COLUMN IF NOT EXISTS ai_voice_preset TEXT DEFAULT 'tara';
-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_ai_config 
ON businesses USING GIN (services, specialties);

-- Example: Update a business with full AI configuration-- FAQ format: Just paste text with Q: and A: prefixes
UPDATE businesses 
SET 
  ai_instructions = 'Always mention free estimates. We offer 24/7 emergency service. Ask if they need heating or cooling help specifically.',
  services = ARRAY['Heating Repair', 'AC Installation', 'Ventilation Cleaning', 'HVAC Maintenance', 'Emergency Repairs'],
  specialties = ARRAY['Residential HVAC', 'Commercial Systems', 'Heat Pumps', 'Smart Thermostats'],
  faq_data = 'Q: What are your hours?
A: We are open Monday-Friday 9 AM to 5 PM, with 24/7 emergency service available.

Q: Do you offer free estimates?
A: Yes, we offer free in-home estimates for all new installations.

Q: What areas do you service?
A: We service the entire tri-state area including Cityville, Townsburg, and Villageton.',
  custom_greeting = 'Hello! Thanks for calling {{businessName}}. Are you looking for heating or cooling help today?',
  custom_closing = 'Thanks for calling {{businessName}}! Remember we offer 24/7 emergency service if you need us.',
  ai_voice_preset = 'tara'
WHERE name = 'XYZ HVAC Company';
