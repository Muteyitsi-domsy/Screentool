// Supabase Edge Function (Deno runtime)
// Verifies Paddle webhook signatures and updates profiles.is_pro in Supabase.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, paddle-signature',
};

async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  // Paddle sends: "ts=<unix_ts>;h1=<hmac_sha256>"
  const parts = Object.fromEntries(
    signatureHeader.split(';').map((p) => {
      const [k, ...v] = p.split('=');
      return [k.trim(), v.join('=')];
    })
  );
  const ts = parts['ts'];
  const h1 = parts['h1'];
  if (!ts || !h1) return false;

  const signedPayload = `${ts}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computed === h1;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get('paddle-signature') ?? '';
  const webhookSecret = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? '';

  const valid = await verifyPaddleSignature(rawBody, signatureHeader, webhookSecret);
  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const eventType: string = event.event_type;
  const data = event.data;

  const supabaseUserId: string | undefined = data?.custom_data?.supabase_user_id;
  if (!supabaseUserId) {
    return new Response('No supabase_user_id in custom_data', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let update: Record<string, unknown> = {};

  if (eventType === 'subscription.activated') {
    update = {
      is_pro: true,
      plan_type: 'subscription',
      subscription_status: 'active',
      paddle_customer_id: data.customer_id,
      paddle_subscription_id: data.id,
    };
  } else if (eventType === 'transaction.completed' && !data.subscription_id) {
    // One-time / lifetime purchase
    update = {
      is_pro: true,
      plan_type: 'lifetime',
      subscription_status: 'free',
      paddle_customer_id: data.customer_id,
    };
  } else if (eventType === 'subscription.canceled') {
    update = { is_pro: false, subscription_status: 'canceled' };
  } else if (eventType === 'subscription.paused') {
    update = { is_pro: false, subscription_status: 'paused' };
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
