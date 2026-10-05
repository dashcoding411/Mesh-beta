import { useEffect, useId, useRef, useState } from "react";
import { auth } from "../firebase";
import { signInWithPhoneNumber, RecaptchaVerifier, signOut } from "firebase/auth";
import {
  signInEmail, signUpEmail, signInGoogle, signInApple,
  resetPassword, applyPersistence, authMessage, isCancellation, storageBlocked,
} from "../lib/auth";
import { validateUsername, validBirthYear, passwordProblem } from "../lib/validate";
import { checkName } from "../lib/moderation";
import { claimUsernameAndCreateProfile, usernameTaken, fetchProfile, saveOwnLimits } from "../lib/db";
import { emptyLayer } from "../lib/brick";
import { Eye, EyeOff, AlertTriangle, Check, ArrowLeft, Loader2 } from "lucide-react";
import { authPath, goBack, navigate } from "../lib/router";
import { LogoMark } from "./shell/Sidebar";
import { LATTICE } from "../lib/covers";
import Dialog from "./ui/Dialog";
import Segmented from "./ui/Segmented";
import { isNativeApp } from "../lib/native";
import { ageLockedUntil, lockAge, underSixteen, LOCK_DAYS } from "../lib/ageLock";
import { BUSINESS } from "../legal/business";

// Inputs are 16px so iOS Safari doesn't zoom on focus.
const FIELD =
  "field w-full min-h-12 rounded-control bg-surface-2 border border-field px-4 py-3 text-input text-fg " +
  "placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent-text focus:ring-4 focus:ring-accent/25 transition-colors";
const FIELD_BAD = "!border-danger-text focus:!ring-red-500/20";
const SOCIAL =
  "press w-full min-h-12 rounded-control px-4 font-semibold text-body flex items-center justify-center gap-3 " +
  "disabled:opacity-50 transition-colors";
const PRIMARY = "bg-accent text-white hover:bg-accent-hover shadow-raised";
const LINK = "font-semibold text-accent-text underline underline-offset-2";

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
// Inside the iPhone app, Google and Apple sign-in need native sign-in (not set
// up yet) and phone sign-in needs reCAPTCHA, so the app offers email for now.
const EMAIL_ONLY = isNativeApp;

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

// Log in, or sign up in two steps: how you sign in (Google, email or phone),
// then your name, handle and birth year. `pendingUser` is signed in without a
// profile (step two); `onCreated` runs once the profile exists.
export default function AuthPage({ initialMode = "login", pendingUser: signedInUser = null, onCreated }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'signup'
  const [method, setMethod] = useState("email"); // 'email' | 'phone'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(true);
  const [noStorage] = useState(storageBlocked);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pendingUser, setPendingUser] = useState(signedInUser);
  // Someone gave an under-16 birth year on this device recently: no new sign-ups.
  const [ageLocked, setAgeLocked] = useState(() => ageLockedUntil() > 0);

  const recaptchaRef = useRef(null);
  const ids = { email: useId(), password: useId(), phone: useId(), code: useId(), remember: useId() };

  useEffect(() => { applyPersistence(remember).catch(() => {}); }, [remember]);

  const fail = (err) => setError(isCancellation(err) ? "" : authMessage(err));
  const onPasswordKey = (e) => setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  const signup = mode === "signup";

  const switchMode = (next) => {
    setMode(next);
    setError(""); setNotice(""); setConfirmation(null);
    navigate(authPath(next), { replace: true });
  };

  // Signed in without a profile yet: on to step two.
  const afterSignIn = async (cred) => {
    if (!cred) return; // redirecting to the provider
    const profile = await fetchProfile(cred.user.uid).catch(() => null);
    if (!profile) setPendingUser(cred.user);
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");
    if (!email.trim()) return setError("Enter your email address.");
    const weak = signup ? passwordProblem(password, { email }) : "";
    if (weak) return setError(weak);
    if (!password) return setError("Enter your password.");
    setBusy(true);
    try {
      if (signup) setPendingUser((await signUpEmail(email, password, remember)).user);
      else await afterSignIn(await signInEmail(email, password, remember));
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  // The provider call must start in the tap itself, or phones block its popup.
  const handleProvider = (fn) => {
    const started = fn(remember);
    setError(""); setNotice(""); setBusy(true);
    started.then(afterSignIn).catch(fail).finally(() => setBusy(false));
  };

  const sendSms = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (!/^\+[1-9]\d{6,14}$/.test(phone.replace(/\s/g, ""))) {
        throw new Error("Enter your number in international format, like +61 412 345 678.");
      }
      await applyPersistence(remember);
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      setConfirmation(await signInWithPhoneNumber(auth, phone.replace(/\s/g, ""), recaptchaRef.current));
    } catch (err) {
      fail(err);
      recaptchaRef.current?.clear?.();
      recaptchaRef.current = null;
    } finally { setBusy(false); }
  };

  const verifySms = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try { await afterSignIn(await confirmation.confirm(smsCode.trim())); }
    catch (err) { fail(err); } finally { setBusy(false); }
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

  if (ageLocked && (signup || pendingUser)) {
    return (
      <Shell>
        <UnderSixteen onLogIn={() => {
          // A half-made account (no profile yet) is signed out first.
          if (auth.currentUser) signOut(auth).catch(() => {});
          setPendingUser(null);
          switchMode("login");
        }} />
      </Shell>
    );
  }

  if (pendingUser) {
    return (
      <Shell finishing>
        <FinishProfile user={pendingUser} onCreated={onCreated} onUnderSixteen={() => setAgeLocked(true)} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="anim-fade">
        <Segmented label="Log in or sign up" value={mode} onChange={switchMode} className="mb-6"
          options={[{ id: "login", label: "Log in" }, { id: "signup", label: "Sign up" }]} />

        <h2 className="text-title-1 font-display">{signup ? "Create your account" : "Welcome back"}</h2>
        <p className="mb-6 mt-1 text-callout text-fg-muted">
          {signup ? "Step 1 of 2: choose how you'll sign in." : "Log in to pick up where you left off."}
        </p>

        {!EMAIL_ONLY && (<>
        <div className="space-y-2.5">
          <button type="button" onClick={() => handleProvider(signInGoogle)} disabled={busy}
            className={`${SOCIAL} border border-line-strong bg-white text-zinc-900 hover:bg-zinc-100`}>
            <GoogleMark /> Continue with Google
          </button>
          {/* Apple sign-in is disabled until a Services ID is configured in Firebase. */}
          {APPLE_ENABLED && (
            <button type="button" onClick={() => handleProvider(signInApple)} disabled={busy}
              className={`${SOCIAL} border border-line-strong bg-black text-white hover:bg-zinc-800`}>
              <AppleMark /> Continue with Apple
            </button>
          )}
        </div>

        <div className="my-6 flex items-center gap-3 text-caption text-fg-subtle">
          <div className="h-px flex-1 bg-line" />
          <span>or</span>
          <div className="h-px flex-1 bg-line" />
        </div>
        </>)}

        {method === "email" ? (
          <form onSubmit={handleEmail} className="space-y-4" noValidate>
            <Field id={ids.email} label="Email address">
              <input id={ids.email} className={`${FIELD} ${error ? FIELD_BAD : ""}`} type="email" inputMode="email"
                value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                autoComplete={signup ? "email" : "username"} placeholder="name@example.com" aria-invalid={error ? "true" : undefined} />
            </Field>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
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
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyUp={onPasswordKey} onKeyDown={onPasswordKey}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={signup ? "At least 8 characters" : "Your password"} aria-invalid={error ? "true" : undefined} />
                <button type="button" onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle hover:text-fg">
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
              {signup && (
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption" aria-label="Password needs">
                  {[["8+ characters", password.length >= 8], ["Uppercase", /[A-Z]/.test(password)], ["Number", /[0-9]/.test(password)], ["Symbol", /[^A-Za-z0-9]/.test(password)]].map(([label, ok]) => (
                    <li key={label} className={ok ? "text-success-text" : "text-fg-subtle"}>
                      {ok ? <Check size={12} className="mr-0.5 inline" aria-hidden="true" /> : "· "}{label}<span className="sr-only">{ok ? ", done" : ", needed"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {capsOn && (
                <p role="status" className="mt-1.5 flex items-center gap-1.5 text-caption text-warning-text">
                  <AlertTriangle size={14} aria-hidden="true" /> Caps Lock is on.
                </p>
              )}
            </div>

            <RememberMe id={ids.remember} remember={remember} setRemember={setRemember} noStorage={noStorage} />
            <Alert error={error} notice={notice} />

            <button disabled={busy} className={`${SOCIAL} ${PRIMARY}`}>
              {busy ? "One moment…" : signup ? "Continue" : "Log in"}
            </button>
          </form>
        ) : confirmation ? (
          <form onSubmit={verifySms} className="space-y-4 anim-rise" noValidate>
            <Field id={ids.code} label="Verification code" hint={`Sent by text message to ${phone}.`}>
              <input id={ids.code} className={`${FIELD} text-center text-2xl tracking-[0.4em]`}
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                value={smsCode} onChange={(e) => setSmsCode(e.target.value)} placeholder="······" />
            </Field>
            <Alert error={error} />
            <button disabled={busy} className={`${SOCIAL} ${PRIMARY}`}>{busy ? "Checking…" : "Continue"}</button>
            <button type="button" onClick={() => { setConfirmation(null); setSmsCode(""); }}
              className="min-h-11 w-full text-callout font-medium text-fg-muted hover:text-fg">
              Use a different number
            </button>
          </form>
        ) : (
          <form onSubmit={sendSms} className="space-y-4" noValidate>
            <Field id={ids.phone} label="Phone number" hint="Include your country code. We'll text you a 6-digit code.">
              <input id={ids.phone} className={FIELD} type="tel" autoComplete="tel"
                value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61 412 345 678" />
            </Field>
            <RememberMe id={ids.remember} remember={remember} setRemember={setRemember} noStorage={noStorage} />
            <Alert error={error} />
            <button disabled={busy} className={`${SOCIAL} ${PRIMARY}`}>{busy ? "Sending…" : "Text me a code"}</button>
          </form>
        )}

        {!EMAIL_ONLY && (
          <button type="button" onClick={() => { setMethod(method === "email" ? "phone" : "email"); setError(""); setConfirmation(null); }}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center text-callout font-medium text-fg-muted hover:text-fg">
            {method === "email" ? "Use your phone number instead" : "Use your email instead"}
          </button>
        )}

        {signup && (
          <p className="mt-2 text-center text-caption text-fg-subtle">Next, you&apos;ll choose your name and handle.</p>
        )}

        <PolicyLinks />
      </div>

      {showReset && (
        <ResetModal email={email} setEmail={setEmail} onSubmit={doReset}
          onClose={() => setShowReset(false)} busy={busy} error={error} fieldClass={FIELD} />
      )}
      <div id="recaptcha-container" />
    </Shell>
  );
}

function RememberMe({ id, remember, setRemember, noStorage }) {
  return (
    <>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer select-none items-center gap-3">
        <input id={id} type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
          className="h-5 w-5 rounded-md border-field bg-surface-2 accent-violet-600" />
        <span className="text-callout text-fg-muted">Keep me signed in on this device</span>
      </label>
      {noStorage && (
        <p role="note" className="rounded-control bg-warning-text/10 px-3 py-2 text-caption text-warning-text">
          This browser is blocking storage for Mesh, so you&apos;ll be signed out when you reload or open another tab.
          In Brave, open Shields for this site and allow cookies.
        </p>
      )}
    </>
  );
}

// Policies open in a new tab so a half-finished sign-up isn't lost.
function PolicyLinks() {
  const link = (id, label) => (
    <a href={`/legal/${id}`} target="_blank" rel="noopener" className="inline-flex min-h-8 items-center underline underline-offset-2 hover:text-fg">{label}</a>
  );
  return (
    <p className="mt-6 text-center text-caption text-fg-subtle">
      {link("terms", "Terms")} · {link("privacy", "Privacy")} · {link("cookies", "Cookies")} · {link("guidelines", "Guidelines")}
    </p>
  );
}

/** Lower-case letters, numbers and underscores from a name or email, at least 3 long. */
function handleFrom(text) {
  const base = String(text || "").split("@")[0].normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 20);
  return base.length >= 3 ? base : "";
}

// Shown after an under-16 birth year, and on that device for 30 days after.
function UnderSixteen({ onLogIn }) {
  return (
    <div className="anim-fade space-y-4">
      <h2 className="text-title-1 font-display">You can't make a Mesh account yet</h2>
      <p className="text-callout text-fg-muted">
        Mesh is for people 16 and over. Australian law sets that age for social media, so we can't let anyone younger sign up.
        Nothing you entered has been kept.
      </p>
      <p className="text-callout text-fg-muted">
        This device can't start a new sign-up for {LOCK_DAYS} days. If you entered the wrong year by mistake, email{" "}
        <span className="font-semibold text-fg">{BUSINESS.supportEmail}</span>.
      </p>
      <button type="button" onClick={onLogIn} className={LINK}>Log in to an existing account</button>
    </div>
  );
}

// Step two: how you appear. The handle is suggested from the name and checked as you type.
function FinishProfile({ user, onCreated, onUnderSixteen }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [username, setUsername] = useState(() => handleFrom(user.displayName) || handleFrom(user.email));
  const [handleEdited, setHandleEdited] = useState(false);
  const [handleState, setHandleState] = useState({ for: "", ok: false, message: "" });
  const [birthYear, setBirthYear] = useState("");
  const [consent, setConsent] = useState(false);
  // "This is my real birth year", ticked by the person themselves.
  const [truthful, setTruthful] = useState(false);
  // Born 16 years ago: they say whether they've had this year's birthday (null until they answer).
  const [turned16, setTurned16] = useState(null);
  // Minutes a day for Home and Flicks; 0 is no limit. Nothing is forced.
  const [limit, setLimit] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = { name: useId(), handle: useId(), year: useId(), consent: useId(), limit: useId() };

  const changeName = (v) => {
    setDisplayName(v);
    if (!handleEdited) setUsername(handleFrom(v) || username);
  };

  // Availability, checked shortly after typing stops.
  const wanted = username.trim().toLowerCase();
  useEffect(() => {
    if (!wanted) return undefined;
    const v = validateUsername(wanted);
    const named = v.error ? null : checkName(v.username);
    if (v.error || named?.error) {
      const t = setTimeout(() => setHandleState({ for: wanted, ok: false, message: v.error || named.error }), 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    const t = setTimeout(() => {
      usernameTaken(v.username)
        .then((taken) => { if (alive) setHandleState({ for: wanted, ok: !taken, message: taken ? "That handle is taken." : "Available" }); })
        .catch(() => { if (alive) setHandleState({ for: wanted, ok: true, message: "" }); });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [wanted]);
  const checked = handleState.for === wanted ? handleState : null;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!displayName.trim()) return setError("Add your name. It's how you'll appear on Mesh.");
    const v = validateUsername(wanted);
    if (v.error) return setError(v.error);
    const named = checkName(v.username);
    if (named.error) return setError(named.error);
    if (!/^\d{4}$/.test(birthYear)) return setError("Enter your birth year, like 2004.");
    if (!truthful) return setError("Confirm that this is your real birth year.");
    const borderline = validBirthYear(birthYear).borderline;
    if (borderline && turned16 === null) return setError("Say whether you've had your birthday this year.");
    // Under 16: no account, nothing kept, and no second try from this device.
    if ((underSixteen(birthYear) && !borderline) || (borderline && turned16 === false)) {
      lockAge();
      setBusy(true);
      await user.delete().catch(() => signOut(auth).catch(() => {}));
      onUnderSixteen();
      return undefined;
    }
    const year = validBirthYear(birthYear);
    if (year.error) return setError(year.error);
    if (!consent) return setError("Accept the Terms and Privacy Policy to create your account.");
    setBusy(true);
    try {
      if (await usernameTaken(v.username)) throw new Error("That handle is taken. Try another.");
      await claimUsernameAndCreateProfile(user, v.username, year.year, displayName.trim());
      if (limit) {
        const layer = emptyLayer();
        layer.caps = { ...layer.caps, feed: limit, flicks: limit };
        // Best effort: it can be set in Brick mode if this fails.
        await saveOwnLimits(null, null, layer).catch(() => {});
      }
      onCreated();
    } catch (err) {
      setError(err?.code === "permission-denied"
        ? "Your account couldn't be set up. Refresh the page and try again."
        : err?.message || "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 anim-rise" noValidate>
      <div>
        <h2 className="text-title-1 font-display">Set up your profile</h2>
        <p className="mt-1 text-callout text-fg-muted">Step 2 of 2: how you&apos;ll appear on Mesh. You can change these later.</p>
      </div>
      <Field id={ids.name} label="Name" hint="Your name or a nickname. Names don't have to be unique.">
        <input id={ids.name} className={FIELD} value={displayName} autoComplete="name" autoFocus
          onChange={(e) => changeName(e.target.value)} maxLength={50} placeholder="Alex Nguyen" />
      </Field>
      <div>
        <label htmlFor={ids.handle} className="mb-1.5 block text-callout font-medium text-fg">Handle</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-input text-fg-subtle" aria-hidden="true">@</span>
          <input id={ids.handle} className={`${FIELD} pl-9 ${checked && !checked.ok ? FIELD_BAD : ""}`} value={username}
            autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} placeholder="yourname"
            aria-describedby={`${ids.handle}-status`}
            onChange={(e) => { setUsername(e.target.value.replace(/\s/g, "").toLowerCase()); setHandleEdited(true); }} />
        </div>
        <p id={`${ids.handle}-status`} aria-live="polite"
          className={`mt-1.5 flex items-center gap-1.5 text-caption ${checked ? (checked.ok ? "text-success-text" : "text-danger-text") : "text-fg-subtle"}`}>
          {!wanted ? "Letters, numbers and underscores. This is your unique @name."
            : !checked ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Checking…</>
            : checked.ok ? <><Check size={13} aria-hidden="true" /> {checked.message || "Looks good"}</>
            : checked.message}
        </p>
      </div>
      <div className="space-y-2.5 rounded-card border border-warning-text/30 bg-warning-text/5 p-3.5">
        <p className="flex items-start gap-2 text-callout font-semibold text-fg">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning-text" aria-hidden="true" />
          Use your real birth year
        </p>
        <p className="text-caption text-fg-muted">
          Australian law sets a minimum age for social media, and Mesh has to follow it. Your birth year can't be changed later,
          and accounts with a false age are closed. It's never shown on your profile.
        </p>
        <Field id={ids.year} label="Your birth year">
          <input id={ids.year} className={FIELD} inputMode="numeric" maxLength={4} autoComplete="bday-year"
            value={birthYear} onChange={(e) => { setBirthYear(e.target.value.replace(/\D/g, "")); setTurned16(null); }} placeholder="YYYY" />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 text-callout text-fg">
          <input type="checkbox" checked={truthful} onChange={(e) => setTruthful(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-field bg-surface-2 accent-violet-600" />
          This is my real birth year. I understand my account will be closed if it isn&apos;t.
        </label>
      </div>
      {validBirthYear(birthYear).year && new Date().getFullYear() - Number(birthYear) < 18 && (
        <p className="text-caption text-fg-subtle">
          Under 18: your account starts private, and only people you follow can message you. You can change both in Settings.
        </p>
      )}
      {validBirthYear(birthYear).borderline && (
        <fieldset>
          <legend className="mb-1.5 text-callout font-medium text-fg">Have you had your birthday yet this year?</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {[[true, "Yes"], [false, "Not yet"]].map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={turned16 === v} onClick={() => setTurned16(v)}
                className={`press min-h-11 rounded-control border px-3 text-callout font-semibold ${turned16 === v ? "border-accent bg-accent-soft text-fg" : "border-field bg-surface-2 text-fg-muted hover:text-fg"}`}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend id={ids.limit} className="mb-1.5 block text-callout font-medium text-fg">How long do you want Mesh each day?</legend>
        <div role="radiogroup" aria-labelledby={ids.limit} className="grid grid-cols-4 gap-2">
          {[[30, "30 min"], [45, "45 min"], [60, "1 hr"], [0, "No limit"]].map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={limit === m} onClick={() => setLimit(m)}
              className={`press min-h-11 rounded-control border px-1 text-callout font-semibold ${limit === m ? "border-accent bg-accent-soft text-fg" : "border-field bg-surface-2 text-fg-muted hover:text-fg"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-caption text-fg-subtle">
          {limit ? "Home and Flicks lock at that point until midnight. Raising it later takes 24 hours. Messages never lock."
            : "Optional. Home and Flicks lock once you hit it, until midnight. You can set it any time in Brick mode."}
        </p>
      </fieldset>
      <div className="flex items-start gap-3 py-1">
        <input id={ids.consent} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-field bg-surface-2 accent-violet-600" />
        <label htmlFor={ids.consent} className="cursor-pointer select-none text-callout text-fg-muted">
          I accept the <a href="/legal/terms" target="_blank" rel="noopener" className={LINK}>Terms of Service</a> and
          the <a href="/legal/privacy" target="_blank" rel="noopener" className={LINK}>Privacy Policy</a>.
        </label>
      </div>
      <Alert error={error} />
      <button disabled={busy} className={`${SOCIAL} ${PRIMARY}`}>{busy ? "Setting up…" : "Join Mesh"}</button>
      <button type="button" onClick={() => signOut(auth)}
        className="min-h-11 w-full text-callout font-medium text-fg-muted hover:text-fg">
        Use a different account
      </button>
    </form>
  );
}

function Shell({ finishing = false, children }) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden border-r border-line bg-surface lg:flex" style={LATTICE}>
        <div className="relative max-w-md px-12">
          <LogoMark size={56} />
          <p className="mt-8 font-display text-[3rem] font-extrabold leading-[1.05] tracking-tight">
            Let&rsquo;s mesh<br />together again.
          </p>
          <p className="mt-6 text-body text-fg-muted">
            Posts, short and long video, communities and news that has to cite its sources, in one place.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6 text-callout">
            <div><dt className="text-fg-subtle">Ads on what you do</dt><dd className="mt-0.5 font-semibold">Never</dd></div>
            <div><dt className="text-fg-subtle">Data sold</dt><dd className="mt-0.5 font-semibold">Never</dd></div>
            <div><dt className="text-fg-subtle">Extra cookies</dt><dd className="mt-0.5 font-semibold">Your choice</dd></div>
          </dl>
        </div>
      </div>
      <main className="relative flex flex-1 items-center justify-center overflow-y-auto p-6">
        {!finishing && (
          <button type="button" onClick={() => goBack("/")}
            className="press absolute left-3 top-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 pt-safe text-callout font-medium text-fg-muted hover:text-fg">
            <ArrowLeft size={18} aria-hidden="true" /> Keep browsing
          </button>
        )}
        <div className="w-full max-w-sm py-8">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <LogoMark size={52} />
            <h1 className="mt-3 font-display text-display font-extrabold tracking-tight">Mesh</h1>
            <p className="mt-1 text-callout text-fg-muted">Let&rsquo;s mesh together again</p>
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
