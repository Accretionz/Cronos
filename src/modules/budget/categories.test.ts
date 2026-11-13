import { describe, expect, it } from "vitest";
import { makeStore } from "../../test/helpers";
import { moveItem, naturalOrder, orderCategories, pickDefault, setCategoryOrder, setDefaultCategory } from "./categories";
import { BUDGET_SETTINGS, readSettings } from "./settings";

describe("category order", () => {
  it("puts built-in categories first, then custom ones A–Z", () => {
    expect(naturalOrder("expense", ["Pets", "Dining", "Coffee", "Housing"])).toEqual(["Housing", "Dining", "Coffee", "Pets"]);
  });

  it("uses the saved order", () => {
    expect(orderCategories(["Housing", "Groceries", "Dining"], ["Dining", "Housing", "Groceries"])).toEqual(["Dining", "Housing", "Groceries"]);
  });

  it("keeps the usual order when nothing is saved", () => {
    expect(orderCategories(["Housing", "Groceries"], undefined)).toEqual(["Housing", "Groceries"]);
    expect(orderCategories(["Housing", "Groceries"], [])).toEqual(["Housing", "Groceries"]);
  });

  it("skips saved names that are gone and duplicates", () => {
    expect(orderCategories(["Housing", "Dining"], ["Pets", "Dining", "Dining", "Housing"])).toEqual(["Dining", "Housing"]);
  });

  it("slots a new category in after its usual neighbour instead of at the top", () => {
    // Usual: Housing, Groceries, Dining, Other, Coffee (custom, after the built-ins)
    const usual = ["Housing", "Groceries", "Dining", "Other", "Coffee"];
    expect(orderCategories(usual, ["Dining", "Other", "Housing", "Groceries"])).toEqual(["Dining", "Other", "Coffee", "Housing", "Groceries"]);
    // A new built-in-position category with nothing before it goes first.
    expect(orderCategories(["Housing", "Dining"], ["Dining"])).toEqual(["Housing", "Dining"]);
  });

  it("moves an item", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b"], 1, 9)).toEqual(["a", "b"]);
  });
});

describe("default category", () => {
  it("uses the saved default while it's offered", () => {
    expect(pickDefault("expense", ["Housing", "Groceries", "Dining"], "Dining")).toBe("Dining");
  });

  it("falls back to Groceries / Salary, then the first option", () => {
    expect(pickDefault("expense", ["Housing", "Groceries"], "Gone")).toBe("Groceries");
    expect(pickDefault("expense", ["Housing", "Groceries"], undefined)).toBe("Groceries");
    expect(pickDefault("income", ["Salary", "Gifts"], undefined)).toBe("Salary");
    expect(pickDefault("expense", ["Pets"], undefined)).toBe("Pets");
  });
});

describe("saving", () => {
  it("stores order and default in the budget settings item, next to colors", async () => {
    const { store } = await makeStore();
    await store.create({ type: BUDGET_SETTINGS, title: "Budget settings", data: { categoryColors: { Dining: "red" }, autoColors: {} } });
    await setDefaultCategory(store, "expense", "Dining");
    await setCategoryOrder(store, "expense", ["Dining", "Housing"]);
    const items = store.query({ type: BUDGET_SETTINGS });
    expect(items).toHaveLength(1);
    const s = readSettings(items[0].data);
    expect(s.defaultCategory).toEqual({ expense: "Dining" });
    expect(s.categoryOrder).toEqual({ expense: ["Dining", "Housing"] });
    expect(s.categoryColors).toEqual({ Dining: "red" });

    await setDefaultCategory(store, "expense", "Groceries"); // the built-in default isn't stored
    await setCategoryOrder(store, "expense", null);
    const after = readSettings(store.query({ type: BUDGET_SETTINGS })[0].data);
    expect(after.defaultCategory).toEqual({});
    expect(after.categoryOrder).toEqual({});
    expect(after.categoryColors).toEqual({ Dining: "red" });
  });

  it("reads older settings items that only have colors", () => {
    expect(readSettings({ categoryColors: { A: "blue" } })).toEqual({ categoryColors: { A: "blue" }, autoColors: {}, categoryOrder: {}, defaultCategory: {} });
    expect(readSettings({ categoryOrder: { expense: ["A", 3] }, defaultCategory: { income: 5 } }).categoryOrder).toEqual({ expense: ["A"] });
  });
});
