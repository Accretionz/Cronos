import { describe, expect, it } from "vitest";
import { POINTS_ENTRY, balanceOf, startWallet, type PointsEntry } from "../../pokemon/wallet";
import { makeStore, settle } from "../../test/helpers";
import {
  APPLY_POINTS,
  JOB,
  cleanUrl,
  daysAgo,
  dueFollowUps,
  jobStats,
  matchesFilter,
  matchesSearch,
  readJob,
  sortApps,
  withStatus,
  type JobApplication,
  type JobData,
} from "./model";
import { watchApplications } from "./rewards";

const TODAY = "2026-10-31";
let n = 0;
const app = (title: string, data: Partial<JobData>, createdAt = "2026-10-01T10:00:00.000Z") =>
  ({ id: `j${++n}`, type: JOB, title, status: "open", tags: [], createdAt, updatedAt: createdAt, data: readJob(data as Record<string, unknown>) }) as JobApplication;

describe("job applications", () => {
  it("moving past 'saved' stamps the applied day once and records each move", () => {
    let d = readJob({ company: "Acme", status: "saved" });
    expect(d.appliedOn).toBe(undefined);
    d = withStatus(d, "applied", "2026-10-20");
    expect(d.appliedOn).toBe("2026-10-20");
    d = withStatus(d, "interviewing", "2026-10-27");
    expect(d.appliedOn).toBe("2026-10-20"); // still the day it was sent
    d = withStatus(d, "rejected", "2026-10-30");
    expect(d.history.map((h) => `${h.status}@${h.day}`)).toEqual(["applied@2026-10-20", "interviewing@2026-10-27", "rejected@2026-10-30"]);
    expect(withStatus(d, "saved", TODAY).appliedOn).toBe(undefined); // undo: it wasn't really sent
    expect(withStatus(d, "rejected", TODAY)).toBe(d); // same status: unchanged
  });

  it("fills in missing fields from older or synced records", () => {
    const d = readJob({ status: "bogus" } as never);
    expect([d.company, d.status, d.history.length]).toEqual(["", "saved", 0]);
  });

  it("counts the search: applied, this week, interviews, offers, response rate", () => {
    const apps = [
      app("A", { company: "A", status: "applied", appliedOn: "2026-10-30" }),
      app("B", { company: "B", status: "interviewing", appliedOn: "2026-10-10", history: [{ status: "applied", day: "2026-10-10" }, { status: "interviewing", day: "2026-10-20" }] }),
      app("C", { company: "C", status: "rejected", appliedOn: "2026-10-25", history: [{ status: "interviewing", day: "2026-10-28" }, { status: "rejected", day: "2026-10-30" }] }),
      app("D", { company: "D", status: "saved" }),
      app("E", { company: "E", status: "offer", appliedOn: "2026-09-01" }),
    ];
    const s = jobStats(apps, TODAY);
    expect([s.applied, s.thisWeek, s.interviewing, s.offers]).toEqual([4, 2, 1, 1]);
    expect(s.responseRate).toBe(3 / 4); // B, C (interviewed before the rejection) and E
    expect(s.counts.saved).toBe(1);
    expect(apps.filter((a) => matchesFilter(a.data, "active")).map((a) => a.title)).toEqual(["A", "B", "D", "E"]);
    expect(apps.filter((a) => matchesFilter(a.data, "closed")).map((a) => a.title)).toEqual(["C"]);
    expect(sortApps(apps).map((a) => a.title)).toEqual(["A", "C", "B", "D", "E"]);
  });

  it("searches role, company, location and notes, ignoring case and accents", () => {
    const a = app("Frontend Engineer", { company: "Café Labs", location: "Remote", notes: "Referred by Sam" });
    expect(["cafe", "frontend labs", "remote", "sam", ""].map((q) => matchesSearch(a, q))).toEqual([true, true, true, true, true]);
    expect(matchesSearch(a, "backend")).toBe(false);
  });

  it("lists follow-ups that are due, skipping closed ones and offers", () => {
    const apps = [
      app("Late", { company: "L", status: "applied", appliedOn: "2026-10-01", followUpOn: "2026-10-29" }),
      app("Today", { company: "T", status: "interviewing", appliedOn: "2026-10-01", followUpOn: TODAY }),
      app("Later", { company: "F", status: "applied", appliedOn: "2026-10-01", followUpOn: "2026-11-05" }),
      app("Closed", { company: "C", status: "rejected", appliedOn: "2026-10-01", followUpOn: "2026-10-20" }),
      app("Offer", { company: "O", status: "offer", appliedOn: "2026-10-01", followUpOn: "2026-10-20" }),
    ];
    expect(dueFollowUps(apps, TODAY).map((a) => a.title)).toEqual(["Late", "Today"]);
  });

  it("formats days and links", () => {
    expect(["2026-10-31", "2026-10-30", "2026-10-27"].map((d) => daysAgo(d, TODAY))).toEqual(["today", "yesterday", "4 days ago"]);
    expect(cleanUrl("jobs.acme.com/123")).toBe("https://jobs.acme.com/123");
    expect(cleanUrl("https://x.io/a")).toBe("https://x.io/a");
    expect([cleanUrl(""), cleanUrl("not a link"), cleanUrl("localhost")]).toEqual([null, null, null]);
  });
});

describe("applications → Gacha Points", () => {
  async function setup() {
    const ctx = await makeStore();
    startWallet(ctx.bus, ctx.store);
    await settle();
    const base = balanceOf(ctx.store.query({ type: POINTS_ENTRY }) as PointsEntry[]);
    watchApplications(ctx.bus);
    return { ...ctx, gained: () => balanceOf(ctx.store.query({ type: POINTS_ENTRY }) as PointsEntry[]) - base };
  }
  const applied = (): JobData => withStatus(readJob({ company: "Acme", status: "saved" }), "applied", TODAY);

  it(`pays ${APPLY_POINTS} GP for each application sent, once`, async () => {
    const { store, gained } = await setup();
    const a = await store.create<JobData>({ type: JOB, title: "Engineer", data: applied() });
    await settle();
    expect(gained()).toBe(10);
    // Interview, rejection, edits: still one award.
    await store.update(a.id, { data: withStatus(a.data as JobData, "interviewing", TODAY) });
    await store.update(a.id, { title: "Senior Engineer" });
    await settle();
    expect(gained()).toBe(10);
    await store.create<JobData>({ type: JOB, title: "Designer", data: applied() });
    await settle();
    expect(gained()).toBe(20);
  });

  it("saved jobs pay when they're sent; moving back or deleting takes it back", async () => {
    const { store, gained } = await setup();
    const a = await store.create<JobData>({ type: JOB, title: "Engineer", data: readJob({ company: "Acme", status: "saved" }) });
    await settle();
    expect(gained()).toBe(0);
    const sent = await store.update(a.id, { data: withStatus(a.data as JobData, "applied", TODAY) });
    await settle();
    expect(gained()).toBe(10);
    await store.update(a.id, { data: withStatus(sent.data as JobData, "saved", TODAY) });
    await settle();
    expect(gained()).toBe(0);
    const again = await store.update(a.id, { data: withStatus(store.get(a.id)!.data as JobData, "applied", TODAY) });
    await settle();
    expect(gained()).toBe(10); // same key: re-sending isn't a second award
    await store.remove(again.id);
    await settle();
    expect(gained()).toBe(0);
    await store.restore(again); // Undo
    await settle();
    expect(gained()).toBe(10);
  });
});

describe("jobs settings", () => {
  it("defaults to showing notes and the posting link, and keeps what was saved", async () => {
    const { readJobSettings, saveJobSettings, JOB_SETTINGS } = await import("./settings");
    expect(readJobSettings(undefined)).toEqual({ showDetails: true, showNotes: true, showLink: true, showTimeline: false });
    expect(readJobSettings({ showDetails: false, showTimeline: "yes" }).showTimeline).toBe(false); // junk ignored
    const { store, bus } = await makeStore();
    const heard: string[] = [];
    bus.on("item.created", () => heard.push("created"));
    await saveJobSettings(store, { showDetails: false });
    await saveJobSettings(store, { showTimeline: true });
    const all = store.query({ type: JOB_SETTINGS });
    expect(all.length).toBe(1); // one settings item, fixed id
    expect(readJobSettings(all[0].data)).toEqual({ showDetails: false, showNotes: true, showLink: true, showTimeline: true });
    expect(heard).toEqual([]); // saved quietly
  });
});
