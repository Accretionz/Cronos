import { parseAuthLink, type AccountService, type AuthLink } from "../core";
import { href } from "./router";

/**
 * Email links from Supabase (confirm sign-up, reset password, confirm a new email) come back
 * to the app with the result in the address's #fragment, where the router would otherwise
 * read it as a page. Take it out before the app starts, and point the address at Account.
 */
export function takeAuthLink(): AuthLink | null {
  if (typeof window === "undefined") return null;
  const link = parseAuthLink(window.location.hash);
  if (link) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${href.account}`);
  return link;
}

const DONE: Record<string, string> = {
  signup: "Email confirmed. Welcome to Cronos!",
  invite: "You're signed in.",
  magiclink: "You're signed in.",
  email_change: "Your new email address is confirmed.",
  recovery: "You're signed in. Choose a new password below.",
};

/** Finish what the link started (usually: sign in). Returns the message to show. */
export async function completeAuthLink(account: AccountService, link: AuthLink): Promise<string | null> {
  if (!link.accessToken && !link.error) return link.message ?? null; // information only
  try {
    const type = await account.signInFromLink(link);
    if (type === "email_change") await account.reloadAccount();
    return DONE[type] ?? "You're signed in.";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
