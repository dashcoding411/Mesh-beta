// Google AdSense, as a fallback for ad spaces in Home that no local ad has
// been booked for. Nothing from Google loads until someone 18 or over turns
// on "Google ads" in their cookie choices; then ads are requested
// non-personalised. Settings come from .env (VITE_ADSENSE_*).
export const ADSENSE = {
  client: import.meta.env.VITE_ADSENSE_CLIENT || "",
  slot: import.meta.env.VITE_ADSENSE_SLOT || "",
  layoutKey: import.meta.env.VITE_ADSENSE_LAYOUT_KEY || "",
};
export const adsenseEnabled = !!(ADSENSE.client && ADSENSE.slot);

let loading = null;
/** Adds Google's ad script once. Call only after consent. */
export function loadAdsense() {
  if (!adsenseEnabled || typeof document === "undefined") return Promise.resolve(false);
  loading ||= new Promise((resolve) => {
    window.adsbygoogle = window.adsbygoogle || [];
    // Contextual ads only: nothing based on the person's browsing.
    window.adsbygoogle.requestNonPersonalizedAds = 1;
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE.client)}`;
    s.onload = () => resolve(true);
    s.onerror = () => { loading = null; resolve(false); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Asks Google to fill one <ins class="adsbygoogle"> element. */
export function fillAdsense() {
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked, or already filled */ }
}
