import { describe, expect, it } from "vitest";
import { createCore } from "../app";
import { SupabaseAdapter } from "./adapter";
import { AccountService } from "./service";
import type { KeyValueStore } from "./supabase";

/** A tiny Supabase stand-in: accounts, sessions and each account's items, over fake fetch. */
function fakeSupabase() {
  const users = new Map<string, { id: string; email: string; password: string }>();
  const tokens = new Map<string, string>();
  const rows = new Map<string, Map<string, { item: unknown; deleted: boolean }>>();
  let n = 0;
  const session = (u: { id: string; email: string }) => {
    const t = `t${++n}`;
    tokens.set(t, u.id);
    return { access_token: t, refresh_token: `r${n}`, expires_in: 3600, user: { id: u.id, email: u.email } };
  };
  const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const me = tokens.get(String((init.headers as Record<string, string>).Authorization ?? "").replace("Bearer ", ""));
    if (url.pathname === "/auth/v1/signup") {
      const u = { id: `u${users.size + 1}`, email: body.email.toLowerCase(), password: body.password };
      users.set(u.id, u);
      return json(200, session(u));
    }
    if (url.pathname === "/auth/v1/token") {
      const u = [...users.values()].find((x) => x.email === body.email.toLowerCase() && x.password === body.password);
      return u ? json(200, session(u)) : json(400, { error_code: "invalid_credentials" });
    }
    if (url.pathname === "/auth/v1/logout") return json(204, null);
    if (url.pathname === "/rest/v1/items") {
      if (!me) return json(401, {});
      const mine = rows.get(me) ?? new Map();
      rows.set(me, mine);
      if (init.method === "POST") for (const r of body) mine.set(r.id, { item: r.item, deleted: false });
      if (init.method === "PATCH") for (const r of mine.values()) r.deleted = true; // (tests only use "delete everything")
      if (!init.method || init.method === "GET") return json(200, [...mine.values()].filter((r) => !r.deleted).map((r) => ({ item: r.item })));
      return json(201, null);
    }
    return json(404, {});
  }) as typeof fetch;
  return { fetchFn, users, rows };
}

function memoryKv(): KeyValueStore {
  const data = new Map<string, string>();
  return { get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

const service = (server: ReturnType<typeof fakeSupabase>, kv = memoryKv()) =>
  new AccountService(kv, { fetchFn: server.fetchFn, builtIn: { url: "https://demo.supabase.co", anonKey: "sb_publishable_0123456789abcdef" } });

/** The app as it starts for a signed-in account: its data, loaded from Supabase. */
const openApp = (account: AccountService) => createCore([], new SupabaseAdapter(account.client!), { account });

describe("Accounts", () => {
  it("shows who's signed in, and stays signed in on the next visit", async () => {
    const server = fakeSupabase();
    const kv = memoryKv();
    const a = service(server, kv);
    expect(a.getInfo().account).toBeNull();
    expect(a.getInfo().configured).toBe(true);
    expect(await a.signUp("me@example.com", "longpassword")).toBe("signed-in");
    expect(a.getInfo().account?.email).toBe("me@example.com");
    expect(service(server, kv).getInfo().account?.email).toBe("me@example.com");
    await a.signOut();
    expect(a.getInfo().account).toBeNull();
  });

  it("keeps each account's data separate, and nothing on the device", async () => {
    const server = fakeSupabase();
    const jie = service(server);
    await jie.signUp("jie@example.com", "longpassword");
    const app = await openApp(jie);
    await app.store.create({ type: "task", title: "Jie's task" });
    app.stop();

    // Another device: signing in shows exactly Jie's data.
    const other = service(server);
    await other.signIn("jie@example.com", "longpassword");
    const again = await openApp(other);
    expect(again.store.query({ type: "task" }).map((t) => t.title)).toEqual(["Jie's task"]);
    again.stop();

    // A new account starts empty.
    const sam = service(server);
    await sam.signUp("sam@example.com", "longpassword");
    const samApp = await openApp(sam);
    expect(samApp.store.query({ type: "task" })).toEqual([]);
    await samApp.store.create({ type: "task", title: "Sam's task" });
    samApp.stop();
    expect([...server.rows.get("u1")!.values()].map((r) => (r.item as { title: string }).title)).toEqual(["Jie's task"]);
  });

  it("remembers to ask for a new password after a reset link", async () => {
    const server = fakeSupabase();
    const kv = memoryKv();
    const a = service(server, kv);
    await a.signUp("me@example.com", "longpassword");
    kv.set("cronos.cloud.newPassword", "u1"); // what signInFromLink sets for a recovery link
    expect(service(server, kv).getInfo().needsNewPassword).toBe(true); // survives the reload
    a.dismissNewPassword();
    expect(service(server, kv).getInfo().needsNewPassword).toBe(false);
  });

  it("only uses the project the app was built with", async () => {
    const kv = memoryKv();
    kv.set("cronos.cloud.config", JSON.stringify({ url: "https://other.supabase.co", anonKey: "sb_publishable_0123456789abcdef" }));
    const none = new AccountService(kv, { builtIn: null, fetchFn: fakeSupabase().fetchFn });
    expect(none.getInfo().configured).toBe(false); // a project saved on the device is ignored
    expect(none.client).toBeNull();
    let msg = "";
    await none.signIn("me@example.com", "longpassword").catch((e: Error) => (msg = e.message));
    expect(msg).toContain(".env.local");
    expect("setServer" in none).toBe(false); // no way to switch databases from the app
    const broken = new AccountService(memoryKv(), { builtIn: { url: "nope", anonKey: "x" } });
    expect(broken.getInfo().configured).toBe(false);
    expect(service(fakeSupabase()).getInfo().configured).toBe(true);
  });
});
