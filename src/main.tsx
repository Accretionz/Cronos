import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AccountContext, AccountError, AccountService, clearOldLocalData, CoreContext, createCore, SupabaseAdapter } from "./core";
import { modules } from "./modules";
import { setNotice, takeNotice } from "./shell/Account";
import { App } from "./shell/App";
import { adoptBrowserNavOrder } from "./shell/navOrder";
import { AuthScreen, LoadingScreen } from "./shell/AuthScreen";
import { completeAuthLink, takeAuthLink } from "./shell/authLink";
import "./styles.css";

/**
 * Cronos keeps nothing on the device: your data lives in your account in Supabase. So the
 * app starts by checking who's signed in. Nobody: the sign-in screen. Someone: load their
 * data, then the app. Signing in or out reloads the page to switch.
 */
const root = createRoot(document.getElementById("root")!);
const account = new AccountService();
const show = (ui: ReactNode) =>
  root.render(
    <StrictMode>
      <AccountContext.Provider value={account}>{ui}</AccountContext.Provider>
    </StrictMode>,
  );

void clearOldLocalData(); // earlier versions kept data on the device
// Back from an email link (confirm sign-up, reset password…)? Read it before the router does.
const authLink = takeAuthLink();
// Signing in or out in another tab switches this one too.
account.watchOtherTabs(() => window.location.reload());
account.onSessionEnded(() => {
  setNotice("Your session ended. Sign in again.");
  window.location.reload();
});

async function start() {
  let notice = takeNotice();
  if (authLink) notice = (await completeAuthLink(account, authLink)) ?? notice;
  // A link can also land in a tab where Cronos is already open (only the #fragment changes).
  window.addEventListener("hashchange", async () => {
    const link = takeAuthLink();
    if (!link) return;
    const text = await completeAuthLink(account, link);
    if (text) setNotice(text);
    window.location.reload();
  });

  const client = account.client;
  if (!client || !account.getInfo().account) {
    show(<AuthScreen notice={notice} />);
    return;
  }

  show(<LoadingScreen />);
  try {
    const core = await createCore(modules, new SupabaseAdapter(client), { account });
    void adoptBrowserNavOrder(core.store);
    // Handy for debugging in the browser console during development: window.cronos.store.query()
    if (import.meta.env.DEV) (window as unknown as { cronos: typeof core }).cronos = core;
    // Safety net: errors nobody caught still reach the user instead of vanishing into the console.
    window.addEventListener("unhandledrejection", (e) => {
      if ((e.reason as { reported?: boolean } | undefined)?.reported) {
        e.preventDefault(); // already shown (e.g. "Couldn't save your change")
        return;
      }
      core.bus.emit("app.error", { message: "Something went wrong. If it keeps happening, reload the page." });
    });
    show(
      <CoreContext.Provider value={core}>
        <App />
      </CoreContext.Provider>,
    );
    if (notice) window.setTimeout(() => core.bus.emit("app.notify", { text: notice!, icon: "✓" }), 400);
  } catch (err) {
    console.error(err);
    if (err instanceof AccountError && err.kind === "auth") {
      // The session couldn't be renewed: back to the sign-in screen.
      show(<AuthScreen notice="Your session ended. Sign in again." />);
      return;
    }
    show(
      <LoadingScreen
        error={err instanceof Error ? err.message : String(err)}
        onRetry={() => window.location.reload()}
        onSignOut={async () => {
          await account.signOut();
          window.location.reload();
        }}
      />,
    );
  }
}

void start();
