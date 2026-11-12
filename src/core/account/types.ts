/** A signed-in person, as Supabase Auth describes them. */
export interface UserAccount {
  id: string;
  email: string;
  /** The name the person chose (Supabase user metadata); may be missing. */
  name?: string;
  /** A new email address waiting for confirmation (after "Change email"). */
  pendingEmail?: string;
  /** When the account was created (ISO). */
  createdAt?: string;
}

export type AccountErrorKind = "offline" | "auth" | "server" | "config";

/** A problem talking to Supabase, sorted into what the app should tell the person. */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly kind: AccountErrorKind,
  ) {
    super(message);
    this.name = "AccountError";
  }
}
