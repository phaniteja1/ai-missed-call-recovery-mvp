# 🚀 Next Steps for Heisenberg

Phase 2 is complete! Here's your roadmap to get everything running in production.

---

## ⚡ Quick Start (15 minutes)

### 1. Install Dependencies
```bash
cd /Users/gilfoyle/projects/ai-missed-call-recovery-mvp
npm install
```

This will install:
- `@supabase/supabase-js@^2.39.0`
- `axios@^1.6.5`

### 2. Set Up Supabase

**Option A: Create New Project (Recommended)**
1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose organization and set:
   - Name: `ai-call-recovery` (or your choice)
   - Database Password: [Generate strong password]
   - Region: Choose closest to your users
4. Wait ~2 minutes for provisioning

**Option B: Use Existing Project**
- Skip to SQL Editor step below

**Run Migration:**
1. Go to Supabase Dashboard → SQL Editor
2. Click "New Query"
3. Copy/paste contents of `supabase/migrations/001_initial_schema.sql`
4. Click "Run"
5. Verify: Go to "Table Editor" → should see 4 tables

**Get Credentials:**
1. Go to Settings → API
2. Copy these values:
   - Project URL (https://xxx.supabase.co)
   - `service_role` key (secret)
   - `anon` key (public)

### 3. Create Cal.com OAuth App

1. Log in to https://app.cal.com
2. Go to Settings → Developer → OAuth Applications
3. Click "New OAuth Application"
4. Fill in:
   - **Name:** `AI Call Recovery` (or your choice)
   - **Redirect URI:** `https://your-vercel-url.vercel.app/api/calcom/oauth`
     - ⚠️ Use your actual Vercel URL from deployment
     - ⚠️ No trailing slash
   - **Description:** `Automated appointment booking via AI`
5. Click "Create"
6. Copy:
   - Client ID (starts with `cal_live_`)
   - Client Secret (starts with `cal_secret_`)

### 4. Configure Vercel Environment Variables

```bash
# In Vercel Dashboard → Your Project → Settings → Environment Variables
# Add these one by one:

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CALCOM_CLIENT_ID=cal_live_xxxxxxxxxxxxx
CALCOM_CLIENT_SECRET=cal_secret_xxxxxxxxxxxxx
CALCOM_REDIRECT_URI=https://your-vercel-url.vercel.app/api/calcom/oauth
```

Keep existing variables:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_PHONE_NUMBER

### 5. Deploy to Production

```bash
vercel --prod
```

Wait for deployment to complete (~2 minutes).

---

## ✅ Verification Steps

### Step 1: Database Works

```bash
# Test Supabase connection
curl "https://your-vercel-url.vercel.app/api/status"

# Expected: Should include database health check (if you add it)
```

### Step 2: Create Test Business

Go to Supabase Dashboard → SQL Editor:

```sql
INSERT INTO businesses (name, phone_number, email, timezone)
VALUES (
  'Test Business',
  '+15551234567',  -- Your Twilio number
  'test@example.com',
  'America/New_York'
);

-- Get the business ID
SELECT id, name, phone_number FROM businesses;
```

Copy the `id` (UUID) - you'll need it for testing.

### Step 3: Connect Cal.com

**Option A: Manual (for testing)**

```bash
# 1. Generate auth URL
node -e "
const { getAuthorizationUrl } = require('./lib/calcom');
console.log(getAuthorizationUrl('YOUR_BUSINESS_UUID'));
"

# 2. Visit URL in browser
# 3. Authorize the app
# 4. You'll be redirected to /api/calcom/oauth with code
# 5. Credentials will be saved automatically
```

**Option B: Via Dashboard (recommended for production)**

Build a simple connect page later - for now, use manual method.

### Step 4: Test Availability

```bash
curl "https://your-vercel-url.vercel.app/api/calcom/availability?businessId=YOUR_UUID&date=2024-01-20"
```

Expected response:
```json
{
  "success": true,
  "availableSlots": [
    {
      "iso": "2024-01-20T14:00:00.000Z",
      "time": "9:00 AM",
      "date": "Saturday, January 20, 2024"
    }
  ],
  "count": 5
}
```

### Step 5: Test Booking

```bash
curl -X POST "https://your-vercel-url.vercel.app/api/calcom/book" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "YOUR_UUID",
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+15559876543",
    "start": "2024-01-20T14:00:00.000Z",
    "notes": "Test booking from API"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Booking created successfully",
  "booking": {
    "id": "uuid-here",
    "calcomUid": "xxxxx",
    "customerName": "Test User",
    "scheduledAt": "2024-01-20T14:00:00.000Z",
    "status": "confirmed"
  }
}
```

**Verify in Cal.com:**
- Log in to https://app.cal.com
- Go to Bookings → should see the test booking

### Step 6: Test VAPI Webhook

1. **Update VAPI Dashboard:**
   - Go to https://dashboard.vapi.ai
   - Select your assistant
   - Set Server URL: `https://your-vercel-url.vercel.app/api/vapi-webhook`
   - Save

2. **Make a test call:**
   - Call your Twilio number
   - AI should answer
   - If Cal.com is connected, AI will offer to book an appointment
   - Try booking something

3. **Check database:**
   ```sql
   -- In Supabase SQL Editor
   SELECT * FROM calls ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM call_transcripts ORDER BY created_at DESC LIMIT 10;
   SELECT * FROM bookings ORDER BY created_at DESC;
   ```

---

## 🐛 Troubleshooting

### Problem: "Business not found"

**Symptom:** VAPI webhook logs show "Business not found for phone: +15551234567"

**Fix:**
```sql
-- Ensure phone number matches exactly (E.164 format)
SELECT * FROM businesses WHERE phone_number = '+15551234567';

-- Update if needed
UPDATE businesses SET phone_number = '+15551234567' WHERE id = 'your-uuid';
```

### Problem: "Cal.com not connected"

**Symptom:** Availability check returns "Business not connected to Cal.com"

**Fix:**
```sql
-- Check if tokens exist
SELECT 
  id, 
  name, 
  calcom_access_token IS NOT NULL as has_token,
  calcom_event_type_id
FROM businesses;

-- If has_token = false, re-run OAuth flow
```

### Problem: "No default event type"

**Symptom:** Booking fails with "No default event type configured"

**Fix:**
```sql
-- Find your event type ID from Cal.com dashboard
-- Or get it via API:
-- curl "https://api.cal.com/v2/event-types" -H "Authorization: Bearer YOUR_TOKEN"

-- Update business
UPDATE businesses 
SET calcom_event_type_id = 123456  -- Your event type ID
WHERE id = 'your-uuid';
```

### Problem: Token expired

**Symptom:** Cal.com API returns 401 Unauthorized

**Fix:** Token refresh should happen automatically. If persistent:

```sql
-- Check token expiration
SELECT 
  name,
  calcom_token_expires_at,
  calcom_token_expires_at < NOW() as is_expired
FROM businesses;

-- If expired and refresh fails, re-run OAuth
```

### Problem: Webhook not receiving events

**Symptom:** No data appearing in database during calls

**Checks:**
1. Verify VAPI Server URL is correct
2. Check Vercel function logs: `vercel logs --follow`
3. Test webhook endpoint: 
   ```bash
   curl -X POST https://your-url.vercel.app/api/vapi-webhook \
     -H "Content-Type: application/json" \
     -d '{"message":{"type":"status-update"}}'
   ```

---

## 📊 Monitoring & Logs

### View Vercel Logs
```bash
# Live logs
vercel logs --follow

# Last 100 lines
vercel logs -n 100

# Or via dashboard:
# https://vercel.com/dashboard → Your Project → Logs
```

### View Supabase Logs
1. Go to Supabase Dashboard
2. Click "Logs" in sidebar
3. Filter by table or error level

### Key Metrics to Watch
- **Call volume:** How many calls per day?
- **Booking rate:** What % of calls result in bookings?
- **Failed webhooks:** Any 500 errors?
- **Token refreshes:** Are they happening automatically?

---

## 🎯 Phase 3 Ideas (Optional)

Once Phase 2 is working in production, consider:

### 1. **Dashboard UI** (High Priority)
Build a Next.js dashboard for businesses to:
- View call history
- See upcoming bookings
- Connect/disconnect Cal.com
- Export data
- View analytics

**Tech Stack:**
- Next.js 14 (App Router)
- Tailwind CSS
- Supabase Auth (for business login)
- Recharts (for analytics)

### 2. **Notifications**
- Send email/SMS when booking created
- Slack/Discord alerts for important calls
- Daily summary reports

**Options:**
- SendGrid (email)
- Twilio (SMS)
- Slack webhooks
- Discord webhooks

### 3. **Advanced AI Features**
- Multi-step booking flow
- Handle cancellations/rescheduling
- Intent classification with GPT-4
- Sentiment analysis
- Custom scripts per business

### 4. **Multi-Business Support**
- Onboarding flow for new businesses
- Billing integration (Stripe)
- Tiered pricing
- Usage limits

### 5. **CRM Integration**
- HubSpot
- Salesforce
- Pipedrive
- Zapier webhook

---

## 📚 Documentation Created

All docs are in the project root:

1. **`CALCOM_SETUP.md`** - Complete Cal.com integration guide
2. **`PHASE2_IMPLEMENTATION.md`** - Technical architecture & API docs
3. **`NEXT_STEPS.md`** - This file (getting started guide)
4. **`DEPLOYMENT.md`** - Original deployment guide (Phase 1)
5. **`.env.example`** - Environment variable template

---

## 🆘 Need Help?

### Check Logs First
Most issues can be diagnosed from logs:
- Vercel: `vercel logs --follow`
- Supabase: Dashboard → Logs
- Browser: DevTools → Console/Network

### Common Log Patterns

**"Business not found"** → Database lookup failed  
**"Cal.com not connected"** → OAuth not completed  
**"Token expired"** → Refresh token flow issue  
**"Invalid signature"** → Twilio webhook validation (Phase 1 issue)  
**"Function not implemented"** → VAPI function name mismatch  

### Still Stuck?

1. Review the relevant doc:
   - Database issues → `PHASE2_IMPLEMENTATION.md` (Schema section)
   - Cal.com issues → `CALCOM_SETUP.md`
   - Deployment issues → `DEPLOYMENT.md`

2. Check environment variables:
   ```bash
   # List all env vars in Vercel
   vercel env ls
   
   # Pull them locally for testing
   vercel env pull .env.local
   ```

3. Test individual components:
   ```bash
   # Test Supabase
   node -e "const {getBusinessByPhone} = require('./lib/supabase'); getBusinessByPhone('+15551234567').then(console.log)"
   
   # Test Cal.com
   node -e "const {getAuthorizationUrl} = require('./lib/calcom'); console.log(getAuthorizationUrl('test-uuid'))"
   ```

---

## ✅ Success Criteria

Phase 2 is successful when:

- [x] Database schema deployed to Supabase
- [x] Environment variables configured in Vercel
- [x] Cal.com OAuth app created
- [ ] Test business created in database
- [ ] Cal.com connected to test business
- [ ] Availability check works
- [ ] Booking creation works
- [ ] VAPI webhook persists call data
- [ ] End-to-end call with booking succeeds
- [ ] Data visible in Supabase dashboard

---

## 🎉 You're Ready!

Phase 2 is architecturally complete. Follow the Quick Start section above to deploy, then verify everything works with the test steps.

**Estimated time to production:** 15-30 minutes (depending on how fast you click buttons)

Good luck! 🚀

---

**Questions?** Re-read `CALCOM_SETUP.md` or `PHASE2_IMPLEMENTATION.md` - they have detailed troubleshooting sections.
