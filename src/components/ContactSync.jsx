import { useEffect, useRef, useState } from "react";
import { BookUser, FileUp, Lock, Mail, Phone } from "lucide-react";
import {
  canPickContacts, pickContacts, parseVcf, contactCodes, findAccounts, saveContactMatches, findableIdentifiers, isFindable, setFindable,
} from "../lib/contacts";
import { fetchProfile } from "../lib/db";
import { useShell } from "./shell/ShellContext";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import Avatar from "./ui/Avatar";
import Switch from "./ui/Switch";
import { InlineMessage, Spinner } from "./ui/States";
import { FollowButton } from "./SuggestedPeople";

/**
 * Find people from your contacts. Everything about the contacts stays on this
 * device: numbers and emails are scrambled here and only the codes are looked
 * up. Afterwards you choose whether people with your number or email can find you.
 */
export default function ContactSync({ onClose }) {
  const { following, setFollowing, blocked } = useShell();
  const [step, setStep] = useState("start"); // start | working | results
  const [found, setFound] = useState([]);
  const [checked, setChecked] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const run = async (contacts) => {
    setStep("working");
    setError("");
    try {
      const codes = await contactCodes(contacts);
      setChecked(codes.length);
      const uids = (await findAccounts(codes)).filter((u) => !blocked.has(u));
      await saveContactMatches(uids).catch(() => {});
      const profiles = (await Promise.all(uids.map((u) => fetchProfile(u).catch(() => null)))).filter(Boolean);
      setFound(profiles);
      setStep("results");
    } catch {
      setError("Couldn't check your contacts. Try again.");
      setStep("start");
    }
  };

  const pick = async () => {
    try { run(await pickContacts()); } catch { /* picker closed */ }
  };
  const importFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const parsed = parseVcf(await f.text());
    if (!parsed.phones.length && !parsed.emails.length) return setError("That file has no phone numbers or emails. Export your contacts as a .vcf (vCard) file.");
    run(parsed);
  };

  return (
    <Dialog title="Find your contacts" onClose={onClose} size="md">
      {step === "start" && (
        <div className="space-y-4">
          <p className="text-callout text-fg-muted">
            See which of your contacts are on Mesh. Their numbers and emails are turned into scrambled codes on this device, and only those
            codes are checked. Your contacts are never uploaded or stored; Mesh keeps only the accounts it finds, privately, to suggest them to you.
          </p>
          <p className="flex items-start gap-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            You'll only find people who chose to let their contacts find them.
          </p>
          <div className="flex flex-col gap-2">
            {canPickContacts() && <Button variant="primary" icon={BookUser} onClick={pick}>Choose contacts</Button>}
            <Button variant={canPickContacts() ? "secondary" : "primary"} icon={FileUp} onClick={() => fileRef.current?.click()}>Import a contacts file (.vcf)</Button>
            <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={importFile} tabIndex={-1} aria-hidden="true" />
          </div>
          <p className="text-caption text-fg-subtle">
            To get a .vcf file: on iPhone, open Contacts, select contacts and share them; on Android, Contacts → Export; or export from
            Google Contacts (contacts.google.com).
          </p>
          <InlineMessage>{error}</InlineMessage>
          <Findable />
        </div>
      )}
      {step === "working" && (
        <p className="flex items-center gap-3 py-8 text-callout text-fg-muted" role="status"><Spinner /> Checking{checked ? ` ${checked} numbers and emails` : ""}…</p>
      )}
      {step === "results" && (
        <div className="space-y-4">
          <p className="text-callout text-fg-muted">
            {found.length ? `${found.length} of your contacts ${found.length === 1 ? "is" : "are"} on Mesh.` : "None of your contacts are findable on Mesh yet. Invite them, or try again later."}
          </p>
          {found.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {found.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar profile={p} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-callout font-semibold">{p.name || p.username}</span>
                    <span className="block truncate text-caption text-fg-subtle">@{p.username} · In your contacts</span>
                  </span>
                  <FollowButton person={p} following={following} setFollowing={setFollowing} />
                </li>
              ))}
            </ul>
          )}
          <Findable />
          <div className="flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div>
        </div>
      )}
    </Dialog>
  );
}

/** Whether people who have your number or email can find you. Off unless you turn it on. */
export function Findable() {
  const ids = findableIdentifiers();
  const [state, setState] = useState({ phone: null, email: null });
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([isFindable("phone"), isFindable("email")])
      .then(([phone, email]) => { if (live) setState({ phone, email }); })
      .catch(() => { if (live) setState({ phone: false, email: false }); });
    return () => { live = false; };
  }, []);

  const toggle = async (kind, on) => {
    setError("");
    setState((s) => ({ ...s, [kind]: on }));
    try { await setFindable(kind, on); }
    catch (err) { setState((s) => ({ ...s, [kind]: !on })); setError(err?.message?.startsWith("Add a") || err?.message?.startsWith("Verify") ? err.message : "Couldn't change that. Try again."); }
  };

  const row = (kind, Icon, label, value, missing) => (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Icon size={18} className="shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-callout font-medium">{label}</span>
        <span className="block truncate text-caption text-fg-subtle">{value || missing}</span>
      </span>
      {value && <Switch checked={!!state[kind]} disabled={state[kind] === null} onChange={(v) => toggle(kind, v)} label={label} />}
    </li>
  );

  return (
    <section aria-label="Let your contacts find you">
      <h3 className="mb-1 text-callout font-semibold">Let your contacts find you</h3>
      <p className="mb-2 text-caption text-fg-subtle">Off unless you turn it on. Only a scrambled code of your own verified number or email is stored.</p>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
        {row("phone", Phone, "By my phone number", ids.phone, "No phone number on your account")}
        {row("email", Mail, "By my email", ids.email, "Verify your email in Settings to use this")}
      </ul>
      <InlineMessage>{error}</InlineMessage>
    </section>
  );
}
