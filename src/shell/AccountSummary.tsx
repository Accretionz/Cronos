import { useAccountInfo } from "../core";
import { Avatar } from "./Avatar";
import { href } from "./router";

/** Settings → Account: who's signed in, with a link to manage the account. */
export function AccountSummary() {
  const { account } = useAccountInfo();
  if (!account) return null;
  return (
    <a className="card account-summary" href={href.account}>
      <Avatar account={account} size={44} />
      <span className="account-summary-text">
        <strong>{account.name || account.email}</strong>
        {account.name && <span className="muted">{account.email}</span>}
      </span>
      <span className="account-summary-action">Manage</span>
    </a>
  );
}
