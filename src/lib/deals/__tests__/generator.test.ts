import { describe, expect, it } from "vitest";
import { generateDeals } from "../generator";

describe("generateDeals", () => {
  it("generates the requested number of unique, valid records", () => {
    const deals = generateDeals(1000);
    expect(deals).toHaveLength(1000);

    const ids = new Set(deals.map((d) => d.id));
    expect(ids.size).toBe(1000);

    for (const deal of deals) {
      expect(deal.value).toBeGreaterThan(0);
      expect(deal.version).toBe(1);
      expect(deal.name.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given seed and reference time", () => {
    const now = Date.parse("2026-11-01T00:00:00.000Z");
    const a = generateDeals(200, 7, now);
    const b = generateDeals(200, 7, now);
    expect(a).toEqual(b);
  });

  it("produces different data for different seeds", () => {
    const now = Date.parse("2026-11-01T00:00:00.000Z");
    const a = generateDeals(50, 1, now);
    const b = generateDeals(50, 2, now);
    expect(a).not.toEqual(b);
  });
});
