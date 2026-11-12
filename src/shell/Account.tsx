import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { useAccount, useAccountInfo, type AccountInfo } from "../core";
import { Avatar } from "./Avatar";

/**
 * The Account page (#/account), for the signed-in person: name, email, password, sign out,
 * delete. Signing in happens on the sign-in screen (AuthScreen.tsx), which uses `AuthCard`.
 */
export function Account() {
  const info = useAccountInfo();
  if (!info.account) return null; // signing out: the app is about to reload
  return (
    <div className="page account-page">
      <header className="page-header">
        <h1>Account</h1>
        <p className="muted">Your data is saved in your account, so it's the same on every device you sign in on.</p>
      </header>
      <SignedIn info={info} />
    </div>
  );
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const MIN_PASSWORD = 8;

/* ---------- Signing in (used by the sign-in screen) ---------- */

type AuthMode = "in" | "up" | "forgot";

export function AuthCard() {
  const cloud = useAccount();
  const [mode, setMode] = useState<AuthMode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const switchTo = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setMessage(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (mode === "up" && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    setBusy(true);
    try {
      if (mode === "in") {
        await cloud.signIn(email, password);
        reloadWithNotice("Welcome back.");
      }
      else if (mode === "forgot") {
        await cloud.requestPasswordReset(email);
        setMessage(`If there's an account for ${email.trim()}, a link to choose a new password is on its way. Open it on this device.`);
      } else {
        const result = await cloud.signUp(email, password, name);
        if (result === "confirm-email") {
          setMessage(`We sent a confirmation link to ${email.trim()}. Open it on this device and you'll be signed in.`);
          setMode("in");
          setPassword("");
        } else reloadWithNotice("Your account is ready.");
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = {
    in: busy ? "Signing in…" : "Sign in",
    up: busy ? "Creating account…" : "Create account",
    forgot: busy ? "Sending…" : message ? "Send again" : "Send reset link",
  }[mode];

  return (
    <div className="card account-auth">
      {mode === "forgot" ? (
        <div className="account-auth-head">
          <h2 className="card-title">Reset your password</h2>
          <p className="muted">Enter your account's email and we'll send you a link to choose a new password.</p>
        </div>
      ) : (
        <div className="segmented account-tabs" role="group" aria-label="Account">
          <button type="button" aria-pressed={mode === "in"} onClick={() => switchTo("in")}>
            Sign in
          </button>
          <button type="button" aria-pressed={mode === "up"} onClick={() => switchTo("up")}>
            Create account
          </button>
        </div>
      )}
      <form className="account-form" onSubmit={submit}>
        {mode === "up" && (
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="What should Cronos call you?" maxLength={60} />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            autoComplete="email"
            required
          />
        </label>
        {mode !== "forgot" && (
          <PasswordField
            label="Password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            hint={mode === "up" ? `At least ${MIN_PASSWORD} characters.` : undefined}
            aside={
              mode === "in" ? (
                <button type="button" className="link-btn" onClick={() => switchTo("forgot")}>
                  Forgot password?
                </button>
              ) : undefined
            }
          />
        )}
        {error && (
          <p className="hint hint-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="cloud-note" role="status">
            {message}
          </p>
        )}
        <button className="btn-primary account-submit" type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {mode === "forgot" && (
          <button type="button" className="link-btn account-back" onClick={() => switchTo("in")}>
            Back to sign in
          </button>
        )}
      </form>
      {mode === "up" && <p className="muted account-fine">Your data is saved in your account, so it's the same on every device you sign in on.</p>}
    </div>
  );
}

/** A password input with a show/hide button. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  aside,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
  aside?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <span className="field-label-row">
        <label htmlFor={id}>{label}</label>
        {aside}
      </span>
      <span className="password-input">
        <input id={id} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
        <button type="button" className="password-toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? "Hide password" : "Show password"}>
          {shown ? "Hide" : "Show"}
        </button>
      </span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ---------- Signed in ---------- */

function SignedIn({ info }: { info: AccountInfo }) {
  const account = info.account!;
  const cloud = useAccount();
  useNow(30_000); // keeps "2 minutes ago" fresh
  const since = account.createdAt ? new Date(account.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;

  // Coming back to the page (e.g. after confirming a new email in another tab): refresh the account.
  useEffect(() => {
    if (account.pendingEmail) void cloud.reloadAccount();
  }, []);

  return (
    <div className="account-stack">
      {info.needsNewPassword && <NewPasswordCard />}

      <section className="card account-hero" aria-label="Your account">
        <Avatar account={account} size={64} />
        <div className="account-who">
          <p className="account-name">{account.name || "Add your name"}</p>
          <p className="muted account-email">{account.email}</p>
          {since && <p className="muted account-since">Member since {since}</p>}
        </div>
      </section>

      <Section title="Profile" id="account-profile">
        <NameForm current={account.name ?? ""} />
      </Section>

      <Section title="Sign-in" id="account-signin">
        <EmailRow email={account.email} pending={account.pendingEmail} />
        <PasswordRow />
      </Section>

      <Section title="Sign out" id="account-signout">
        <SignOut />
      </Section>

      <Section title="Delete account" id="account-delete" danger>
        <DeleteAccount email={account.email} />
      </Section>
    </div>
  );
}

function Section({ title, id, danger, children }: { title: string; id: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={`card account-section${danger ? " is-danger" : ""}`} aria-labelledby={id}>
      <h2 className="card-title" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A small form's shared state: busy, error, a success note. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const done = await work();
      if (done) setNote(done);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const feedback = (
    <>
      {error && (
        <p className="hint hint-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="account-saved" role="status">
          {note}
        </p>
      )}
    </>
  );
  return { busy, run, feedback, setError, clear: () => (setError(null), setNote(null)) };
}

function NameForm({ current }: { current: string }) {
  const cloud = useAccount();
  const [name, setName] = useState(current);
  const a = useAction();
  useEffect(() => setName(current), [current]);
  const changed = name.trim() !== current;
  return (
    <form
      className="account-inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) void a.run(async () => (await cloud.updateName(name), "Saved."));
      }}
    >
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            a.clear();
          }}
          autoComplete="name"
          placeholder="What should Cronos call you?"
          maxLength={60}
        />
      </label>
      <button className="btn-ghost" type="submit" disabled={a.busy || !changed}>
        {a.busy ? "Saving…" : "Save"}
      </button>
      <span className="account-inline-note">{a.feedback}</span>
    </form>
  );
}

function EmailRow({ email, pending }: { email: string; pending?: string }) {
  const cloud = useAccount();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const a = useAction();
  return (
    <div className="account-row">
      <div className="account-row-main">
        <span className="account-row-label">Email</span>
        <span className="account-row-value">{email}</span>
        {pending && !editing && (
          <span className="account-row-note">
            Waiting for you to confirm <strong>{pending}</strong>: open the link we emailed.
          </span>
        )}
      </div>
      {!editing && (
        <button className="btn-ghost" onClick={() => (setEditing(true), setValue(""), a.clear())}>
          Change
        </button>
      )}
      {editing && (
        <form
          className="account-row-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (value.trim().toLowerCase() === email.toLowerCase()) return a.setError("That's already your email.");
            const ok = await a.run(() => cloud.changeEmail(value));
            if (ok) setEditing(false);
          }}
        >
          <label className="field">
            <span>New email</span>
            <input type="email" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="email" required autoFocus />
          </label>
          <p className="muted account-help">We'll email a confirmation link. Your email changes once you open it.</p>
          {a.feedback}
          <div className="form-actions">
            <span className="spacer" />
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)} disabled={a.busy}>
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={a.busy}>
              {a.busy ? "Sending…" : "Send confirmation"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function PasswordRow() {
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="account-row">
      <div className="account-row-main">
        <span className="account-row-label">Password</span>
        <span className="account-row-value" aria-label="Hidden">
          ••••••••••
        </span>
        {done && !editing && (
          <span className="account-saved" role="status">
            Password changed.
          </span>
        )}
      </div>
      {!editing && (
        <button className="btn-ghost" onClick={() => (setEditing(true), setDone(false))}>
          Change
        </button>
      )}
      {editing && (
        <PasswordForm
          onDone={() => {
            setEditing(false);
            setDone(true);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function PasswordForm({ onDone, onCancel, submitLabel = "Change password" }: { onDone: () => void; onCancel?: () => void; submitLabel?: string }) {
  const cloud = useAccount();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const a = useAction();
  return (
    <form
      className="account-row-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < MIN_PASSWORD) return a.setError(`Use at least ${MIN_PASSWORD} characters.`);
        if (password !== again) return a.setError("The two passwords don't match.");
        if (await a.run(() => cloud.changePassword(password))) onDone();
      }}
    >
      <PasswordField label="New password" value={password} onChange={(v) => (setPassword(v), a.clear())} autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters.`} />
      <PasswordField label="Type it again" value={again} onChange={(v) => (setAgain(v), a.clear())} autoComplete="new-password" />
      {a.feedback}
      <div className="form-actions">
        <span className="spacer" />
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={a.busy}>
            Cancel
          </button>
        )}
        <button className="btn-primary" type="submit" disabled={a.busy}>
          {a.busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** After a "reset password" link: you're signed in, now pick the new password. */
function NewPasswordCard() {
  const cloud = useAccount();
  return (
    <section className="card account-section is-highlight" aria-labelledby="account-newpass">
      <h2 className="card-title" id="account-newpass">
        Choose a new password
      </h2>
      <p className="muted">You opened a password reset link, so you're signed in. Set a new password to use on your other devices.</p>
      <PasswordForm onDone={() => cloud.dismissNewPassword()} onCancel={() => cloud.dismissNewPassword()} submitLabel="Save new password" />
    </section>
  );
}

function SignOut() {
  const cloud = useAccount();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await cloud.signOut().catch(() => {});
    reloadWithNotice("Signed out.");
  };
  return (
    <div className="account-row">
      <p className="muted account-row-main">Sign out of Cronos on this device. Your data stays in your account.</p>
      <button className="btn-ghost" onClick={signOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function DeleteAccount({ email }: { email: string }) {
  const cloud = useAccount();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const a = useAction();
  const ready = typed.trim().toLowerCase() === email.toLowerCase();

  if (!confirm)
    return (
      <div className="account-row">
        <p className="muted account-row-main">
          Permanently delete your account and all of its data.
        </p>
        <button className="btn-ghost account-danger-btn" onClick={() => setConfirm(true)}>
          Delete account
        </button>
      </div>
    );

  return (
    <form
      className="restore-confirm"
      role="alertdialog"
      aria-labelledby="delete-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready)
          void a.run(async () => {
            await cloud.deleteAccount();
            reloadWithNotice("Your account and all its data were deleted.");
          });
      }}
    >
      <p id="delete-title">
        <strong>Delete your account for good?</strong>
      </p>
      <p className="muted">
        This removes your sign-in and all of your data, on every device. This can't be undone.
      </p>
      <label className="field">
        <span>Type your email to confirm</span>
        <input value={typed} onChange={(e) => (setTyped(e.target.value), a.clear())} placeholder={email} autoComplete="off" spellCheck={false} />
      </label>
      {a.feedback}
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn-ghost" onClick={() => setConfirm(false)} disabled={a.busy}>
          Cancel
        </button>
        <button className="btn-danger-solid" type="submit" disabled={!ready || a.busy}>
          {a.busy ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Helpers ---------- */

const NOTICE_KEY = "cronos.notice";

/** Leave a message to show after the next reload. */
export function setNotice(text: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, text);
  } catch {
    /* the reload still happens, just without the message */
  }
}

/** Reload (into the signed-in account's data, or this device's) and say why once it's back. */
export function reloadWithNotice(text: string) {
  setNotice(text);
  window.location.reload();
}

/** The message left by `reloadWithNotice`, if any (read once). */
export function takeNotice(): string | null {
  try {
    const text = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return text;
  } catch {
    return null;
  }
}

export const pendingText = (n: number) => (n > 0 ? `${n.toLocaleString()} change${n === 1 ? "" : "s"} waiting to upload` : "");

export function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function useNow(everyMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
}

