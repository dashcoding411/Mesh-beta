import { useState, useRef, useEffect, useId } from "react";
import { auth } from "../firebase";
import { signInWithPhoneNumber, RecaptchaVerifier } from "firebase/auth";
import {
  signInEmail, signUpEmail, signInGoogle, signInApple,
  resetPassword, applyPersistence, authMessage, isCancellation,
} from "../lib/auth";
import { validateUsername, validBirthYear } from "../lib/validate";
import { checkName } from "../lib/moderation";
import { claimUsernameAndCreateProfile, usernameTaken, fetchProfile } from "../lib/db";
import { Eye, EyeOff, AlertTriangle, Check } from "lucide-react";
import { navigate } from "../lib/router";
import { LogoMark } from "./shell/Sidebar";
import Dialog from "./ui/Dialog";
import Tabs from "./ui/Tabs";

/* Inputs use text-base (16px) so iOS Safari never zooms on focus, and every
   control clears the 44px touch target minimum. */
const FIELD =
  "field w-full min-h-12 rounded-control bg-surface-2 border border-field px-4 py-3 text-input text-fg " +
  "placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent-text focus:ring-4 focus:ring-accent/25 transition-colors";
const FIELD_BAD = "!border-danger-text focus:!ring-red-500/20";
const SOCIAL =
  "press w-full min-h-12 rounded-control px-4 font-semibold text-body flex items-center justify-center gap-3 " +
  "disabled:opacity-50 transition-colors";
const PRIMARY = "bg-accent text-white hover:bg-accent-hover shadow-raised";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

const APPLE_ENABLED = import.meta.env.VITE_APPLE_SIGNIN === "on";

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [method, setMethod] = useState("email"); // 'email' | 'phone'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(true);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pendingUser, setPendingUser] = useState(null); // OAuth/phone user with no Mesh profile
  const [consent, setConsent] = useState(false);

  const recaptchaRef = useRef(null);
  const ids = {
    email: useId(), password: useId(), username: useId(), displayName: useId(),
    birthYear: useId(), phone: useId(), code: useId(), remember: useId(), consent: useId(),
  };

  useEffect(() => { applyPersistence(remember).catch(() => {}); }, [remember]);

  const fail = (err) => {
    if (isCancellation(err)) {
      // Popup dismissed: return quietly, keeping whatever was typed.
      setError("");
      return;
    }
    setError(authMessage(err));
  };

  const onPasswordKey = (e) => setCapsOn(e.getModifierState?.("CapsLock") ?? false);

  const validateNewUsername = async (raw) => {
    const v = validateUsername(raw);
    if (v.error) throw new Error(v.error);
    const nameCheck = checkName(v.username);
    if (nameCheck.error) throw new Error(nameCheck.error);
    if (await usernameTaken(v.username)) throw new Error("That username is already taken.");
    return v.username;
  };

  const afterProviderSignIn = async (cred) => {
    const profile = await fetchProfile(cred.user.uid);
    if (!profile) setPendingUser(cred.user);
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") {
        if (!consent) throw new Error("Please accept the Terms and Privacy Policy to create an account.");
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const vYear = validBirthYear(birthYear);
        if (vYear.error) throw new Error(vYear.error);
        const uname = await validateNewUsername(username);
        const cred = await signUpEmail(email, password, remember);
        await claimUsernameAndCreateProfile(cred.user, uname, vYear.year, displayName.trim());
      } else {
        await signInEmail(email, password, remember);
      }
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const handleProvider = async (fn) => {
    setError(""); setNotice(""); setBusy(true);
    try { await afterProviderSignIn(await fn(remember)); }
    catch (err) { fail(err); } finally { setBusy(false); }
  };

  const sendSms = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (!/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
        throw new Error("Enter your number in international format, e.g. +61 412 345 678");
      }
      await applyPersistence(remember);
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      setConfirmation(await signInWithPhoneNumber(auth, phone.trim(), recaptchaRef.current));
    } catch (err) {
      fail(err);
      recaptchaRef.current?.clear?.();
      recaptchaRef.current = null;
    } finally { setBusy(false); }
  };

  const verifySms = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try { await afterProviderSignIn(await confirmation.confirm(smsCode.trim())); }
    catch (err) { fail(err); } finally { setBusy(false); }
  };

  const finishProfile = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (!consent) throw new Error("Please accept the Terms and Privacy Policy to create an account.");
      const vYear = validBirthYear(birthYear);
      if (vYear.error) throw new Error(vYear.error);
      const uname = await validateNewUsername(username);
      await claimUsernameAndCreateProfile(pendingUser, uname, vYear.year, displayName.trim());
      window.location.reload();
    } catch (err) { fail(err); setBusy(false); }
  };

  const doReset = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await resetPassword(email);
      setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
      setShowReset(false);
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  // Policies have their own URLs and are readable signed-out; Back returns here.
  const openDoc = (id) => (e) => { e.preventDefault(); navigate(`/legal/${id}`); };

  const consentBox = (
    <div className="flex items-start gap-3 py-1">
      <input id={ids.consent} type="checkbox" checked={consent} required
        onChange={(e) => setConsent(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-field bg-surface-2 accent-violet-600" />
      <label htmlFor={ids.consent} className="cursor-pointer select-none text-callout text-fg-muted">
        I've read and accept the{" "}
        <a href="/legal/terms" onClick={openDoc("terms")} className="font-medium text-accent-text underline underline-offset-2">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/legal/privacy" onClick={openDoc("privacy")} className="font-medium text-accent-text underline underline-offset-2">
          Privacy Policy
        </a>.
      </label>
    </div>
  );

  /* ---------- finish-profile step for OAuth / phone users ---------- */
  if (pendingUser) {
    return (
      <Shell>
        <form onSubmit={finishProfile} className="space-y-4 anim-rise" noValidate>
          <div>
            <h2 className="text-title-1 font-display">Finish setting up</h2>
            <p className="mt-1 text-callout text-fg-muted">Choose how you'll appear on Mesh.</p>
          </div>
          <Field id={ids.displayName} label="Name" hint="How you'll appear. Names can repeat.">
            <input id={ids.displayName} className={FIELD} value={displayName} autoComplete="name"
              onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder="Alex Nguyen" />
          </Field>
          <Field id={ids.username} label="Handle" hint="Unique to you. Changeable once every 30 days.">
            <input id={ids.username} className={FIELD} value={username} autoFocus autoComplete="username"
              onChange={(e) => setUsername(e.target.value)} maxLength={30} placeholder="yourname" />
          </Field>
          <Field id={ids.birthYear} label="Birth year" hint="Used only to apply age protections.">
            <input id={ids.birthYear} className={FIELD} type="number" inputMode="numeric"
              value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="2001" />
          </Field>
          {consentBox}
          <Alert error={error} />
          <button disabled={busy} className={`${SOCIAL} ${PRIMARY}`}>
            {busy ? "Saving…" : "Enter Mesh"}
          </button>
        </form>
      </Shell>
    );
  }

  const signup = mode === "signup";

  return (
    <Shell>
      <div className="anim-fade">
        <h2 className="text-title-1 font-display">
          {signup ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mb-6 mt-1 text-callout text-fg-muted">
          {signup ? "Join the fabric. It takes a minute." : "Log in to pick up where you left off."}
        </p>

        {/* ---- social first ---- */}
        <div className="space-y-2.5">
          <button onClick={() => handleProvider(signInGoogle)} disabled={busy}
            className={`${SOCIAL} bg-white text-zinc-900 hover:bg-zinc-200`}>
            <GoogleMark /> Continue with Google
          </button>
          {/* Sign in with Apple needs an Apple Developer account and a Services ID
              set up in Firebase first; until then the button would only fail. */}
          {APPLE_ENABLED && (
            <button onClick={() => handleProvider(signInApple)} disabled={busy}
              className={`${SOCIAL} bg-black text-white border border-line-strong hover:bg-surface`}>
              <AppleMark /> Continue with Apple
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-caption text-fg-subtle">
          We only use this to verify who you are. Mesh will never post without your permission.
        </p>

        <div className="my-6 flex items-center gap-3 text-caption text-fg-subtle">
          <div className="h-px flex-1 bg-line" />
          <span>or {signup ? "sign up" : "log in"} with</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {/* ---- email / phone switch ---- */}
        <Tabs label="Sign-in method" value={method} className="mb-5 flex w-full"
          onChange={(m) => { setMethod(m); setError(""); setConfirmation(null); }}
          tabs={[{ id: "email", label: "Email" }, { id: "phone", label: "Phone" }]} />

        {method === "email" ? (
          <form onSubmit={handleEmail} className="space-y-4" noValidate>
            {signup && (
              <>
                <Field id={ids.displayName} label="Name" hint="How you'll appear. Names can repeat.">
                  <input id={ids.displayName} className={FIELD} value={displayName} autoComplete="name"
                    onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder="Alex Nguyen" />
                </Field>
                <Field id={ids.username} label="Handle" hint="Unique to you. Changeable once every 30 days.">
                  <input id={ids.username} className={FIELD} value={username} autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)} maxLength={30} placeholder="yourname" />
                </Field>
                <Field id={ids.birthYear} label="Birth year" hint="Under-16 accounts can't post publicly.">
                  <input id={ids.birthYear} className={FIELD} type="number" inputMode="numeric"
                    value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="2001" />
                </Field>
              </>
            )}

            <Field id={ids.email} label="Email address">
              <input id={ids.email} className={`${FIELD} ${error ? FIELD_BAD : ""}`} type="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete={signup ? "email" : "username"} placeholder="name@example.com"
                aria-invalid={error ? "true" : undefined} />
            </Field>

            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor={ids.password} className="block text-callout font-medium text-fg">Password</label>
                {!signup && (
                  <button type="button" onClick={() => { setShowReset(true); setError(""); }}
                    className="-my-2 inline-flex min-h-9 items-center text-caption font-semibold text-accent-text hover:underline underline-offset-2">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input id={ids.password} className={`${FIELD} pr-12 ${error ? FIELD_BAD : ""}`}
                  type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={onPasswordKey} onKeyDown={onPasswordKey}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={signup ? "At least 8 characters" : "Your password"}
                  aria-invalid={error ? "true" : undefined} />
                <button type="button" onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle hover:text-fg">
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
              {capsOn && (
                <p role="status" className="mt-1.5 flex items-center gap-1.5 text-caption text-warning-text">
                  <AlertTriangle size={14} aria-hidden="true" /> Caps Lock is on.
                </p>
              )}
            </div>

            <label htmlFor={ids.remember} className="flex min-h-11 cursor-pointer select-none items-center gap-3">
              <input id={ids.remember} type="checkbox" checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-5 w-5 rounded-md border-field bg-surface-2 accent-violet-600" />
              <span className="text-callout text-fg-muted">Keep me signed in on this device</span>
            </label>

            {signup && consentBox}

            <Alert error={error} notice={notice} />

            <button disabled={busy}
              className={`${SOCIAL} ${PRIMARY}`}>
              {busy ? "One moment…" : signup ? "Create account" : "Log in"}
            </button>
          </form>
        ) : confirmation ? (
          <form onSubmit={verifySms} className="space-y-4 anim-rise" noValidate>
            <Field id={ids.code} label="Verification code" hint={`Sent by SMS to ${phone}.`}>
              <input id={ids.code} className={`${FIELD} text-center text-2xl tracking-[0.4em]`}
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                value={smsCode} onChange={(e) => setSmsCode(e.target.value)} placeholder="······" />
            </Field>
            <Alert error={error} />
            <button disabled={busy}
              className={`${SOCIAL} ${PRIMARY}`}>
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
            <button type="button" onClick={() => { setConfirmation(null); setSmsCode(""); }}
              className="min-h-11 w-full text-callout font-medium text-fg-muted hover:text-fg">
              Use a different number
            </button>
          </form>
        ) : (
          <form onSubmit={sendSms} className="space-y-4" noValidate>
            <Field id={ids.phone} label="Phone number" hint="Include your country code. We'll text you a code.">
              <input id={ids.phone} className={FIELD} type="tel" autoComplete="tel"
                value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61 412 345 678" />
            </Field>
            <Alert error={error} />
            <button disabled={busy}
              className={`${SOCIAL} ${PRIMARY}`}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-callout text-fg-muted">
          {signup ? "Already have an account? " : "New to Mesh? "}
          <button type="button" onClick={() => { setMode(signup ? "login" : "signup"); setError(""); setNotice(""); }}
            className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline underline-offset-2">
            {signup ? "Log in" : "Create an account"}
          </button>
        </p>

        <p className="mt-6 text-center text-caption text-fg-subtle">
          <a href="/legal/terms" onClick={openDoc("terms")} className="inline-flex min-h-8 items-center underline underline-offset-2 hover:text-fg">Terms</a>
          {" · "}
          <a href="/legal/privacy" onClick={openDoc("privacy")} className="inline-flex min-h-8 items-center underline underline-offset-2 hover:text-fg">Privacy</a>
          {" · "}
          <a href="/legal/cookies" onClick={openDoc("cookies")} className="inline-flex min-h-8 items-center underline underline-offset-2 hover:text-fg">Cookies</a>
          {" · "}
          <a href="/legal/guidelines" onClick={openDoc("guidelines")} className="inline-flex min-h-8 items-center underline underline-offset-2 hover:text-fg">Guidelines</a>
          <span className="mt-2 block">
            We filter hate speech against every group. No automated filter catches everything, so
            report what slips through.
          </span>
        </p>
      </div>

      {showReset && (
        <ResetModal email={email} setEmail={setEmail} onSubmit={doReset}
          onClose={() => setShowReset(false)} busy={busy} error={error} fieldClass={FIELD} />
      )}
      <div id="recaptcha-container" />
    </Shell>
  );
}

/* ---------- layout + small pieces ---------- */

function Shell({ children }) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-violet-950 via-canvas to-fuchsia-950/60 lg:flex">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-md px-12 anim-rise">
          <LogoMark size={64} />
          <p className="mt-8 font-display text-[3.5rem] font-extrabold leading-[1.05] tracking-tight">
            Making Every<br />Story Heard.
          </p>
          <ul className="mt-8 space-y-3 text-body text-fg-muted">
            {[
              "Flicks, Stills and Strands in one feed",
              "News that has to show its sources",
              "No ads, no data sold, no third-party trackers",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-accent-ring"><Check size={14} aria-hidden="true" /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-sm py-8">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <LogoMark size={52} />
            <h1 className="mt-3 font-display text-display font-extrabold tracking-tight">Mesh</h1>
            <p className="mt-1 text-callout text-fg-muted">Making Every Story Heard</p>
          </div>
          <h1 className="sr-only lg:not-sr-only lg:hidden">Mesh</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-callout font-medium text-fg">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-caption text-fg-subtle">{hint}</p>}
    </div>
  );
}

function Alert({ error, notice }) {
  return (
    <div aria-live="polite" className="min-h-5">
      {error && (
        <p className="flex items-start gap-1.5 text-callout text-danger-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}
        </p>
      )}
      {!error && notice && (
        <p className="flex items-start gap-1.5 text-callout text-success-text">
          <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{notice}
        </p>
      )}
    </div>
  );
}

function ResetModal({ email, setEmail, onSubmit, onClose, busy, error, fieldClass }) {
  return (
    <Dialog title="Reset your password" onClose={onClose} variant="center" size="sm">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-callout text-fg-muted">We'll email you a link to set a new one.</p>
        <div>
          <label htmlFor="reset-email" className="mb-1.5 block text-callout font-medium">Email address</label>
          <input id="reset-email" className={fieldClass} type="email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <Alert error={error} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="press min-h-11 flex-1 rounded-control border border-line-strong bg-surface-2 text-callout font-semibold hover:bg-surface-3">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="press min-h-11 flex-1 rounded-control bg-accent text-callout font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
