/*
  Seed script for Supabase (business + phone + owner user)

  Required env:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
    SEED_BUSINESS_NAME
    SEED_BUSINESS_PHONE (E.164, e.g. +15551234567)

  Optional env:
    SEED_BUSINESS_EMAIL
    SEED_BUSINESS_TIMEZONE (default: America/New_York)
    SEED_OWNER_EMAIL
    SEED_OWNER_PASSWORD
    SEED_OWNER_USER_ID (if you already created a Supabase Auth user)
    TWILIO_PHONE_NUMBER_SID
    VAPI_ASSISTANT_ID
    VAPI_PHONE_NUMBER_ID
*/

const { createClient } = require('@supabase/supabase-js');

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SEED_BUSINESS_NAME,
  SEED_BUSINESS_EMAIL,
  SEED_BUSINESS_TIMEZONE,
  SEED_BUSINESS_PHONE,
  SEED_OWNER_EMAIL,
  SEED_OWNER_PASSWORD,
  SEED_OWNER_USER_ID,
  TWILIO_PHONE_NUMBER_SID,
  VAPI_ASSISTANT_ID,
  VAPI_PHONE_NUMBER_ID
} = process.env;

function required(value, name) {
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

required(SUPABASE_URL, 'SUPABASE_URL');
required(SUPABASE_SERVICE_KEY, 'SUPABASE_SERVICE_KEY');
required(SEED_BUSINESS_NAME, 'SEED_BUSINESS_NAME');
required(SEED_BUSINESS_PHONE, 'SEED_BUSINESS_PHONE');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function ensureOwnerUserId() {
  if (SEED_OWNER_USER_ID) return SEED_OWNER_USER_ID;
  if (!SEED_OWNER_EMAIL || !SEED_OWNER_PASSWORD) return null;

  const { data, error } = await supabase.auth.admin.createUser({
    email: SEED_OWNER_EMAIL,
    password: SEED_OWNER_PASSWORD,
    email_confirm: true
  });

  if (error) {
    console.error('Error creating Supabase Auth user:', error.message);
    return null;
  }

  return data?.user?.id || null;
}

async function getBusinessByPhone(phone) {
  const { data, error } = await supabase
    .from('business_phone_numbers')
    .select('business_id, businesses ( id, name )')
    .eq('phone_number', phone)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('Error looking up business by phone:', error.message);
    return null;
  }

  return data?.businesses || null;
}

async function createBusiness() {
  const { data, error } = await supabase
    .from('businesses')
    .insert({
      name: SEED_BUSINESS_NAME,
      email: SEED_BUSINESS_EMAIL || null,
      timezone: SEED_BUSINESS_TIMEZONE || 'America/New_York',
      vapi_assistant_id: VAPI_ASSISTANT_ID || null,
      vapi_phone_number_id: VAPI_PHONE_NUMBER_ID || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function upsertBusinessPhone(businessId) {
  const { data, error } = await supabase
    .from('business_phone_numbers')
    .upsert({
      business_id: businessId,
      phone_number: SEED_BUSINESS_PHONE,
      label: 'main',
      twilio_phone_number_sid: TWILIO_PHONE_NUMBER_SID || null,
      vapi_phone_number_id: VAPI_PHONE_NUMBER_ID || null,
      is_primary: true,
      active: true
    }, { onConflict: 'phone_number' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function upsertBusinessOwner(businessId, userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('business_users')
    .upsert({
      business_id: businessId,
      user_id: userId,
      role: 'owner'
    }, { onConflict: 'business_id,user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function main() {
  const existing = await getBusinessByPhone(SEED_BUSINESS_PHONE);
  let business = existing;

  if (business) {
    console.log(`Business already exists for phone. Using: ${business.id} (${business.name})`);
  } else {
    business = await createBusiness();
    console.log(`Created business: ${business.id} (${business.name})`);
  }

  const phone = await upsertBusinessPhone(business.id);
  console.log(`Upserted phone mapping: ${phone.phone_number} -> ${phone.business_id}`);

  const ownerId = await ensureOwnerUserId();
  if (ownerId) {
    const link = await upsertBusinessOwner(business.id, ownerId);
    console.log(`Linked owner user: ${link.user_id} -> ${link.business_id}`);
  } else {
    console.log('No owner user linked (set SEED_OWNER_USER_ID or SEED_OWNER_EMAIL/SEED_OWNER_PASSWORD)');
  }

  console.log('Seed complete. Business ID:', business.id);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
