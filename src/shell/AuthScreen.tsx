import { useEffect, useState } from "react";
import { useAccountInfo } from "../core";
import { AuthCard } from "./Account";
import { DaySky, useNow } from "./DaySky";
import { BrandMark } from "./icons";

/**
 * What you see when nobody is signed in: Cronos keeps your data in your account, so there's
 * nothing to show until you sign in or create one. The database is fixed when the app is
 * built; a build without it says so (for whoever deploys it), with no way to enter one here.
 */
export function AuthScreen({ notice }: { notice?: string | null }) {
  const info = useAccountInfo();
  const now = useNow();
  const [shown, setShown] = useState(notice ?? null);
  useEffect(() => setShown(notice ?? null), [notice]);
  return (
    <main className="auth-screen">
      <div className="auth-column">
        <div className="auth-brand">
          <BrandMark size={30} />
          <span>Cronos</span>
        </div>
        <DaySky now={now}>
          <p className="eyebrow">Your day, all in one place</p>
          <h1>{info.configured ? "Sign in to Cronos" : "Cronos isn't available"}</h1>
        </DaySky>
        <div className="auth-cards">
          {shown && (
            <p className="cloud-note auth-notice" role="status">
              {shown}
            </p>
          )}
          {info.configured ? (
            <AuthCard />
          ) : (
            <div className="card account-auth" role="alert">
              <h2 className="card-title">Not connected to a database</h2>
              <p className="muted">
                This copy of Cronos was built without its Supabase settings. Add <code>VITE_SUPABASE_URL</code> and{" "}
                <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>, then restart <code>npm run dev</code> or rebuild. See{" "}
                <code>supabase/README.md</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Loading the account's data, or a problem doing so. */
export function LoadingScreen({ error, onRetry, onSignOut }: { error?: string | null; onRetry?: () => void; onSignOut?: () => void }) {
  return (
    <main className="auth-screen is-loading">
      <div className="auth-column">
        <div className="auth-brand">
          <BrandMark size={30} />
          <span>Cronos</span>
        </div>
        {error ? (
          <div className="card account-auth" role="alert">
            <h1 className="card-title">Couldn't load your data</h1>
            <p className="muted">{error}</p>
            <div className="form-actions">
              {onSignOut && (
                <button className="btn-ghost" onClick={onSignOut}>
                  Sign out
                </button>
              )}
              <span className="spacer" />
              {onRetry && (
                <button className="btn-primary" onClick={onRetry}>
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="muted auth-loading" role="status">
            <span className="auth-spinner" aria-hidden /> Loading your data…
          </p>
        )}
      </div>
    </main>
  );
}
