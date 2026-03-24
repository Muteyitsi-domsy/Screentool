// Supabase Edge Function (Deno runtime)
// Verifies Lemon Squeezy webhook signatures and updates profiles.is_pro in Supabase.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-signature',
};

async function verifyLsSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computed === signatureHeader;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-signature') ?? '';
  const webhookSecret = Deno.env.get('LS_WEBHOOK_SECRET') ?? '';

  const valid = await verifyLsSignature(rawBody, signatureHeader, webhookSecret);
  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const eventName: string = event.meta?.event_name ?? '';
  const customData = event.meta?.custom_data ?? {};
  const data = event.data ?? {};
  const attributes = data.attributes ?? {};

  const supabaseUserId: string | undefined = customData.supabase_user_id;
  if (!supabaseUserId) {
    return new Response('No supabase_user_id in meta.custom_data', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let update: Record<string, unknown> = {};

  if (eventName === 'order_created' && attributes.status === 'paid') {
    // One-time / lifetime purchase
    update = {
      is_pro: true,
      plan_type: 'lifetime',
      subscription_status: 'free',
      ls_customer_id: String(attributes.customer_id ?? ''),
    };
  } else if (eventName === 'subscription_created') {
    update = {
      is_pro: true,
      plan_type: 'subscription',
      subscription_status: 'active',
      ls_customer_id: String(attributes.customer_id ?? ''),
      ls_subscription_id: String(data.id ?? ''),
    };
  } else if (eventName === 'subscription_updated') {
    const status: string = attributes.status ?? '';
    if (status === 'active') {
      update = { is_pro: true, subscription_status: 'active' };
    } else if (status === 'cancelled' || status === 'expired') {
      update = { is_pro: false, subscription_status: 'canceled' };
    } else if (status === 'paused') {
      update = { is_pro: false, subscription_status: 'paused' };
    } else {
      return new Response('Status not handled', { status: 200 });
    }
  } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
    update = { is_pro: false, subscription_status: 'canceled' };
  } else {
    return new Response('Event not handled', { status: 200 });
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', supabaseUserId);

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
