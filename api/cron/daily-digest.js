/**
 * Daily digest cron endpoint
 * Called by Vercel Cron (UTC schedule) to email business owners a summary.
 */

const { supabaseService } = require('../../lib/supabase');

const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const DASHBOARD_URL = process.env.DASHBOARD_URL;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!CRON_SECRET) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const providedSecret = req.headers['x-cron-secret'];
  if (providedSecret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseService) {
    return res.status(500).json({ error: 'Supabase service client not initialized' });
  }

  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return res.status(500).json({ error: 'Email provider not configured' });
  }

  try {
    const { data: businesses, error } = await supabaseService
      .from('businesses')
      .select('id, name, email, timezone, digest_enabled, digest_time_local, digest_timezone, last_digest_sent_at, active')
      .eq('digest_enabled', true)
      .eq('active', true);

    if (error) {
      console.error('❌ Error loading businesses for digest:', error);
      return res.status(500).json({ error: 'Failed to load businesses' });
    }

    let processed = 0;
    let sent = 0;
    const errors = [];

    for (const business of businesses || []) {
      processed += 1;

      try {
        const timeZone = business.digest_timezone || business.timezone || 'America/New_York';
        if (!shouldSendDigestNow(business, timeZone)) {
          continue;
        }
        const { startUtc, endUtc, label } = getPreviousDayRangeUtc(timeZone);

        const { data: calls, error: callsError } = await supabaseService
          .from('calls')
          .select('id, created_at, from_phone, customer_phone, status, intent, summary')
          .eq('business_id', business.id)
          .gte('created_at', startUtc.toISOString())
          .lt('created_at', endUtc.toISOString())
          .order('created_at', { ascending: false });

        if (callsError) throw callsError;

        const stats = buildCallStats(calls || []);
        const recipient = await resolveRecipientEmail(business);

        if (!recipient) {
          console.warn(`⚠️ No digest recipient for business ${business.id}`);
          continue;
        }

        const email = buildDigestEmail({
          business,
          recipient,
          timeZone,
          label,
          calls: calls || [],
          stats
        });

        const sendResult = await sendEmail(email);
        if (!sendResult.ok) {
          errors.push({ businessId: business.id, error: sendResult.error });
          continue;
        }

        await markDigestSent(business.id);
        sent += 1;
      } catch (err) {
        console.error('❌ Digest error for business:', business.id, err);
        errors.push({ businessId: business.id, error: err.message });
      }
    }

    return res.status(200).json({ processed, sent, errors });
  } catch (err) {
    console.error('❌ Digest cron failed:', err);
    return res.status(500).json({ error: 'Digest cron failed', message: err.message });
  }
};

async function resolveRecipientEmail(business) {
  if (business.email) return business.email;

  const { data: owners, error } = await supabaseService
    .from('business_users')
    .select('user_id, role')
    .eq('business_id', business.id)
    .eq('role', 'owner')
    .limit(1);

  if (error || !owners || owners.length === 0) return null;

  const ownerId = owners[0].user_id;
  try {
    const { data } = await supabaseService.auth.admin.getUserById(ownerId);
    return data?.user?.email || null;
  } catch (err) {
    console.error('❌ Failed to load owner email:', err);
    return null;
  }
}

function buildCallStats(calls) {
  const stats = {
    total: calls.length,
    missed: 0,
    intents: {}
  };

  for (const call of calls) {
    if (['no-answer', 'busy', 'failed'].includes(call.status)) {
      stats.missed += 1;
    }
    const intent = call.intent || 'unknown';
    stats.intents[intent] = (stats.intents[intent] || 0) + 1;
  }

  return stats;
}

function buildDigestEmail({ business, recipient, timeZone, label, calls, stats }) {
  const subject = `Daily Call Digest - ${business.name} (${label})`;
  const dashboardLink = DASHBOARD_URL || '';

  const topIntents = Object.entries(stats.intents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent, count]) => `${intent}: ${count}`)
    .join(', ');

  const keyCalls = calls.slice(0, 5).map((call) => {
    const time = formatDateTime(call.created_at, timeZone);
    const from = call.from_phone || call.customer_phone || 'unknown';
    const summary = call.summary ? call.summary.slice(0, 140) : 'No summary';
    return `${time} | ${from} | ${call.status || 'unknown'} | ${summary}`;
  });

  const text = [
    `Daily Call Digest for ${business.name}`,
    `Date: ${label} (${timeZone})`,
    '',
    `Total calls: ${stats.total}`,
    `Missed calls: ${stats.missed}`,
    `Top intents: ${topIntents || 'None'}`,
    '',
    'Key calls:',
    keyCalls.length ? keyCalls.join('\n') : 'No calls recorded.',
    '',
    dashboardLink ? `Dashboard: ${dashboardLink}` : ''
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
      <h2>Daily Call Digest</h2>
      <p><strong>${business.name}</strong></p>
      <p>Date: ${label} (${timeZone})</p>
      <hr />
      <p><strong>Total calls:</strong> ${stats.total}</p>
      <p><strong>Missed calls:</strong> ${stats.missed}</p>
      <p><strong>Top intents:</strong> ${topIntents || 'None'}</p>
      <h3>Key calls</h3>
      <ul>
        ${keyCalls.length ? keyCalls.map((c) => `<li>${escapeHtml(c)}</li>`).join('') : '<li>No calls recorded.</li>'}
      </ul>
      ${dashboardLink ? `<p><a href="${dashboardLink}">Open dashboard</a></p>` : ''}
    </div>
  `;

  return { to: recipient, subject, html, text };
}

async function sendEmail({ to, subject, html, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Resend error:', response.status, errorText);
    return { ok: false, error: errorText };
  }

  return { ok: true };
}

function shouldSendDigestNow(business, timeZone) {
  const digestTime = business.digest_time_local || '08:00';
  const [targetHour, targetMinute] = digestTime.split(':').map((part) => Number(part));

  if (!Number.isFinite(targetHour) || !Number.isFinite(targetMinute)) {
    return false;
  }

  const now = new Date();
  const parts = getTimeZoneParts(now, timeZone);
  if (parts.hour !== targetHour || parts.minute !== targetMinute) {
    return false;
  }

  if (!business.last_digest_sent_at) return true;

  const lastSentKey = getLocalDateKey(new Date(business.last_digest_sent_at), timeZone);
  const todayKey = getLocalDateKey(now, timeZone);
  return lastSentKey !== todayKey;
}

async function markDigestSent(businessId) {
  const { error } = await supabaseService
    .from('businesses')
    .update({ last_digest_sent_at: new Date().toISOString() })
    .eq('id', businessId);

  if (error) {
    console.error('❌ Failed to mark digest sent:', error);
  }
}

function getPreviousDayRangeUtc(timeZone) {
  const now = new Date();
  const parts = getTimeZoneParts(now, timeZone);
  const endUtc = zonedTimeToUtc(timeZone, {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
    second: 0
  });
  const startUtc = new Date(endUtc.getTime() - 24 * 60 * 60 * 1000);
  const label = formatDate(startUtc, timeZone);

  return { startUtc, endUtc, label };
}

function getTimeZoneParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getTimeZoneOffset(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUTC - date.getTime();
}

function zonedTimeToUtc(timeZone, parts) {
  const utcGuess = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  ));
  const offset = getTimeZoneOffset(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function getLocalDateKey(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function formatDateTime(dateString, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(dateString));
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
