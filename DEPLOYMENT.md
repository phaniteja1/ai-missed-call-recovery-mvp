# 🚀 Quick Deployment Guide

## Step-by-Step Deployment to Vercel

### 1. Deploy to Vercel (2 minutes)

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd /Users/gilfoyle/projects/ai-missed-call-recovery-mvp
vercel --prod
```

**During deployment:**
- Project name: `ai-missed-call-recovery-mvp` (or custom name)
- Vercel will auto-detect settings from `vercel.json`

### 2. Set Environment Variables in Vercel

After deployment, set these in Vercel Dashboard:

1. Go to: https://vercel.com/dashboard
2. Select your project → Settings → Environment Variables
3. Add these three variables:

```
TWILIO_ACCOUNT_SID = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN = your_auth_token_here
TWILIO_PHONE_NUMBER = +1234567890
```

4. Click "Save"
5. Redeploy: `vercel --prod` (to apply env vars)

### 3. Configure Twilio Webhook

Your Vercel URL will be: `https://ai-missed-call-recovery-mvp.vercel.app`

1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Click your phone number
3. Under "Voice Configuration" → "A CALL COMES IN":
   - Webhook: `https://ai-missed-call-recovery-mvp.vercel.app/api/webhook`
   - Method: `HTTP POST`
4. Click "Save"

### 4. Test the System

Call your Twilio number! You should hear:
> "Hello! Thank you for calling. What can I help you with today?"

### 5. Monitor Logs

```bash
# Live logs
vercel logs --follow

# Or via dashboard
# https://vercel.com/dashboard → Your Project → Logs
```

---

## ✅ What You Have Now

- ✅ Production webhook endpoint
- ✅ Speech recognition working
- ✅ Voicemail recording + transcription
- ✅ Health check endpoint: `/api/status`
- ✅ Proper error handling
- ✅ Request validation from Twilio

---

## 🎯 Next: Add AI Intelligence

### Option 1: OpenAI Realtime API (Voice-to-Voice)

Best for natural conversations:

```bash
npm install openai ws
```

Add to Vercel env vars:
```
OPENAI_API_KEY=sk-proj-...
```

**Implementation:**
- Replace TwiML `<Gather>` with WebSocket streaming
- Connect caller audio → OpenAI Realtime API
- Stream AI responses back to caller in real-time
- Full conversational AI with interruptions, natural pauses

**Tutorial:** https://www.twilio.com/docs/voice/tutorials/openai-realtime-api

### Option 2: GPT-4 + ElevenLabs TTS

Best for scripted, high-quality responses:

```bash
npm install openai elevenlabs-node
```

**Flow:**
1. Caller speaks → Twilio transcribes
2. Send transcription to GPT-4
3. GPT-4 generates response
4. Convert to speech with ElevenLabs
5. Play back via TwiML `<Play>`

### Option 3: Claude (Anthropic)

Best for thoughtful, detailed responses:

```bash
npm install @anthropic-ai/sdk
```

Similar flow to GPT-4, but with Claude's reasoning capabilities.

---

## 📊 Add Database (Optional)

Store call history for analytics:

### Vercel Postgres (Easiest)
```bash
npm install @vercel/postgres
```

### Supabase (Full Backend)
```bash
npm install @supabase/supabase-js
```

### MongoDB Atlas (NoSQL)
```bash
npm install mongodb
```

**Schema suggestion:**
```javascript
{
  callSid: String,
  from: String,
  to: String,
  timestamp: Date,
  speechInput: String,
  transcription: String,
  recordingUrl: String,
  duration: Number,
  aiResponse: String,
  sentiment: String
}
```

---

## 💡 Pro Tips

1. **Test locally first:**
   ```bash
   vercel dev
   ngrok http 3000
   # Use ngrok URL in Twilio temporarily
   ```

2. **Monitor costs:**
   - Twilio: ~$0.02 per minute (voice + recording + transcription)
   - OpenAI: ~$0.10-0.40 per call (Realtime API)
   - Vercel: Free tier = 100k invocations/month

3. **Scale considerations:**
   - Add Redis for rate limiting
   - Use queues (BullMQ, SQS) for async processing
   - Implement proper logging (Datadog, LogRocket)

4. **Security checklist:**
   - ✅ Twilio signature validation (already implemented)
   - ✅ HTTPS only (Vercel handles this)
   - ⚠️ Add rate limiting for production
   - ⚠️ Implement authentication for admin endpoints

---

## 🐛 Common Issues

**"Invalid signature"**
- Verify `TWILIO_AUTH_TOKEN` is correct
- Ensure webhook URL is exact (no trailing slash)
- Check Vercel env vars are deployed

**No logs appearing**
- Wait 30-60 seconds after deployment
- Check Vercel deployment status
- Test status endpoint: `curl https://your-url.vercel.app/api/status`

**"Technical difficulties" message**
- Check Vercel logs for errors
- Verify all 3 env vars are set
- Ensure Twilio account has credit

---

## 📞 Support

- GitHub Issues: https://github.com/phaniteja1/ai-missed-call-recovery-mvp/issues
- Twilio Support: https://support.twilio.com
- Vercel Support: https://vercel.com/support

**Happy building! 🎉**
