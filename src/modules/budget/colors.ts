import { useMemo } from "react";
import { useItems, type ItemStore } from "../../core";

/**
 * Category colors.
 *
 * Every category has one color, used everywhere: transaction tags, the category list,
 * the pie and its legend. A color is either a named swatch (with its own light and dark
 * step, so dark mode stays readable) or a custom "#rrggbb" picked by the user.
 */

export interface Swatch {
  id: string;
  name: string;
  /** Checked as a color-blind-safe set (the first eight). */
  validated?: boolean;
}

/** Light/dark values live in budget.css as --cat-<id>. Order = order shown in Settings. */
export const SWATCHES: Swatch[] = [
  { id: "blue", name: "Blue", validated: true },
  { id: "orange", name: "Orange", validated: true },
  { id: "aqua", name: "Aqua", validated: true },
  { id: "yellow", name: "Yellow", validated: true },
  { id: "magenta", name: "Pink", validated: true },
  { id: "green", name: "Green", validated: true },
  { id: "violet", name: "Violet", validated: true },
  { id: "red", name: "Red", validated: true },
  { id: "teal", name: "Teal" },
  { id: "brown", name: "Brown" },
  { id: "slate", name: "Slate" },
  { id: "gray", name: "Gray" },
];

const SWATCH_IDS = new Set(SWATCHES.map((s) => s.id));

/** Starting colors. The first six follow the validated palette order, as the pie did before. */
export const DEFAULT_COLORS: Record<string, string> = {
  Housing: "blue",
  Groceries: "orange",
  Dining: "aqua",
  Transport: "yellow",
  Utilities: "magenta",
  Health: "green",
  Shopping: "violet",
  Entertainment: "red",
  Subscriptions: "teal",
  Other: "slate",
  Salary: "green",
  Freelance: "blue",
  Gifts: "magenta",
  "Other income": "slate",
};

/** Colors a new custom category can start with (gray is kept for the pie's "more" slice). */
const AUTO_SWATCHES = SWATCHES.filter((s) => s.id !== "gray" && s.id !== "slate").map((s) => s.id);

/** A custom category gets a stable starting color from its name. */
export function defaultColorFor(category: string): string {
  if (DEFAULT_COLORS[category]) return DEFAULT_COLORS[category];
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO_SWATCHES[h % AUTO_SWATCHES.length];
}

export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
export const isValidColor = (v: string) => SWATCH_IDS.has(v) || isHexColor(v);

/** CSS value for a stored color: a swatch's variable (light/dark aware) or the custom hex. */
export function cssColor(choice: string): string {
  return isHexColor(choice) ? choice : `var(--cat-${SWATCH_IDS.has(choice) ? choice : "gray"})`;
}

/** Color used for the pie's folded "N more categories" slice. */
export const OTHER_SLICE_COLOR = "var(--cat-gray)";

/* ---------- Saved choices (one settings item, stored with the rest of the data) ---------- */

export const BUDGET_SETTINGS = "budget-settings";

type BudgetSettingsData = {
  /** Colors the user picked. */
  categoryColors: Record<string, string>;
  /** Colors handed out automatically to new custom categories (not "customized"). */
  autoColors?: Record<string, string>;
};

function readSettings(data: unknown): Required<BudgetSettingsData> {
  const d = (data ?? {}) as Partial<BudgetSettingsData>;
  return { categoryColors: d.categoryColors ?? {}, autoColors: d.autoColors ?? {} };
}

/** The user's color choices, merged over the defaults. */
export function useCategoryColors() {
  const [settings] = useItems({ type: BUDGET_SETTINGS });
  const { categoryColors: chosen, autoColors: auto } = readSettings(settings?.data);
  // Compare by content: the objects are rebuilt on every store change.
  const key = JSON.stringify([chosen, auto]);

  return useMemo(() => {
    const baseFor = (category: string) =>
      auto[category] && isValidColor(auto[category]) ? auto[category] : defaultColorFor(category);
    const choiceFor = (category: string) =>
      chosen[category] && isValidColor(chosen[category]) ? chosen[category] : baseFor(category);
    return {
      /** Stored choice: swatch id or hex. */
      choiceFor,
      /** Ready-to-use CSS color. */
      colorFor: (category: string) => cssColor(choiceFor(category)),
      /** The color "Reset" goes back to. */
      baseFor,
      isCustomized: (category: string) => category in chosen,
      anyCustomized: Object.keys(chosen).length > 0,
    };
  }, [key]);
}

// Writes go one at a time so two quick changes can't create two settings items.
let queue: Promise<unknown> = Promise.resolve();

function writeSettings(store: ItemStore, update: (s: Required<BudgetSettingsData>) => Required<BudgetSettingsData>) {
  const job = queue.then(async () => {
    const [existing] = store.query({ type: BUDGET_SETTINGS });
    const current = readSettings(existing?.data);
    const next = update({ categoryColors: { ...current.categoryColors }, autoColors: { ...current.autoColors } });
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    if (existing) await store.update(existing.id, { data: { ...existing.data, ...next } });
    else await store.create<BudgetSettingsData>({ type: BUDGET_SETTINGS, title: "Budget settings", data: next });
  });
  queue = job.catch((err) => console.error("[budget] saving colors failed", err));
  return job;
}

/** Set one category's color; pass null to go back to its default. */
export function setCategoryColor(store: ItemStore, category: string, choice: string | null) {
  return writeSettings(store, (s) => {
    const base = s.autoColors[category] ?? defaultColorFor(category);
    if (choice === null || choice === base) delete s.categoryColors[category];
    else if (isValidColor(choice)) s.categoryColors[category] = choice;
    return s;
  });
}

/** Undo every color the user picked (automatic colors for custom categories stay). */
export function resetCategoryColors(store: ItemStore) {
  return writeSettings(store, (s) => ({ ...s, categoryColors: {} }));
}

/**
 * Give each custom category a starting color not already used by another category of
 * the same kind (expense or income), and remember it. Built-in categories keep theirs.
 * `groups` lists every category in use, per kind.
 */
export function assignMissingColors(store: ItemStore, groups: string[][]) {
  return writeSettings(store, (s) => {
    for (const group of groups) {
      const colorOf = (c: string) => s.categoryColors[c] ?? s.autoColors[c] ?? DEFAULT_COLORS[c];
      for (const category of group) {
        if (DEFAULT_COLORS[category] || s.autoColors[category] || s.categoryColors[category]) continue;
        const used = new Set(group.filter((c) => c !== category).map(colorOf).filter(Boolean));
        s.autoColors[category] = AUTO_SWATCHES.find((id) => !used.has(id)) ?? defaultColorFor(category);
      }
    }
    return s;
  });
}
