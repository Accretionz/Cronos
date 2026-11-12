import { browserKeyValue, checkConfig, cleanConfig, SESSION_KEY, SupabaseClient, type AuthLink, type KeyValueStore, type SupabaseConfig } from "./supabase";
import { AccountError, type UserAccount } from "./types";

/**
 * Accounts, as the rest of the app sees them (`useAccount()`): who's signed in, and
 * everything you can do with an account. Signing in or out changes whose data the app shows,
 * so the app reloads afterwards (see main.tsx).
 *
 * The Supabase project is fixed when the app is built (.env.local); there's no way to point
 * the app at another database from inside it.
 */
/** Signed in from a "reset password" link: ask for a new password (survives the reload). */
const NEW_PASSWORD_KEY = "cronos.cloud.newPassword";

export interface AccountInfo {
  /** Who's signed in, or null. */
  account: UserAccount | null;
  /** Whether the app was built with its Supabase project (.env.local). */
  configured: boolean;
  /** Signed in from a "reset password" link: ask for a new password. */
  needsNewPassword: boolean;
}

/** The Supabase project built into the app (.env.local; see .env.example), or null. */
function builtInConfig(): SupabaseConfig | null {
  // Written out in full so Vite can fill the values in at build time; undefined outside Vite (tests).
  const env = import.meta.env;
  const url = env?.VITE_SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env?.VITE_SUPABASE_ANON_KEY ||
    env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    env?.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** Where email links (confirm, reset password, new email) bring people back to: this app. */
function appAddress(): string | undefined {
  if (typeof window === "undefined" || !/^https?:$/.test(window.location.protocol)) return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

export class AccountService {
  private client_: SupabaseClient | null = null;
  private info: AccountInfo;
  private listeners = new Set<() => void>();
  private sessionEnded = new Set<() => void>();

  constructor(
    private kv: KeyValueStore = browserKeyValue,
    private options: { fetchFn?: typeof fetch; builtIn?: SupabaseConfig | null } = {},
  ) {
    this.useConfig(this.readConfig());
    this.info = this.compute();
  }

  /** The Supabase client (null until a project is set up). */
  get client(): SupabaseClient | null {
    return this.client_;
  }

  getInfo(): AccountInfo {
    return this.info;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Called when the session ends while the app is open (expired, or signed out in another tab). */
  onSessionEnded(fn: () => void): () => void {
    this.sessionEnded.add(fn);
    return () => {
      this.sessionEnded.delete(fn);
    };
  }

  /** Follow other tabs: signing in, out, or into another account there reloads this one. Returns a stop function. */
  watchOtherTabs(onSwitch: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY || !this.client_) return;
      const before = this.client_.account()?.id ?? null;
      this.client_.reloadSession();
      const after = this.client_.account()?.id ?? null;
      if (before !== after) onSwitch();
      else this.changed(); // e.g. a renewed session or a new name
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  private compute(): AccountInfo {
    const account = this.client_?.account() ?? null;
    return {
      account,
      configured: this.client_ !== null,
      needsNewPassword: Boolean(account && this.kv.get(NEW_PASSWORD_KEY) === account.id),
    };
  }

  private changed() {
    this.info = this.compute();
    this.listeners.forEach((fn) => fn());
  }

  // ---- the Supabase project -------------------------------------------------------------

  private readConfig(): SupabaseConfig | null {
    const config = this.options.builtIn !== undefined ? this.options.builtIn : builtInConfig();
    if (!config) return null;
    const problem = checkConfig(config);
    if (problem) {
      console.error(`[account] The Supabase settings in .env.local aren't right: ${problem}`);
      return null;
    }
    return cleanConfig(config);
  }

  private useConfig(config: SupabaseConfig | null) {
    this.client_ = config ? new SupabaseClient(config, this.kv, this.options.fetchFn) : null;
    if (this.client_)
      this.client_.onSessionEnded = () => {
        this.changed();
        this.sessionEnded.forEach((fn) => fn());
      };
  }

  // ---- account --------------------------------------------------------------------------

  private requireClient(): SupabaseClient {
    if (!this.client_) throw new AccountError("Cronos isn't connected to its database. Add the Supabase settings to .env.local.", "config");
    return this.client_;
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.requireClient().signIn(email, password);
    this.changed();
  }

  /** Create an account (it starts with no data). Returns "confirm-email" when the project wants the address confirmed first. */
  async signUp(email: string, password: string, name?: string): Promise<"signed-in" | "confirm-email"> {
    const account = await this.requireClient().signUp(email, password, name, appAddress());
    this.changed();
    return account ? "signed-in" : "confirm-email";
  }

  /** Email a link for choosing a new password. */
  async requestPasswordReset(email: string): Promise<void> {
    await this.requireClient().requestPasswordReset(email, appAddress());
  }

  /** Sign in from an email link (see shell/authLink.ts). Returns what the link was for: "recovery", "signup", "email_change", … */
  async signInFromLink(link: AuthLink): Promise<string> {
    const account = await this.requireClient().signInFromLink(link);
    if (link.type === "recovery") this.kv.set(NEW_PASSWORD_KEY, account.id);
    this.changed();
    return link.type;
  }

  /** Change the name shown in the app (saved with the account). */
  async updateName(name: string): Promise<void> {
    await this.requireClient().updateAccount({ name });
    this.changed();
  }

  /** Change the sign-in email. Supabase emails a confirmation link to the new address. */
  async changeEmail(email: string): Promise<void> {
    await this.requireClient().updateAccount({ email }, appAddress());
    this.changed();
  }

  async changePassword(password: string): Promise<void> {
    await this.requireClient().updateAccount({ password });
    this.dismissNewPassword();
  }

  /** Skip choosing a new password after a reset link (you stay signed in). */
  dismissNewPassword(): void {
    this.kv.remove(NEW_PASSWORD_KEY);
    this.changed();
  }

  /** Pick up account changes made elsewhere (e.g. a new email confirmed in another browser). */
  async reloadAccount(): Promise<void> {
    await this.client_?.reloadAccount().catch(() => null);
    this.changed();
  }

  /** Delete the account and all its data. */
  async deleteAccount(): Promise<void> {
    await this.requireClient().deleteAccount();
    this.kv.remove(NEW_PASSWORD_KEY);
    this.changed();
  }

  async signOut(): Promise<void> {
    await this.client_?.signOut();
    this.kv.remove(NEW_PASSWORD_KEY);
    this.changed();
  }
}
