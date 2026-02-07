# 🗓️ Cal.com Integration Setup Guide

This guide walks you through setting up Cal.com OAuth2 integration for automated appointment booking via AI voice assistant.

---

## Prerequisites

1. **Cal.com Account** (Free or Paid)
   - Sign up at https://app.cal.com/signup
   - Create at least one Event Type (e.g., "30 Minute Meeting")

2. **Supabase Project**
   - Database must be set up (see `supabase/migrations/001_initial_schema.sql`)
   - Environment variables configured

3. **Vercel Deployment**
   - Project deployed with public URL

---

## Step 1: Create Cal.com OAuth Application

1. **Log in to Cal.com**
   - Go to https://app.cal.com

2. **Navigate to Developer Settings**
   - Click your profile → Settings
   - Scroll down to **"Developer" section**
   - Click **"OAuth Applications"**

3. **Create New OAuth App**
   - Click **"New OAuth Application"**
   - Fill in details:
     - **Application Name**: `AI Missed Call Recovery` (or your app name)
     - **Redirect URI**: `https://your-vercel-url.vercel.app/api/calcom/oauth`
       - ⚠️ Must be HTTPS
       - ⚠️ Must match exactly (no trailing slash)
     - **Description**: `AI-powered call handling with automated booking`
   - Click **"Create"**

4. **Copy Credentials**
   - **Client ID**: `cal_live_xxxxxxxxxxxxx`
   - **Client Secret**: `cal_secret_xxxxxxxxxxxxx`
   - ⚠️ Save these securely - you'll need them for Vercel

---

## Step 2: Configure Vercel Environment Variables

Add these to your Vercel project (Dashboard → Settings → Environment Variables):

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Cal.com OAuth Credentials
CALCOM_CLIENT_ID=cal_live_xxxxxxxxxxxxx
CALCOM_CLIENT_SECRET=cal_secret_xxxxxxxxxxxxx
CALCOM_REDIRECT_URI=https://your-vercel-url.vercel.app/api/calcom/oauth
```

**After adding variables:**
```bash
vercel --prod  # Redeploy to apply changes
```

---

## Step 3: Set Up Supabase Database

1. **Run Migration**
   ```bash
   # Using Supabase CLI
   supabase db push

   # Or via Supabase Dashboard SQL Editor:
   # Copy/paste contents of supabase/migrations/001_initial_schema.sql
   ```

2. **Verify Tables Created**
   - Check Supabase Dashboard → Table Editor
   - Should see: `businesses`, `calls`, `call_transcripts`, `bookings`

3. **Create Your First Business** (via SQL Editor)
   ```sql
   INSERT INTO businesses (name, phone_number, email, timezone)
   VALUES (
     'Your Business Name',
     '+15551234567',  -- Your Twilio number
     'info@yourbusiness.com',
     'America/New_York'
   );
   
   -- Get the business ID for next step
   SELECT id, name FROM businesses;
   ```

---

## Step 4: Connect Cal.com to Business

### Option A: Via Dashboard (Recommended)

1. **Build a simple dashboard page** (e.g., `/dashboard`)
2. **Add "Connect Cal.com" button:**
   ```javascript
   const businessId = 'your-business-uuid-from-db';
   const connectUrl = `/api/calcom/connect?businessId=${businessId}`;
   ```

3. **Create the connect endpoint** (`/api/calcom/connect.js`):
   ```javascript
   const { getAuthorizationUrl } = require('../lib/calcom');
   
   module.exports = async (req, res) => {
     const { businessId } = req.query;
     const authUrl = getAuthorizationUrl(businessId);
     res.redirect(authUrl);
   };
   ```

4. **User Flow:**
   - User clicks "Connect Cal.com"
   - Redirected to Cal.com authorization
   - User approves access
   - Redirected back to `/api/calcom/oauth`
   - Credentials saved automatically

### Option B: Manual Database Entry (Testing)

1. **Generate Authorization URL:**
   ```javascript
   const { getAuthorizationUrl } = require('./lib/calcom');
   const url = getAuthorizationUrl('your-business-uuid');
   console.log(url);
   ```

2. **Visit the URL in browser** → Authorize the app

3. **Copy the `code` from redirect URL:**
   ```
   https://your-domain.com/api/calcom/oauth?code=cal_xxxxxx&state=xxxxxx
   ```

4. **Exchange code for token** (via Postman/curl):
   ```bash
   curl -X GET "https://your-vercel-url.vercel.app/api/calcom/oauth?code=cal_xxxxx&state=xxxxx"
   ```

---

## Step 5: Test the Integration

### Test 1: Check Availability

```bash
curl "https://your-vercel-url.vercel.app/api/calcom/availability?businessId=YOUR_UUID&date=2024-01-15"
```

**Expected Response:**
```json
{
  "success": true,
  "date": "2024-01-15",
  "availableSlots": [
    {
      "iso": "2024-01-15T14:00:00.000Z",
      "time": "9:00 AM",
      "date": "Monday, January 15, 2024"
    },
    ...
  ],
  "count": 8
}
```

### Test 2: Create Booking

```bash
curl -X POST "https://your-vercel-url.vercel.app/api/calcom/book" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "YOUR_UUID",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+15551234567",
    "start": "2024-01-15T14:00:00.000Z",
    "notes": "First test booking"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Booking created successfully",
  "booking": {
    "id": "uuid-here",
    "calcomUid": "xxxxxxxx",
    "customerName": "John Doe",
    "scheduledAt": "2024-01-15T14:00:00.000Z",
    "status": "confirmed"
  }
}
```

### Test 3: Check Cal.com Dashboard

- Log in to https://app.cal.com
- Go to Bookings → you should see the test booking

---

## Step 6: Update VAPI Assistant

The webhook at `/api/vapi-webhook` is now configured to:
- ✅ Automatically detect if business has Cal.com connected
- ✅ Enable booking functions in assistant if connected
- ✅ Handle `checkAvailability` and `createBooking` function calls
- ✅ Store all bookings in database

**No additional VAPI configuration needed!** The assistant will automatically offer booking when Cal.com is connected.

---

## Troubleshooting

### Error: "Business not connected to Cal.com"

**Cause:** Business hasn't completed OAuth flow

**Fix:**
1. Check `businesses` table in Supabase
2. Verify `calcom_access_token` is not NULL
3. Re-run OAuth flow if needed

### Error: "No default event type configured"

**Cause:** Business hasn't selected a Cal.com event type

**Fix:**
```sql
UPDATE businesses
SET calcom_event_type_id = YOUR_EVENT_TYPE_ID
WHERE id = 'your-business-uuid';
```

To find your event type ID:
- Go to Cal.com → Event Types
- Click on an event → URL will show ID
- Or use: `curl "https://api.cal.com/v2/event-types" -H "Authorization: Bearer YOUR_TOKEN"`

### Error: "Invalid redirect URI"

**Cause:** Mismatch between Cal.com app config and Vercel env

**Fix:**
1. Check Cal.com app settings → Redirect URI
2. Check Vercel env: `CALCOM_REDIRECT_URI`
3. Ensure they match EXACTLY (case-sensitive, no trailing slash)

### Error: "Token expired"

**Cause:** Access token expired (normal after ~1 hour)

**Fix:** Library automatically refreshes tokens! If persistent:
1. Check `calcom_token_expires_at` in database
2. Verify `calcom_refresh_token` exists
3. Re-run OAuth if tokens are invalid

---

## Security Best Practices

1. **Never expose service keys**
   - Keep `SUPABASE_SERVICE_KEY` and `CALCOM_CLIENT_SECRET` secret
   - Only use in server-side code (never in browser)

2. **Add authentication to API endpoints**
   ```javascript
   // Example: API key validation
   const apiKey = req.headers['x-api-key'];
   if (apiKey !== process.env.API_KEY) {
     return res.status(401).json({ error: 'Unauthorized' });
   }
   ```

3. **Implement rate limiting**
   - Use Vercel Edge Config or Redis
   - Limit booking attempts per IP/business

4. **Validate all inputs**
   - Already implemented in endpoints
   - Always sanitize user-provided data

5. **Enable Row Level Security (RLS)**
   - Already enabled in migration
   - Businesses can only see their own data

---

## Production Checklist

- [ ] Cal.com OAuth app created
- [ ] Vercel environment variables set
- [ ] Database migration run successfully
- [ ] Business record created in database
- [ ] Cal.com connected via OAuth
- [ ] Default event type configured
- [ ] Test booking created successfully
- [ ] Webhook verified in VAPI dashboard
- [ ] Tested live phone call with booking
- [ ] Monitoring/logging set up
- [ ] Error alerting configured

---

## Next Steps

1. **Build a Dashboard**
   - View call logs
   - See bookings
   - Connect/disconnect Cal.com
   - Analytics

2. **Add Notifications**
   - Email/SMS when booking created
   - Slack/Discord alerts for missed calls
   - Daily summary reports

3. **Enhance AI Assistant**
   - Multi-step booking flow
   - Handle cancellations/rescheduling
   - Collect more customer info
   - Sentiment analysis

4. **Multi-Calendar Support**
   - Allow multiple event types
   - Round-robin staff assignment
   - Availability across team

---

## Resources

- **Cal.com API Docs:** https://cal.com/docs/api-reference
- **Supabase Docs:** https://supabase.com/docs
- **VAPI Docs:** https://docs.vapi.ai
- **Project Repository:** [Your GitHub URL]

**Need help?** Check existing issues or create a new one in the repository.
