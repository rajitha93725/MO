import { describe, expect, it } from "vitest";
import { seedMenu } from "../src/lib/data/seed";
import { parseMenuCategories } from "../src/lib/settings";
import { settings } from "./fixtures";

describe("menu categories setting", () => {
  it("parses Name:Letter in display order", () => {
    expect(parseMenuCategories("Brunch:B, All Day Menu:a ,Beverage:D")).toEqual([
      { name: "Brunch", prefix: "B" },
      { name: "All Day Menu", prefix: "A" },
      { name: "Beverage", prefix: "D" },
    ]);
  });
  it("rejects bad or duplicate entries", () => {
    expect(() => parseMenuCategories("Brunch")).toThrow(/Name:Letter/);
    expect(() => parseMenuCategories("Brunch:BR")).toThrow(/Name:Letter/);
    expect(() => parseMenuCategories("Brunch:B,Beverage:B")).toThrow(/own letter/);
    expect(() => parseMenuCategories("Brunch:B,brunch:C")).toThrow(/unique/);
    expect(() => parseMenuCategories("")).toThrow(/at least one/);
  });
  it("defaults include receipt settings", () => {
    const s = settings();
    expect(s.menu_categories.map((c) => c.name)).toEqual(["Brunch", "All Day Menu", "Beverage"]);
    expect(s.receipt_name).toBe("MO Cafe");
    expect(s.receipt_width_mm).toBe(80);
  });
});

describe("new menu (seed)", () => {
  const menu = seedMenu();
  const count = (c: string) => menu.filter((m) => m.category === c).length;

  it("has every item from the new menu", () => {
    expect(menu).toHaveLength(71);
    expect([count("Brunch"), count("All Day Menu"), count("Beverage")]).toEqual([11, 24, 36]);
  });
  it("IDs follow the category letter and are unique", () => {
    expect(new Set(menu.map((m) => m.item_id)).size).toBe(menu.length);
    expect(menu.find((m) => m.item_name === "Mo special Crepes")!.item_id).toBe("B01");
    expect(menu.find((m) => m.item_name === "Chicken Caesar salad")!.item_id).toBe("A01");
    expect(menu.find((m) => m.item_name === "Papaya juice")!.item_id).toBe("D01");
    expect(menu.find((m) => m.item_name === "Herbal tea pot")!.item_id).toBe("D36");
  });
  it("item names are unique so receipts and reports are clear", () => {
    expect(new Set(menu.map((m) => m.item_name.toLowerCase())).size).toBe(menu.length);
  });
  it("every item sells above cost, with the prices from the menu", () => {
    for (const m of menu) expect(m.selling_price).toBeGreaterThan(m.unit_cost);
    const p = (name: string) => menu.find((m) => m.item_name === name)!;
    expect([p("Garlic Jumbo Prawns").unit_cost, p("Garlic Jumbo Prawns").selling_price]).toEqual([1450, 3850]);
    expect([p("Shakshuka").unit_cost, p("Shakshuka").selling_price]).toEqual([1180, 2950]);
    expect([p("Watermelon mojito").unit_cost, p("Watermelon mojito").selling_price]).toEqual([200, 950]);
  });
  it("food items keep their description", () => {
    expect(menu.filter((m) => m.category !== "Beverage").every((m) => m.description.length > 10)).toBe(true);
  });
});
