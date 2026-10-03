import { useEffect, useId, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { ADSENSE, fillAdsense, loadAdsense } from "../lib/adsense";
import { AdHeader } from "./AdCard";

/**
 * A Google AdSense in-feed ad, for ad spaces no local ad is booked for. Only
 * rendered for adults who allowed "Google ads"; labelled like every ad, and
 * removed if Google has nothing to show.
 */
export default function GoogleAdCard() {
  const insRef = useRef(null);
  const asked = useRef(false);
  const [empty, setEmpty] = useState(false);
  const [why, setWhy] = useState(false);
  const whyId = useId();

  useEffect(() => {
    const ins = insRef.current;
    if (!ins) return undefined;
    // Google marks the slot "unfilled" when there's no ad; then it goes away.
    const watch = new MutationObserver(() => { if (ins.dataset.adStatus === "unfilled") setEmpty(true); });
    watch.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    let live = true;
    loadAdsense().then((ok) => {
      if (!live) return;
      if (!ok) { setEmpty(true); return; }
      if (!asked.current) { asked.current = true; fillAdsense(); }
    });
    return () => { live = false; watch.disconnect(); };
  }, []);

  if (empty) return null;
  return (
    <aside aria-label="Ad from Google" className="py-3.5 md:rounded-card md:border md:border-line md:bg-surface">
      <AdHeader name="Google ad" icon={Megaphone} why={why} setWhy={setWhy} whyId={whyId} />
      {why && (
        <p id={whyId} className="mx-4 mt-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
          No local ad was booked for this space, and you turned on Google ads in your cookie choices. Mesh asks Google for ads that
          aren't personalised. Turn it off any time in Settings, under Cookies and storage.
        </p>
      )}
      {/* Full width like a post's photo; variable height, as Google asks for in-feed ads. */}
      <div className="mt-3 w-full overflow-hidden">
        <ins ref={insRef} className="adsbygoogle" style={{ display: "block" }}
          data-ad-format="fluid" data-ad-layout-key={ADSENSE.layoutKey}
          data-ad-client={ADSENSE.client} data-ad-slot={ADSENSE.slot} />
      </div>
    </aside>
  );
}
