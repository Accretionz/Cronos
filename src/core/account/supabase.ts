import type { Item } from "../types";
import { AccountError, type UserAccount } from "./types";

/**
 * Talks to a Supabase project over its plain HTTP APIs: Auth (accounts) and the REST API for
 * the `items` table, where every account's data lives (see supabase/migrations). Uses only
 * `fetch`, so it runs the same in a browser, an installed web app, or a mobile shell.
 */

export interface SupabaseConfig {
  /** e.g. https://abcd1234.supabase.co */
  url: string;
  /** The project's public "anon" key. Safe to ship: row-level security protects the data. */
  anonKey: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires (ms since epoch). */
  expiresAt: number;
  user: UserAccount;
}

/** Small key-value storage for the sign-in session. Swap for secure storage on mobile. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserKeyValue: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: stays signed in for this visit only */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const SESSION_KEY = "cronos.cloud.session";
const REFRESH_MARGIN_MS = 60_000;
/** Rows per request when loading or saving many items. */
const PAGE = 1000;
const SAVE_BATCH = 500;

/** Check a config before saving it. Returns a message for the user, or null if it looks right. */
export function checkConfig(config: SupabaseConfig): string | null {
  let url: URL;
  try {
    url = new URL(config.url.trim());
  } catch {
    return "Enter the project URL, like https://abcd1234.supabase.co";
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return "The project URL must start with https://";
  if (config.anonKey.trim().length < 20) return "Paste the project's anon (public) key.";
  return null;
}

export function cleanConfig(config: SupabaseConfig): SupabaseConfig {
  return { url: config.url.trim().replace(/\/+$/, ""), anonKey: config.anonKey.trim() };
}

export class SupabaseClient {
  private session: Session | null;
  private refreshing: Promise<void> | null = null;
  private config: SupabaseConfig;

  constructor(
    config: SupabaseConfig,
    private kv: KeyValueStore = browserKeyValue,
    private fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {
    this.config = cleanConfig(config);
    this.session = this.readSession();
  }

  /** Called when the session can't be renewed (signed out elsewhere, or it expired for good). */
  onSessionEnded: (() => void) | null = null;

  // ---- account --------------------------------------------------------------------------

  account(): UserAccount | null {
    return this.session?.user ?? null;
  }

  /** Re-read the saved session (another tab may have signed in, out, or refreshed it). */
  reloadSession(): void {
    this.session = this.readSession();
  }

  private readSession(): Session | null {
    try {
      const raw = this.kv.get(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      return s && s.accessToken && s.refreshToken && s.user?.id ? s : null;
    } catch {
      return null;
    }
  }

  private saveSession(s: Session | null) {
    this.session = s;
    if (s) this.kv.set(SESSION_KEY, JSON.stringify(s));
    else this.kv.remove(SESSION_KEY);
  }

  async signIn(email: string, password: string): Promise<UserAccount> {
    const body = await this.auth("token?grant_type=password", { email: email.trim(), password });
    const s = sessionFrom(body);
    if (!s) throw new AccountError("Sign-in didn't return a session. Try again.", "server");
    this.saveSession(s);
    return s.user;
  }

  /**
   * Create an account. Returns null when the project asks people to confirm their email first;
   * the link in that email comes back to `redirectTo` and signs them in (see `signInFromLink`).
   */
  async signUp(email: string, password: string, name?: string, redirectTo?: string): Promise<UserAccount | null> {
    const data = name?.trim() ? { name: name.trim() } : {};
    const body = await this.auth(`signup${redirectQuery(redirectTo)}`, { email: email.trim(), password, data });
    const s = sessionFrom(body);
    if (s) this.saveSession(s);
    return s?.user ?? null;
  }

  async signOut(): Promise<void> {
    const token = this.session?.accessToken;
    this.saveSession(null);
    if (!token) return;
    try {
      await this.fetchFn(`${this.config.url}/auth/v1/logout`, { method: "POST", headers: { apikey: this.config.anonKey, Authorization: `Bearer ${token}` } });
    } catch {
      /* signed out here either way */
    }
  }

  /** Email a link for choosing a new password. It comes back to `redirectTo`, signed in. */
  async requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
    await this.auth(`recover${redirectQuery(redirectTo)}`, { email: email.trim() });
  }

  /**
   * Finish signing in from an email link (confirm sign-up, reset password, confirm a new
   * email). Supabase sends people back with the session in the address's #fragment.
   */
  async signInFromLink(link: AuthLink): Promise<UserAccount> {
    if (link.error) throw new AccountError(linkErrorMessage(link), "auth");
    if (!link.accessToken || !link.refreshToken) throw new AccountError("That link is incomplete. Request a new one.", "auth");
    const res = await this.send(`${this.config.url}/auth/v1/user`, {
      headers: { apikey: this.config.anonKey, Authorization: `Bearer ${link.accessToken}` },
    });
    const user = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new AccountError(res.status === 401 || res.status === 403 ? "That link has expired. Request a new one." : authMessage(res.status, user), "auth");
    const s = sessionFrom({ access_token: link.accessToken, refresh_token: link.refreshToken, expires_at: link.expiresAt, expires_in: link.expiresIn, user });
    if (!s) throw new AccountError("That link didn't sign you in. Request a new one.", "auth");
    this.saveSession(s);
    return s.user;
  }

  /**
   * Change the signed-in account: its name, email (confirmed by a link sent to the new
   * address, coming back to `redirectTo`) or password. Returns the updated account.
   */
  async updateAccount(changes: { name?: string; email?: string; password?: string }, redirectTo?: string): Promise<UserAccount> {
    const payload: Record<string, unknown> = {};
    if (changes.name !== undefined) payload.data = { name: changes.name.trim() };
    if (changes.email !== undefined) payload.email = changes.email.trim();
    if (changes.password !== undefined) payload.password = changes.password;
    const res = await this.authed(`user${redirectQuery(redirectTo)}`, { method: "PUT", body: JSON.stringify(payload) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const user = userFrom(body);
    if (!user || !this.session) throw new AccountError("Couldn't update your account. Try again.", "server");
    this.saveSession({ ...this.session, user });
    return user;
  }

  /** Re-read the account from the server (e.g. after confirming a new email elsewhere). */
  async reloadAccount(): Promise<UserAccount | null> {
    if (!this.session) return null;
    const res = await this.authed("user", {});
    const user = userFrom((await res.json().catch(() => ({}))) as Record<string, unknown>);
    if (user && this.session) this.saveSession({ ...this.session, user });
    return this.account();
  }

  /** Delete the account and all its data (needs the account migration). */
  async deleteAccount(): Promise<void> {
    await this.rest("rpc/delete_my_account", { method: "POST", body: "{}" }).catch((err) => {
      if (err instanceof AccountError && err.kind === "config") {
        const said = err.message.match(/\(Supabase said: (.*)\)$/)?.[1];
        throw new AccountError(
          `Deleting accounts isn't set up yet: run supabase/migrations/20261111000000_account.sql in this project's SQL Editor.${said ? ` (Supabase said: ${said})` : ""}`,
          "config",
        );
      }
      throw err;
    });
    this.saveSession(null);
  }

  /** An Auth API call for the signed-in user. Renews the session once if it expired. */
  private async authed(path: string, init: RequestInit, retried = false): Promise<Response> {
    const token = await this.token();
    const res = await this.send(`${this.config.url}/auth/v1/${path}`, {
      ...init,
      headers: { apikey: this.config.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (res.status === 401 && !retried) {
      await this.refresh(token);
      return this.authed(path, init, true);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new AccountError(authMessage(res.status, body), res.status >= 500 ? "server" : "auth");
    }
    return res;
  }

  private async auth(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.send(`${this.config.url}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: this.config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new AccountError(authMessage(res.status, body), res.status >= 500 ? "server" : "auth");
    return body;
  }

  /** A valid access token, refreshed first if it's about to expire. */
  private async token(): Promise<string> {
    if (!this.session) throw new AccountError("You're signed out. Sign in again.", "auth");
    if (this.session.expiresAt - Date.now() < REFRESH_MARGIN_MS) await this.refresh();
    return this.session!.accessToken;
  }

  /** Renew the session. `rejected` = a token the server just turned down (so don't reuse it). */
  private refresh(rejected?: string): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = withAuthLock(async () => {
        // Another tab may have refreshed already (refresh tokens work once).
        const saved = this.readSession();
        const fresh = saved && saved.expiresAt - Date.now() >= REFRESH_MARGIN_MS && saved.accessToken !== rejected;
        if (saved && fresh && saved.user.id === this.session?.user.id) {
          this.session = saved;
          return;
        }
        const current = saved ?? this.session;
        if (!current) throw new AccountError("You're signed out. Sign in again.", "auth");
        let body: Record<string, unknown>;
        try {
          body = await this.auth("token?grant_type=refresh_token", { refresh_token: current.refreshToken });
        } catch (err) {
          if (err instanceof AccountError && err.kind === "auth") {
            this.saveSession(null);
            this.onSessionEnded?.();
            throw new AccountError("Your session ended. Sign in again.", "auth");
          }
          throw err;
        }
        const next = sessionFrom(body);
        if (!next) throw new AccountError("Couldn't renew your session.", "server");
        this.saveSession(next);
      }).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  // ---- data -----------------------------------------------------------------------------

  /** A REST call for the signed-in user. Renews the session once if the server says it expired. */
  private async rest(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const token = await this.token();
    const res = await this.send(`${this.config.url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: this.config.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 401 && !retried) {
      await this.refresh(token);
      return this.rest(path, init, true);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const detail = typeof body.message === "string" ? body.message : `HTTP ${res.status}`;
      if (res.status === 404 || body.code === "42P01" || body.code === "PGRST205")
        throw new AccountError(`The database isn't set up yet: run the scripts in supabase/migrations. (Supabase said: ${detail}${body.code ? ` [${body.code}]` : ""})`, "config");
      throw new AccountError(`The server said: ${detail}`, res.status === 401 || res.status === 403 ? "auth" : "server");
    }
    return res;
  }

  /** Every item in the signed-in account. */
  async loadItems(): Promise<Item[]> {
    const out: Item[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await this.rest(`items?select=item&deleted=is.false&order=id.asc&limit=${PAGE}&offset=${offset}`);
      const rows = (await res.json()) as { item: Item | null }[];
      for (const r of rows) if (r.item) out.push(r.item);
      if (rows.length < PAGE) return out;
    }
  }

  /** Save items (new or changed) to the signed-in account. */
  async saveItems(items: Item[], changedAt = new Date().toISOString()): Promise<void> {
    const user = this.account();
    if (!user) throw new AccountError("You're signed out. Sign in again.", "auth");
    for (let i = 0; i < items.length; i += SAVE_BATCH) {
      const rows = items.slice(i, i + SAVE_BATCH).map((item) => ({ user_id: user.id, id: item.id, type: item.type, item, deleted: false, changed_at: changedAt }));
      await this.rest("items?on_conflict=user_id,id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
    }
  }

  /** Delete items from the signed-in account. */
  async deleteItems(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += SAVE_BATCH) {
      const list = encodeURIComponent(inList(ids.slice(i, i + SAVE_BATCH)));
      await this.rest(`items?id=${list}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(deletedRow()) });
    }
  }

  /** Replace everything in the account with these items (restoring a backup). */
  async replaceItems(items: Item[]): Promise<void> {
    const cleared = deletedRow();
    await this.rest("items?deleted=is.false", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(cleared) });
    // A moment later than the clear, so the restored items count as newer.
    await this.saveItems(items, new Date(Date.parse(cleared.changed_at) + 1).toISOString());
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch {
      throw new AccountError("No connection. Check your internet and try again.", "offline");
    }
  }
}

function sessionFrom(body: Record<string, unknown>): Session | null {
  const access = body.access_token;
  const refresh = body.refresh_token;
  const user = userFrom((body.user ?? {}) as Record<string, unknown>);
  if (typeof access !== "string" || typeof refresh !== "string" || !user) return null;
  const expiresAt =
    typeof body.expires_at === "number" ? body.expires_at * 1000 : Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1000;
  return { accessToken: access, refreshToken: refresh, expiresAt, user };
}

/** The account as Supabase Auth describes a user. */
function userFrom(u: Record<string, unknown>): UserAccount | null {
  if (typeof u.id !== "string" || !u.id) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const account: UserAccount = { id: u.id, email: typeof u.email === "string" ? u.email : "" };
  if (typeof meta.name === "string" && meta.name.trim()) account.name = meta.name.trim();
  if (typeof u.new_email === "string" && u.new_email) account.pendingEmail = u.new_email;
  if (typeof u.created_at === "string") account.createdAt = u.created_at;
  return account;
}

const redirectQuery = (to?: string) => (to ? `?redirect_to=${encodeURIComponent(to)}` : "");

/** A row marked deleted (rows are never hard-deleted from the app). */
const deletedRow = () => ({ deleted: true, item: null, changed_at: new Date().toISOString() });

/** PostgREST `in.(...)` list with each id quoted (ids can contain commas and colons). */
const inList = (ids: string[]) => `in.(${ids.map((id) => `"${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;

/** What an email link brought back in the address's #fragment. */
export interface AuthLink {
  /** "signup", "recovery", "email_change", "magiclink", "invite"… */
  type: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  expiresIn?: number;
  error?: string;
  errorCode?: string;
  errorDescription?: string;
  /** An information-only reply, e.g. "Confirmation link accepted. Please proceed to confirm link sent to the other email". */
  message?: string;
}

/**
 * Read an email link's result from a URL fragment ("#access_token=…&type=recovery" or
 * "#error=…"). Returns null for an ordinary app address like "#/settings".
 */
export function parseAuthLink(hash: string): AuthLink | null {
  const raw = hash.replace(/^#/, "");
  if (!/(^|&)(access_token|error|message)=/.test(raw)) return null;
  const p = new URLSearchParams(raw);
  const num = (k: string) => (p.get(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);
  return {
    type: p.get("type") ?? (p.get("error") ? "error" : "signin"),
    accessToken: p.get("access_token") ?? undefined,
    refreshToken: p.get("refresh_token") ?? undefined,
    expiresAt: num("expires_at"),
    expiresIn: num("expires_in"),
    error: p.get("error") ?? undefined,
    errorCode: p.get("error_code") ?? undefined,
    errorDescription: p.get("error_description") ?? undefined,
    message: p.get("message") ?? undefined,
  };
}

function linkErrorMessage(link: AuthLink): string {
  if (link.errorCode === "otp_expired" || /expired/i.test(link.errorDescription ?? "")) return "That link has expired or was already used. Request a new one.";
  return link.errorDescription ? `That link didn't work: ${link.errorDescription}` : "That link didn't work. Request a new one.";
}

/** Turn Supabase Auth's error replies into something a person can act on. */
function authMessage(status: number, body: Record<string, unknown>): string {
  const code = String(body.error_code ?? body.error ?? "");
  const text = String(body.msg ?? body.error_description ?? body.message ?? "");
  if (code === "invalid_credentials" || /invalid login credentials/i.test(text)) return "That email and password don't match.";
  if (code === "email_not_confirmed" || /not confirmed/i.test(text)) return "Confirm your email first (check your inbox), then sign in.";
  if (code === "user_already_exists" || /already registered/i.test(text)) return "There's already an account with that email. Sign in instead.";
  if (code === "email_exists" || /already been registered/i.test(text)) return "Another account already uses that email.";
  if (code === "same_password" || /different from the old/i.test(text)) return "Choose a password different from your current one.";
  if (code === "reauthentication_needed" || /reauthenticat/i.test(text)) return "For security, sign out and sign in again, then change your password.";
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(text)) return "Too many emails sent. Wait a little and try again.";
  if (code === "email_address_invalid" || /invalid format|valid email/i.test(text)) return "Enter a valid email address.";
  if (code === "weak_password" || /password/i.test(text)) return text || "Choose a longer password.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status === 401 && /api key|apikey/i.test(text)) return "The project key isn't right. Check the anon key in Settings.";
  return text || `Couldn't reach your account (HTTP ${status}).`;
}

function withAuthLock(work: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return work();
  // request() resolves with whatever the callback returns; we only need to know it's done.
  return locks.request("cronos-cloud-auth", () => work()).then(() => undefined);
}
