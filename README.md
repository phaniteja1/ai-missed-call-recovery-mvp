# AI Missed Call Recovery MVP 📞

A production-ready Twilio voice webhook service for handling incoming calls with AI-powered missed call recovery. Deploy to Vercel in minutes.

## 🚀 Features

- ✅ Twilio voice webhook integration
- ✅ Speech recognition (speech-to-text)
- ✅ Voicemail recording with automatic transcription
- ✅ Production-ready error handling
- ✅ Vercel serverless deployment
- ✅ Ready for AI integration (OpenAI, Claude, etc.)

## 📋 Prerequisites

1. **Twilio Account** - [Sign up here](https://www.twilio.com/try-twilio)
2. **Twilio Phone Number** - Purchase from Twilio Console
3. **Vercel Account** - [Sign up here](https://vercel.com/signup)
4. **GitHub Account** - For version control

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

Edit `.env` with your Twilio credentials:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Where to find these:**
- Go to [Twilio Console](https://console.twilio.com/)
- Account SID and Auth Token are on the dashboard
- Phone Number is under "Phone Numbers" → "Manage" → "Active numbers"

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

### 5. Test Your Setup

Call your Twilio phone number! You should hear:

> "Hello! Thank you for calling. What can I help you with today?"

Check your Vercel logs to see call details:

```bash
vercel logs --follow
```

## 📁 Project Structure

```
├── api/
│   ├── webhook.js           # Main voice webhook (entry point)
│   ├── handle-speech.js     # Processes speech input
│   ├── handle-recording.js  # Processes voicemail recordings
│   ├── transcription.js     # Receives transcription callbacks
│   └── status.js            # Health check endpoint
├── lib/
│   └── twilio.js            # Twilio helper utilities
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore rules
├── vercel.json             # Vercel deployment config
├── package.json            # Dependencies
└── README.md               # This file
```

## 🔗 Webhook Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/webhook` | Main entry point for incoming calls |
| `POST /api/handle-speech` | Processes speech recognition results |
| `POST /api/handle-recording` | Processes voicemail recordings |
| `POST /api/transcription` | Receives transcription callbacks from Twilio |
| `GET /api/status` | Health check (returns service status) |

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

## 🚀 Next Steps: AI Integration

### Option 1: OpenAI Realtime API (Recommended)

Add real-time conversational AI with voice-to-voice:

1. Install OpenAI SDK: `npm install openai`
2. Add to `.env`: `OPENAI_API_KEY=sk-...`
3. Modify `api/handle-speech.js` to use OpenAI Realtime API
4. Replace TwiML responses with streaming audio

**Resources:**
- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [Twilio + OpenAI Tutorial](https://www.twilio.com/docs/voice/tutorials/openai-realtime-api)

### Option 2: OpenAI GPT-4 + TTS

For non-realtime but still powerful AI:

1. Use GPT-4 to analyze transcriptions
2. Generate intelligent responses
3. Convert to speech with OpenAI TTS
4. Play back via TwiML `<Play>` verb

### Option 3: Anthropic Claude

1. Install Anthropic SDK: `npm install @anthropic-ai/sdk`
2. Process transcriptions with Claude
3. Generate contextual responses
4. Convert to speech with ElevenLabs or similar

### Database Integration

Store call data for analytics:

```bash
npm install @vercel/postgres
# or
npm install mongodb
# or
npm install @supabase/supabase-js
```

Update `api/handle-recording.js` and `api/transcription.js` to persist data.

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

### "Invalid signature" error

- Ensure `TWILIO_AUTH_TOKEN` is correct
- Verify webhook URL is HTTPS (required for production)
- Check Vercel environment variables are set

### No call logs appearing

- Check Vercel deployment status
- Verify webhook URL in Twilio is correct
- Test with `curl` to the status endpoint

### "We are experiencing technical difficulties"

- Check Vercel logs for errors
- Verify all environment variables are set
- Ensure Twilio account has sufficient balance

## 💰 Cost Estimates

**Twilio (per call):**
- Voice: $0.013/min (US)
- Recording: $0.0025/min
- Transcription: $0.05/min

**Vercel:**
- Hobby: Free (100GB bandwidth, 100k invocations)
- Pro: $20/month (unlimited)

**OpenAI (when integrated):**
- GPT-4: ~$0.03 per call
- Realtime API: ~$0.10-0.40 per call

## 📚 Resources

- [Twilio Voice Docs](https://www.twilio.com/docs/voice)
- [TwiML Reference](https://www.twilio.com/docs/voice/twiml)
- [Vercel Docs](https://vercel.com/docs)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)

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
