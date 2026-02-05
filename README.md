# AI Missed Call Recovery MVP 📞

A production-ready Twilio voice webhook service with **Vapi AI Voice Assistant** integration. Deploy to Vercel in minutes and get AI-powered call handling instantly.

## 🚀 Features

- ✅ **Vapi AI Voice Assistant** - Natural conversational AI
- ✅ Twilio voice webhook integration
- ✅ Real-time AI conversations (GPT-4 + voice synthesis)
- ✅ Automatic call transcription and summaries
- ✅ Production-ready error handling
- ✅ Vercel serverless deployment
- ✅ Full call analytics and reporting

## 📋 Prerequisites

1. **Vapi Account** - [Sign up here](https://vapi.ai) - **START HERE!**
2. **Twilio Account** - [Sign up here](https://www.twilio.com/try-twilio)
3. **Twilio Phone Number** - Purchase from Twilio Console
4. **Vercel Account** - [Sign up here](https://vercel.com/signup)
5. **GitHub Account** - For version control

## 🤖 Vapi AI Setup (Do This First!)

### Step 1: Create Vapi Account

1. Go to [vapi.ai](https://vapi.ai) and sign up
2. Navigate to the [Dashboard](https://dashboard.vapi.ai)
3. You'll need to add a payment method (Vapi charges per minute of AI conversation)

### Step 2: Get Your Vapi API Key

1. In Vapi Dashboard, go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Copy your API key (starts with `vapi_...`)
4. Save this - you'll add it to `.env` later

### Step 3: Create an AI Assistant (Optional)

You have two options:

**Option A: Use Dynamic Assistant (Recommended for MVP)**
- Skip creating an assistant in Vapi dashboard
- The webhook will send assistant configuration dynamically
- Edit `/api/vapi-webhook.js` to customize the AI behavior
- **Pros:** Easy to iterate, change personality/voice in code
- **Cons:** Slightly more complex code

**Option B: Create Assistant in Vapi Dashboard**
1. In Vapi Dashboard, go to **Assistants** → **Create Assistant**
2. Configure:
   - **Name:** "Call Handler"
   - **Model:** GPT-4 (recommended) or GPT-3.5-turbo (cheaper)
   - **System Prompt:** 
     ```
     You are a friendly AI assistant handling incoming calls.
     Greet callers warmly, ask how you can help, and collect
     their information for follow-up if needed. Keep responses
     concise and natural.
     ```
   - **Voice:** Choose from ElevenLabs or other providers
   - **First Message:** "Hello! Thanks for calling. How can I help you today?"
3. Click **Save** and copy the **Assistant ID** (starts with `asst_...`)
4. Add this to `.env` as `VAPI_ASSISTANT_ID`

### Step 4: Configure Vapi Server URL (Webhook)

After deploying to Vercel (Step 3 below), you'll set:

1. Go to Vapi Dashboard → **Settings** → **Server URL**
2. Enter: `https://your-project.vercel.app/api/vapi-webhook`
3. This allows Vapi to send you call events (transcripts, summaries, etc.)

## 🛠️ Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd ai-missed-call-recovery-mvp
npm install
```

### 2. Configure Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# Vapi AI
VAPI_API_KEY=vapi_xxxxxxxxxxxxxxxxxxxxxxxxx
VAPI_ASSISTANT_ID=asst_xxxxxxxxxx  # Optional - only if using Option B above
```

**Where to find these:**

**Twilio:**
- Go to [Twilio Console](https://console.twilio.com/)
- Account SID and Auth Token are on the dashboard
- Phone Number is under "Phone Numbers" → "Manage" → "Active numbers"

**Vapi:**
- API Key: [Vapi Dashboard](https://dashboard.vapi.ai) → Settings → API Keys
- Assistant ID: Vapi Dashboard → Assistants → Your Assistant (only needed for Option B)

### 3. Deploy to Vercel

#### Option A: Deploy via CLI (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

#### Option B: Deploy via GitHub

1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Import Project"
4. Select your GitHub repository
5. Configure environment variables in Vercel:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
   - `VAPI_API_KEY`
   - `VAPI_ASSISTANT_ID` (optional)
6. Deploy!

### 4. Configure Twilio Webhook

After deployment, you'll get a URL like: `https://your-project.vercel.app`

1. Go to [Twilio Console → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click on your phone number
3. Scroll to "Voice Configuration"
4. Under "A CALL COMES IN":
   - Set to **Webhook**
   - Enter: `https://your-project.vercel.app/api/webhook`
   - Method: **HTTP POST**
5. Click "Save"

### 5. Configure Vapi Server URL (Webhook)

Tell Vapi where to send call events:

1. Go to [Vapi Dashboard](https://dashboard.vapi.ai) → **Settings** → **Server URL**
2. Enter: `https://your-project.vercel.app/api/vapi-webhook`
3. Click **Save**

This allows you to receive:
- Real-time transcripts
- Call status updates
- End-of-call summaries
- Function call requests

### 6. Test Your AI Assistant! 🎉

Call your Twilio phone number! You should hear the AI assistant greet you:

> "Hello! Thanks for calling. How can I help you today?"

**Try saying:**
- "I'd like information about your services"
- "Can someone call me back?"
- "I have a question about pricing"

The AI will respond naturally and have a real conversation!

**Check logs:**

```bash
# Vercel logs (connection status)
vercel logs --follow

# Vapi Dashboard (call transcripts & analytics)
# Go to: https://dashboard.vapi.ai/calls
```

## 📁 Project Structure

```
├── api/
│   ├── webhook.js           # Main Twilio webhook → Vapi integration
│   ├── vapi-webhook.js      # Vapi event handler (transcripts, analytics)
│   ├── handle-speech.js     # [Legacy] Speech input handler
│   ├── handle-recording.js  # [Legacy] Voicemail recordings
│   ├── transcription.js     # [Legacy] Transcription callbacks
│   └── status.js            # Health check endpoint
├── lib/
│   └── twilio.js            # Twilio helper utilities
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore rules
├── vercel.json             # Vercel deployment config
├── package.json            # Dependencies
└── README.md               # This file
```

**Note:** Legacy endpoints (handle-speech, handle-recording, transcription) are preserved for reference but not used with Vapi integration. Vapi handles all AI conversation and transcription.

## 🔗 Webhook Endpoints

| Endpoint | Purpose | Called By |
|----------|---------|-----------|
| `POST /api/webhook` | Main entry point - forwards calls to Vapi | Twilio |
| `POST /api/vapi-webhook` | Receives AI call events & transcripts | Vapi |
| `GET /api/status` | Health check (returns service status) | You |

**Legacy endpoints (not used with Vapi):**
- `POST /api/handle-speech` - Speech recognition (replaced by Vapi)
- `POST /api/handle-recording` - Voicemail (replaced by Vapi)
- `POST /api/transcription` - Twilio transcriptions (replaced by Vapi)

## 🧪 Testing

### Test Health Check

```bash
curl https://your-project.vercel.app/api/status
```

Expected response:
```json
{
  "status": "ok",
  "service": "AI Missed Call Recovery MVP",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "endpoints": { ... }
}
```

### Test Locally

```bash
# Install Vercel CLI
npm install -g vercel

# Run development server
vercel dev
```

Then use [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3000
```

Update your Twilio webhook to the ngrok URL temporarily.

## 🎨 Customization & Enhancements

### Customize AI Assistant Personality

Edit `/api/vapi-webhook.js` in the `handleAssistantRequest` function:

```javascript
messages: [
  {
    role: 'system',
    content: `You are a [YOUR PERSONALITY].
    
    Your goals:
    1. [GOAL 1]
    2. [GOAL 2]
    
    Tone: [professional/casual/friendly/etc]`
  }
]
```

**Voice options:**
- ElevenLabs: Choose from 100+ voices in Vapi dashboard
- OpenAI: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
- Change in `voice.voiceId` in the assistant config

### Add Function Calling (Advanced)

Enable the AI to take actions during calls:

**1. Define functions in assistant config:**

```javascript
functions: [
  {
    name: 'scheduleCallback',
    description: 'Schedule a callback for the customer',
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: { type: 'string' },
        preferredTime: { type: 'string' }
      },
      required: ['phoneNumber']
    }
  }
]
```

**2. Handle function calls in `handleFunctionCall()`:**

See `/api/vapi-webhook.js` for implementation example.

**Use cases:**
- Schedule callbacks
- Book appointments
- Send confirmation emails
- Update CRM records
- Transfer to human agent

### Database Integration

Store call data for analytics:

```bash
npm install @vercel/postgres
# or
npm install @supabase/supabase-js
# or
npm install mongodb
```

Update `/api/vapi-webhook.js` in `handleEndOfCallReport()` to save:
- Call transcripts
- Call summaries
- Customer information
- Call duration & metadata

## 📊 Monitoring

### View Logs

```bash
# Vercel logs
vercel logs --follow

# Or via dashboard
# https://vercel.com/dashboard → Your Project → Logs
```

### Twilio Logs

- [Call Logs](https://console.twilio.com/us1/monitor/logs/calls)
- [Recording Logs](https://console.twilio.com/us1/monitor/logs/recordings)

## 🔐 Security Best Practices

1. **Enable Twilio Request Validation** (already implemented in `webhook.js`)
2. **Rotate Auth Tokens** regularly
3. **Use Environment Variables** for all secrets (never commit `.env`)
4. **Set up CORS** if building a frontend
5. **Rate Limiting** - Consider adding rate limiting for production

## 🐛 Troubleshooting

### AI doesn't respond / "Service configuration error"

**Cause:** Missing or invalid `VAPI_API_KEY`

**Fix:**
1. Verify API key in Vercel environment variables
2. Check it starts with `vapi_`
3. Regenerate key in Vapi Dashboard if needed
4. Redeploy after updating env vars

### "Invalid signature" error (Twilio)

- Ensure `TWILIO_AUTH_TOKEN` is correct
- Verify webhook URL is HTTPS (required for production)
- Check Vercel environment variables are set

### Call connects but no AI voice

**Cause:** Vapi WebSocket connection failed

**Fix:**
1. Check Vapi account balance (needs credits)
2. Verify `VAPI_ASSISTANT_ID` if using Option B
3. Check Vercel logs for Vapi API errors
4. Test Vapi API key with curl:
   ```bash
   curl -H "Authorization: Bearer $VAPI_API_KEY" \
        https://api.vapi.ai/assistant
   ```

### No transcripts in Vapi webhook

**Cause:** Server URL not configured in Vapi

**Fix:**
1. Go to Vapi Dashboard → Settings → Server URL
2. Set to: `https://your-project.vercel.app/api/vapi-webhook`
3. Make a test call

### "We are experiencing technical difficulties"

- Check Vercel logs for errors
- Verify all environment variables are set
- Ensure Twilio account has sufficient balance
- Ensure Vapi account has credits

## 💰 Cost Estimates

**Vapi AI (per minute of conversation):**
- GPT-4 + ElevenLabs voice: ~$0.15-0.25/min
- GPT-3.5-turbo + ElevenLabs: ~$0.08-0.12/min
- Free trial: $10 credit (test with ~40-60 minutes of calls)
- Check current pricing: [Vapi Pricing](https://vapi.ai/pricing)

**Twilio (per call):**
- Voice: $0.013/min (US inbound)
- Phone number: $1.15/month

**Vercel:**
- Hobby: Free (100GB bandwidth, 100k invocations)
- Pro: $20/month (unlimited)

**Example: 100 calls/month @ 2 min average**
- Vapi: ~$30-50 (GPT-4)
- Twilio: ~$2.60 + $1.15/month
- Vercel: Free (or $20 for Pro)
- **Total: ~$35-55/month**

## 📚 Resources

**Vapi:**
- [Vapi Documentation](https://docs.vapi.ai)
- [Vapi Dashboard](https://dashboard.vapi.ai)
- [Server URL Webhooks](https://docs.vapi.ai/server-url)
- [Function Calling Guide](https://docs.vapi.ai/assistants/function-calling)

**Twilio:**
- [Twilio Voice Docs](https://www.twilio.com/docs/voice)
- [TwiML Reference](https://www.twilio.com/docs/voice/twiml)

**Vercel:**
- [Vercel Docs](https://vercel.com/docs)
- [Serverless Functions](https://vercel.com/docs/functions)

## 📝 License

MIT

---

**Questions?** Open an issue or contact support.

**Ready to scale?** Consider adding:
- Database for call history
- Admin dashboard
- Real-time analytics
- Multi-tenant support
- CRM integrations
