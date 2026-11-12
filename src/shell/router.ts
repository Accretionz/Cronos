import { useSyncExternalStore } from "react";
import { moduleHref } from "../core/links";

/**
 * Minimal hash router: "#/" is the dashboard, "#/m/<moduleId>" is a module page,
 * "#/settings" is settings, "#/account" is the account page. Hash routes work with any static host and offline.
 */
export type Route = { name: "today" } | { name: "settings" } | { name: "account" } | { name: "module"; id: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/settings") return { name: "settings" };
  if (path === "/account") return { name: "account" };
  const m = path.match(/^\/m\/([\w-]+)/);
  if (m) return { name: "module", id: m[1] };
  return { name: "today" };
}

export const href = {
  today: "#/",
  settings: "#/settings",
  account: "#/account",
  module: moduleHref,
};

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
