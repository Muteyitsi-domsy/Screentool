import { createClient } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  is_pro: boolean;
  plan_type: 'free' | 'subscription' | 'lifetime';
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  subscription_status: 'free' | 'active' | 'canceled' | 'paused';
  created_at: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
