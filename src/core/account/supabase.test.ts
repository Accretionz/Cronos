import { describe, expect, it } from "vitest";
import { SESSION_KEY, SupabaseClient, checkConfig, parseAuthLink, type KeyValueStore } from "./supabase";
import { AccountError } from "./types";

const CONFIG = { url: "https://demo.supabase.co/", anonKey: "anon-key-0123456789abcdef" };

function memoryKv(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** A fetch that answers from a list of handlers and records every request. */
function fakeFetch(handler: (c: Call) => { status?: number; body?: unknown } | "network-error") {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = handler(call);
    if (r === "network-error") throw new TypeError("Failed to fetch");
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body ?? {} } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

const session = (token: string, expiresIn = 3600) => ({
  access_token: token,
  refresh_token: `refresh-${token}`,
  expires_in: expiresIn,
  user: { id: "u1", email: "me@example.com" },
});

describe("SupabaseClient", () => {
  it("signs in with email and password and keeps the session", async () => {
    const kv = memoryKv();
    const f = fakeFetch(() => ({ body: session("t1") }));
    const r = new SupabaseClient(CONFIG, kv, f.fn);
    const account = await r.signIn(" me@example.com ", "secret123");
    expect(account).toEqual({ id: "u1", email: "me@example.com" });
    expect(f.calls[0].url).toBe("https://demo.supabase.co/auth/v1/token?grant_type=password");
    expect(f.calls[0].headers.apikey).toBe(CONFIG.anonKey);
    expect(f.calls[0].body).toEqual({ email: "me@example.com", password: "secret123" });
    expect(JSON.parse(kv.data.get(SESSION_KEY)!).accessToken).toBe("t1");
    // A new client (next visit) is still signed in.
    expect(new SupabaseClient(CONFIG, kv, f.fn).account()!.id).toBe("u1");
  });

  it("explains a wrong password and an unconfirmed email", async () => {
    const r1 = new SupabaseClient(CONFIG, memoryKv(), fakeFetch(() => ({ status: 400, body: { error_code: "invalid_credentials", msg: "Invalid login credentials" } })).fn);
    let msg = "";
    await r1.signIn("a@b.c", "x").catch((e: Error) => (msg = e.message));
    expect(msg).toBe("That email and password don't match.");
    const r2 = new SupabaseClient(CONFIG, memoryKv(), fakeFetch(() => ({ body: { id: "u1", email: "a@b.c" } })).fn);
    expect(await r2.signUp("a@b.c", "longpassword")).toBeNull(); // confirmation email sent: no session yet
    expect(r2.account()).toBeNull();
  });

  it("loads the account's items, page by page", async () => {
    let page = 0;
    const f = fakeFetch((c) =>
      c.url.includes("/auth/") ? { body: session("t1") } : { body: page++ === 0 ? Array.from({ length: 1000 }, (_, i) => ({ item: { id: `i${i}` } })) : [{ item: { id: "last" } }, { item: null }] },
    );
    const r = new SupabaseClient(CONFIG, memoryKv(), f.fn);
    await r.signIn("me@example.com", "pw");
    const items = await r.loadItems();
    expect(items.length).toBe(1001);
    expect(f.calls[1].url).toBe("https://demo.supabase.co/rest/v1/items?select=item&deleted=is.false&order=id.asc&limit=1000&offset=0");
    expect(f.calls[1].headers.Authorization).toBe("Bearer t1");
    expect(f.calls[2].url).toContain("&offset=1000");
  });

  it("saves items under the signed-in user", async () => {
    const f = fakeFetch((c) => (c.url.includes("/auth/") ? { body: session("t1") } : { status: 201, body: null }));
    const r = new SupabaseClient(CONFIG, memoryKv(), f.fn);
    await r.signIn("me@example.com", "pw");
    await r.saveItems([{ id: "a", type: "task" } as never], "2026-11-11T08:00:00.000Z");
    const call = f.calls[1];
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://demo.supabase.co/rest/v1/items?on_conflict=user_id,id");
    expect(call.headers.Prefer).toBe("resolution=merge-duplicates,return=minimal");
    expect(call.body).toEqual([{ user_id: "u1", id: "a", type: "task", item: { id: "a", type: "task" }, deleted: false, changed_at: "2026-11-11T08:00:00.000Z" }]);
  });

  it("deletes items (quoting ids) and replaces everything", async () => {
    const f = fakeFetch((c) => (c.url.includes("/auth/") ? { body: session("t1") } : { status: 204, body: null }));
    const r = new SupabaseClient(CONFIG, memoryKv(), f.fn);
    await r.signIn("me@example.com", "pw");
    await r.deleteItems(["gp:income:a,b", 'x"y']);
    expect(f.calls[1].method).toBe("PATCH");
    expect(decodeURIComponent(f.calls[1].url.split("?id=")[1])).toBe('in.("gp:income:a,b","x\\"y")');
    expect((f.calls[1].body as { deleted: boolean; item: null }).deleted).toBe(true);
    await r.replaceItems([{ id: "n", type: "note" } as never]);
    expect(f.calls[2].url).toBe("https://demo.supabase.co/rest/v1/items?deleted=is.false");
    expect(f.calls[2].method).toBe("PATCH");
    const cleared = (f.calls[2].body as { changed_at: string }).changed_at;
    const saved = (f.calls[3].body as { changed_at: string }[])[0].changed_at;
    expect(saved > cleared).toBe(true); // the restored items count as newer than the clear
  });

  it("renews an expiring session before calling, and once more after a 401", async () => {
    const kv = memoryKv();
    let n = 0;
    let rejectNext = false;
    const f = fakeFetch((c) => {
      if (c.url.includes("grant_type=password")) return { body: session("old", 10) }; // expires in 10 s
      if (c.url.includes("grant_type=refresh_token")) return { body: session(`new${++n}`) };
      if (rejectNext) {
        rejectNext = false;
        return { status: 401, body: { message: "JWT expired" } };
      }
      return { body: [] };
    });
    const r = new SupabaseClient(CONFIG, kv, f.fn);
    await r.signIn("me@example.com", "pw");
    await r.loadItems();
    expect(f.calls[1].body).toEqual({ refresh_token: "refresh-old" });
    expect(f.calls[2].headers.Authorization).toBe("Bearer new1");
    rejectNext = true;
    await r.loadItems();
    expect(f.calls.map((c) => c.url.split("/v1/")[1].split("?")[0])).toEqual(["token", "token", "items", "items", "token", "items"]);
    expect(f.calls[5].headers.Authorization).toBe("Bearer new2");
  });

  it("signs out when the session can't be renewed, and reports no connection as offline", async () => {
    const kv = memoryKv();
    const f = fakeFetch((c) => (c.url.includes("grant_type=password") ? { body: session("old", 10) } : { status: 400, body: { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" } }));
    const r = new SupabaseClient(CONFIG, kv, f.fn);
    await r.signIn("me@example.com", "pw");
    let err: unknown;
    let ended = 0;
    r.onSessionEnded = () => ended++;
    await r.loadItems().catch((e) => (err = e));
    expect(ended).toBe(1);
    expect((err as AccountError).kind).toBe("auth");
    expect(r.account()).toBeNull();
    expect(kv.data.has(SESSION_KEY)).toBe(false);

    const down = new SupabaseClient(CONFIG, memoryKv(), fakeFetch(() => "network-error").fn);
    await down.signIn("me@example.com", "pw").catch((e) => (err = e));
    expect((err as AccountError).kind).toBe("offline");
  });

  it("checks server settings", () => {
    expect(checkConfig(CONFIG)).toBeNull();
    expect(checkConfig({ url: "http://demo.supabase.co", anonKey: CONFIG.anonKey })).toBe("The project URL must start with https://");
    expect(checkConfig({ url: "http://localhost:54321", anonKey: CONFIG.anonKey })).toBeNull();
    expect(checkConfig({ url: "nope", anonKey: CONFIG.anonKey })).not.toBeNull();
    expect(checkConfig({ url: CONFIG.url, anonKey: "short" })).toBe("Paste the project's anon (public) key.");
  });
});

describe("Accounts", () => {
  const user = (extra: Record<string, unknown> = {}) => ({ id: "u1", email: "me@example.com", created_at: "2026-11-01T10:00:00Z", user_metadata: { name: "Jie" }, ...extra });
  const signedIn = async (handler: Parameters<typeof fakeFetch>[0]) => {
    const kv = memoryKv();
    const f = fakeFetch((c) => (c.url.includes("grant_type=password") ? { body: { ...session("t1"), user: user() } } : handler(c)));
    const r = new SupabaseClient(CONFIG, kv, f.fn);
    await r.signIn("me@example.com", "secret123");
    return { r, f, kv };
  };

  it("keeps the account's name and creation date from the session", async () => {
    const { r } = await signedIn(() => ({}));
    expect(r.account()).toEqual({ id: "u1", email: "me@example.com", name: "Jie", createdAt: "2026-11-01T10:00:00Z" });
  });

  it("creates an account with a name and a link back to the app", async () => {
    const f = fakeFetch(() => ({ body: { id: "u2", email: "new@example.com", user_metadata: { name: "Ana" } } }));
    const r = new SupabaseClient(CONFIG, memoryKv(), f.fn);
    const account = await r.signUp("new@example.com", "longpassword", "  Ana ", "http://localhost:5173/");
    expect(account).toBeNull(); // no session: the project wants the email confirmed first
    expect(f.calls[0].url).toBe("https://demo.supabase.co/auth/v1/signup?redirect_to=http%3A%2F%2Flocalhost%3A5173%2F");
    expect(f.calls[0].body).toEqual({ email: "new@example.com", password: "longpassword", data: { name: "Ana" } });
  });

  it("sends a password reset email", async () => {
    const f = fakeFetch(() => ({ body: {} }));
    await new SupabaseClient(CONFIG, memoryKv(), f.fn).requestPasswordReset(" me@example.com", "https://cronos.app/");
    expect(f.calls[0].url).toBe("https://demo.supabase.co/auth/v1/recover?redirect_to=https%3A%2F%2Fcronos.app%2F");
    expect(f.calls[0].body).toEqual({ email: "me@example.com" });
  });

  it("reads email links from the address", () => {
    expect(parseAuthLink("#/settings")).toBeNull();
    expect(parseAuthLink("")).toBeNull();
    const link = parseAuthLink("#access_token=at&expires_at=1893456000&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery")!;
    expect(link.type).toBe("recovery");
    expect(link.accessToken).toBe("at");
    expect(link.refreshToken).toBe("rt");
    expect(link.expiresAt).toBe(1893456000);
    const bad = parseAuthLink("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")!;
    expect(bad.error).toBe("access_denied");
    expect(bad.errorCode).toBe("otp_expired");
  });

  it("signs in from an email link", async () => {
    const kv = memoryKv();
    const f = fakeFetch(() => ({ body: user() }));
    const r = new SupabaseClient(CONFIG, kv, f.fn);
    const account = await r.signInFromLink(parseAuthLink("#access_token=at&refresh_token=rt&expires_in=3600&type=signup")!);
    expect(account.name).toBe("Jie");
    expect(f.calls[0].url).toBe("https://demo.supabase.co/auth/v1/user");
    expect(f.calls[0].headers.Authorization).toBe("Bearer at");
    expect(JSON.parse(kv.data.get(SESSION_KEY)!).refreshToken).toBe("rt");
  });

  it("explains an expired email link", async () => {
    const r = new SupabaseClient(CONFIG, memoryKv(), fakeFetch(() => ({ status: 401, body: {} })).fn);
    let msg = "";
    await r.signInFromLink(parseAuthLink("#error=access_denied&error_code=otp_expired&error_description=expired")!).catch((e: Error) => (msg = e.message));
    expect(msg).toBe("That link has expired or was already used. Request a new one.");
    await r.signInFromLink(parseAuthLink("#access_token=old&refresh_token=rt&type=recovery")!).catch((e: Error) => (msg = e.message));
    expect(msg).toBe("That link has expired. Request a new one.");
    expect(r.account()).toBeNull();
  });

  it("changes the name, email and password", async () => {
    const { r, f, kv } = await signedIn((c) =>
      c.url.includes("/auth/v1/user") && c.method === "PUT"
        ? { body: user({ user_metadata: { name: (c.body as { data?: { name: string } }).data?.name ?? "Jie" }, new_email: (c.body as { email?: string }).email }) }
        : {},
    );
    await r.updateAccount({ name: " Jie Liu " });
    let put = f.calls[f.calls.length - 1];
    expect(put.method).toBe("PUT");
    expect(put.headers.Authorization).toBe("Bearer t1");
    expect(put.body).toEqual({ data: { name: "Jie Liu" } });
    expect(r.account()!.name).toBe("Jie Liu");
    expect(JSON.parse(kv.data.get(SESSION_KEY)!).user.name).toBe("Jie Liu");

    await r.updateAccount({ email: "new@example.com" }, "http://localhost:5173/");
    put = f.calls[f.calls.length - 1];
    expect(put.url).toBe("https://demo.supabase.co/auth/v1/user?redirect_to=http%3A%2F%2Flocalhost%3A5173%2F");
    expect(r.account()!.email).toBe("me@example.com"); // unchanged until confirmed
    expect(r.account()!.pendingEmail).toBe("new@example.com");

    await r.updateAccount({ password: "brand-new-pass" });
    expect(f.calls[f.calls.length - 1].body).toEqual({ password: "brand-new-pass" });
  });

  it("explains why a password change was refused", async () => {
    const { r } = await signedIn(() => ({ status: 422, body: { error_code: "same_password", msg: "New password should be different from the old password." } }));
    let msg = "";
    await r.updateAccount({ password: "secret123" }).catch((e: Error) => (msg = e.message));
    expect(msg).toBe("Choose a password different from your current one.");
  });

  it("deletes the account and signs out", async () => {
    const { r, f, kv } = await signedIn(() => ({ status: 204, body: null }));
    await r.deleteAccount();
    const call = f.calls[f.calls.length - 1];
    expect(call.url).toBe("https://demo.supabase.co/rest/v1/rpc/delete_my_account");
    expect(call.method).toBe("POST");
    expect(r.account()).toBeNull();
    expect(kv.data.has(SESSION_KEY)).toBe(false);
  });

  it("says when account deletion isn't set up on the server", async () => {
    const { r } = await signedIn(() => ({ status: 404, body: { code: "PGRST202", message: "Could not find the function" } }));
    let msg = "";
    await r.deleteAccount().catch((e: Error) => (msg = e.message));
    expect(msg).toBe(
      "Deleting accounts isn't set up yet: run supabase/migrations/20261111000000_account.sql in this project's SQL Editor. (Supabase said: Could not find the function [PGRST202])",
    );
    expect(r.account()).not.toBeNull(); // still signed in
  });
});
