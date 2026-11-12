import type { UserAccount } from "../core";

/** Up to two initials from the name, else the first letter of the email. */
export function initials(account: Pick<UserAccount, "name" | "email">): string {
  const words = (account.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  return (account.email.trim()[0] ?? "?").toUpperCase();
}

/** The first name, for greetings ("Good evening, Jie"). */
export function firstName(account: UserAccount | null | undefined): string | null {
  const first = account?.name?.trim().split(/\s+/)[0];
  return first || null;
}

/** The account's badge: initials on the accent color (a plain person outline if there's no account). */
export function Avatar({ account, size = 32 }: { account: UserAccount | null; size?: number }) {
  return (
    <span className={`avatar${account ? "" : " is-empty"}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden>
      {account ? (
        initials(account)
      ) : (
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="8.5" r="3.8" />
          <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
        </svg>
      )}
    </span>
  );
}
