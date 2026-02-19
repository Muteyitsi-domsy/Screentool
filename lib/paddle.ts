import { initializePaddle, type Paddle } from '@paddle/paddle-js';

let paddle: Paddle | undefined;

export const initPaddle = async (): Promise<void> => {
  if (paddle) return;
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
  if (!token) return;
  const env = import.meta.env.VITE_PADDLE_ENVIRONMENT as 'sandbox' | 'production' | undefined;
  paddle = await initializePaddle({
    environment: env ?? 'sandbox',
    token,
  });
};

export const openPaddleCheckout = (
  priceId: string,
  email?: string,
  supabaseUserId?: string
): void => {
  if (!paddle || !priceId) return;
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: email ? { email } : undefined,
    customData: supabaseUserId ? { supabase_user_id: supabaseUserId } : undefined,
  });
};
