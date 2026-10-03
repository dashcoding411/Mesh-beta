import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { allowAll, CHOICES_EVENT, essentialOnly, optionalItems, readConsent, setConsent, useConsent } from "../lib/consent";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import Switch from "./ui/Switch";

// Asks before anything optional loads. Until someone chooses, only essential
// storage is used: closing or ignoring the banner never counts as a yes.
// "Essential only" is offered exactly as prominently as "Allow all".
export default function StorageNotice({ onReadMore }) {
  const consent = useConsent();
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    const open = () => setChoosing(true);
    window.addEventListener(CHOICES_EVENT, open);
    return () => window.removeEventListener(CHOICES_EVENT, open);
  }, []);

  return (
    <>
      {consent === null && !choosing && (
        <aside aria-label="Cookies on Mesh" data-cookie-banner
          className="fixed inset-x-3 bottom-[calc(68px+env(safe-area-inset-bottom))] z-overlay rounded-card border border-line-strong bg-surface-2 p-4 shadow-overlay anim-rise md:bottom-4 md:left-auto md:right-4 md:w-[400px]">
          <div className="flex gap-3">
            <Cookie size={20} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-callout font-semibold text-fg">Your choice on cookies</p>
              <p className="mt-1 text-callout text-fg-muted">
                Mesh only stores what it needs to work, like keeping you signed in. {optionalItems().length === 1
                  ? "Google's security check sets its own cookies, so it stays off unless you allow it."
                  : "A few extras from other companies set their own cookies, so they stay off unless you allow them."} No ads, no analytics.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={essentialOnly}>Essential only</Button>
            <Button size="sm" onClick={allowAll}>Allow all</Button>
          </div>
          <div className="mt-1 flex justify-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>Choose</Button>
            <Button size="sm" variant="ghost" onClick={onReadMore}>What's stored</Button>
          </div>
        </aside>
      )}
      {choosing && <CookieChoices onClose={() => setChoosing(false)} onReadMore={onReadMore} />}
    </>
  );
}

function CookieChoices({ onClose, onReadMore }) {
  const items = optionalItems();
  const [picked, setPicked] = useState(() => Object.fromEntries(items.map((i) => [i.id, !!readConsent()?.[i.id]])));
  const save = () => { setConsent(picked); onClose(); };

  return (
    <Dialog title="Cookies and storage" onClose={onClose} size="sm"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save choices</Button>
        </div>
      )}>
      <ul className="divide-y divide-line">
        <li className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-callout font-semibold">Essential</p>
            <p className="mt-0.5 text-caption text-fg-muted">Keeps you signed in, stops spam and remembers your settings on this device. Mesh can't work without it.</p>
          </div>
          <span className="shrink-0 pt-0.5 text-caption font-semibold text-fg-subtle">Always on</span>
        </li>
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p id={`consent-${item.id}`} className="text-callout font-semibold">{item.label}</p>
              <p className="mt-0.5 text-caption text-fg-muted">{item.body}</p>
            </div>
            <Switch checked={picked[item.id]} label={item.label}
              onChange={(on) => setPicked((p) => ({ ...p, [item.id]: on }))} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-fg-subtle">
        Turning something off takes full effect the next time you open Mesh. Change this any time in Settings, or from the{" "}
        <button type="button" className="font-semibold text-accent-text underline underline-offset-2" onClick={() => { onClose(); onReadMore(); }}>Cookies policy</button>.
      </p>
    </Dialog>
  );
}
