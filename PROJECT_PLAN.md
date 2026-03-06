# AI Missed Call Recovery MVP — Project Plan

## Current Status

The production path is now built around a multi-tenant call flow:

- Twilio sends inbound calls to `/api/webhook`.
- Vapi handles the live conversation and calls back to `/api/vapi-webhook`.
- The app resolves the business dynamically from `business_phone_numbers`.
- Prompt and assistant config generation are modularized in `lib/prompts` and `lib/vapi`.
- Prompt behavior now supports industry-specific guidance plus appointment-handling modes.
- `businesses.appointment_handling_enabled` has been added in migration `006_appointment_handling_flag.sql`.

## Completed

### Milestone 1: Multi-Tenant Call Routing
- Added business lookup by inbound phone number.
- Persisted calls, transcripts, summaries, and bookings per business.
- Enabled one dynamic Vapi assistant pattern for multiple Twilio numbers.

### Milestone 2: Prompt and Assistant Modularization
- Moved prompt generation out of `api/vapi-webhook.js`.
- Centralized Vapi config generation in `lib/vapi`.
- Added business-driven prompt fields such as `ai_instructions`, `services`, `specialties`, `faq_data`, `custom_greeting`, `custom_closing`, and `ai_voice_preset`.

### Milestone 3: Appointment Handling Controls
- Kept Cal.com booking gated behind `calcom_enabled` plus valid integration credentials.
- Added prompt-level appointment-handling behavior for booking, callback, or no-appointment flows.
- Added `appointment_handling_enabled` to the business model and wired it into prompt/config generation.

### Milestone 4: Deployment
- Changes have been pushed to `main`.
- Production deployment completed on Vercel.

## In Progress

### Milestone 5: Production Data Alignment
- Apply Supabase migration `006_appointment_handling_flag.sql`.
- Verify both existing businesses have the expected flags:
  - `appointment_handling_enabled = true`
  - `calcom_enabled` set correctly per business
- Confirm business prompt content in Supabase is populated with real business-specific instructions.

## Next Steps

### Immediate
- Run the pending Supabase migration in production.
- Verify the two current businesses after migration.
- Test one live call per business number and confirm prompt behavior matches the business.

### Short Term
- Add a dedicated business-type field if you want prompt specialization to stop relying on inference from business text.
- Add dashboard controls for `appointment_handling_enabled`, prompt fields, voice preset, and booking mode.
- Persist callback requests from `scheduleCallback` instead of only returning a success message.

### Verification
- Test dental flow:
  - urgent concern triage
  - non-booking intake
  - booking behavior only when enabled
- Test HVAC flow:
  - service-type identification
  - emergency-style issue wording
  - callback or booking path depending on flags

## Deliverables

- Dynamic multi-tenant Twilio → Vapi → Supabase call flow
- Modular prompt/config generation
- Appointment-handling toggle in schema and prompt logic
- Production deployment on Vercel
