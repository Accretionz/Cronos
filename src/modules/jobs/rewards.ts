import type { EventBus, Item } from "../../core";
import { APPLY_POINTS, JOB, applyPointsKey, isSubmitted, readJob, type JobApplication } from "./model";

const asJob = (item: Item | undefined): JobApplication | null => (item?.type === JOB ? (item as JobApplication) : null);
const sent = (item: Item | undefined) => {
  const j = asJob(item);
  return j ? isSubmitted(readJob(j.data)) : false;
};

/**
 * Pays APPLY_POINTS Gacha Points when an application is submitted (added as applied, or moved
 * past "saved"). Moving it back to "saved" or deleting it takes them back, unless they've
 * been spent (see the wallet). Later moves (interview, offer, rejection) keep them: you did
 * apply. The award key is per application, so it can never pay twice.
 */
export function watchApplications(bus: EventBus): () => void {
  const award = (j: JobApplication) => {
    const d = readJob(j.data);
    bus.emit("points.award", {
      key: applyPointsKey(j.id),
      amount: APPLY_POINTS,
      reason: `Applied: ${j.title}${d.company ? ` at ${d.company}` : ""}`,
      source: "jobs",
    });
  };
  const revoke = (j: JobApplication) => bus.emit("points.revoke", { key: applyPointsKey(j.id) });

  const offCreated = bus.on("item.created", ({ item }) => {
    if (sent(item)) award(item as JobApplication);
  });
  const offUpdated = bus.on("item.updated", ({ item, previous }) => {
    if (item.type !== JOB) return;
    const was = sent(previous);
    const is = sent(item);
    if (!was && is) award(item as JobApplication);
    else if (was && !is) revoke(item as JobApplication);
  });
  const offDeleted = bus.on("item.deleted", ({ item }) => {
    if (sent(item)) revoke(item as JobApplication);
  });
  return () => {
    offCreated();
    offUpdated();
    offDeleted();
  };
}
