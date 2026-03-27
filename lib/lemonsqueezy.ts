// Lemon Squeezy overlay checkout
// Requires the Lemon Squeezy script loaded in index.html:
//   <script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>

declare global {
  interface Window {
    LemonSqueezy?: {
      Url: { Open: (url: string) => void };
      Setup: (config?: { eventHandler?: (event: { event: string }) => void }) => void;
    };
    createLemonSqueezy?: () => void;
  }
}

export const initLemonSqueezy = (): void => {
  if (window.createLemonSqueezy) {
    window.createLemonSqueezy();
  }
};

export const openLemonSqueezyCheckout = (
  variantId: string,
  email?: string,
  supabaseUserId?: string
): void => {
  if (!variantId) return;
  const storeSlug = import.meta.env.VITE_LS_STORE_SLUG;
  if (!storeSlug) return;

  const params = new URLSearchParams({ embed: '1', media: '0' });
  if (email) params.set('checkout[email]', email);
  if (supabaseUserId) params.set('checkout[custom][supabase_user_id]', supabaseUserId);

  const url = `https://${storeSlug}.lemonsqueezy.com/checkout/buy/${variantId}?${params}`;
  console.log('[LS] checkout url:', url);

  if (window.LemonSqueezy) {
    window.LemonSqueezy.Url.Open(url);
  } else {
    // Fallback: open in new tab if script hasn't loaded yet
    window.open(url, '_blank');
  }
};
