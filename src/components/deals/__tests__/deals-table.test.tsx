import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { generateDeals } from "@/lib/deals/generator";
import { useDealsStore } from "@/store/deals-store";
import { DealsTable } from "../deals-table";

/**
 * jsdom does no real layout, so @tanstack/react-virtual's scroll-container measurement
 * (it reads `element.clientHeight`/`clientWidth` directly, synchronously, on setup — see
 * `getRect`/`observeElementRect` in @tanstack/virtual-core) needs a stand-in: jsdom reports
 * 0 for both on every element, which would make the virtualizer compute an empty visible
 * range. Stubbing them to a fixed viewport size lets it compute a real range instead.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 1000 });
});

beforeEach(() => {
  // StageSelect/PrioritySelect commits trigger a real PATCH via updateDeal; stub fetch to
  // echo back the patched record (like the real /api/deals/[id] route does) instead of
  // hitting the network, so the optimistic update isn't overwritten with a bogus response.
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const id = String(url).split("/").pop();
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const current = useDealsStore.getState().deals[id!];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ ...current, ...body.changes, id, version: (body.version ?? 1) + 1 }),
      });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function seedLargeDataset(count: number) {
  const deals = generateDeals(count, 1, Date.parse("2026-11-01T00:00:00.000Z"));
  const dealsById: Record<string, (typeof deals)[number]> = {};
  const order: string[] = [];
  for (const deal of deals) {
    dealsById[deal.id] = deal;
    order.push(deal.id);
  }
  useDealsStore.setState({
    deals: dealsById,
    order,
    total: deals.length,
    owners: [],
    pending: {},
    selected: new Set(),
  });
}

describe("DealsTable virtualization", () => {
  it("only mounts DOM rows for what's in (and just around) the viewport, not the whole dataset", () => {
    seedLargeDataset(5000);
    render(<DealsTable onOpenDetail={() => {}} />);

    const renderedRows = screen.getAllByRole("row");

    // a ~600px viewport at a 44px row height is on the order of a dozen visible rows;
    // with overscan this should land well under 100 — nowhere near the 5000 seeded.
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(100);
  });

  it("keeps the rendered row count independent of how large the dataset is", () => {
    seedLargeDataset(50_000);
    render(<DealsTable onOpenDetail={() => {}} />);

    const renderedRows = screen.getAllByRole("row");
    expect(renderedRows.length).toBeLessThan(100);
  });
});

describe("DealsTable row dropdowns", () => {
  it("the stage dropdown on a rendered row actually opens and commits a pick", async () => {
    const user = userEvent.setup();
    seedLargeDataset(500);
    const firstId = useDealsStore.getState().order[0];
    useDealsStore.setState((s) => ({
      deals: { ...s.deals, [firstId]: { ...s.deals[firstId], stage: "new_lead" } },
    }));

    render(<DealsTable onOpenDetail={() => {}} />);

    const firstRow = screen.getAllByRole("row")[0];
    expect(within(firstRow).getByRole("button", { name: "Change stage" })).toHaveTextContent("New Lead");

    await user.click(within(firstRow).getByRole("button", { name: "Change stage" }));
    const listbox = screen.getByRole("listbox", { name: "Change stage" });
    expect(listbox).toBeInTheDocument();

    await user.click(within(listbox).getByRole("option", { name: "Won" }));

    // The commit re-renders the row (a new trigger node, not a mutation of the old one), so
    // re-query rather than hold a stale pre-click reference.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    const updatedRow = screen.getAllByRole("row")[0];
    expect(within(updatedRow).getByRole("button", { name: "Change stage" })).toHaveTextContent("Won");
    expect(useDealsStore.getState().deals[firstId].stage).toBe("won");
  });

  it("the priority dropdown on a rendered row actually opens and commits a pick", async () => {
    const user = userEvent.setup();
    seedLargeDataset(500);
    const firstId = useDealsStore.getState().order[0];

    render(<DealsTable onOpenDetail={() => {}} />);

    const firstRow = screen.getAllByRole("row")[0];
    await user.click(within(firstRow).getByRole("button", { name: "Change priority" }));
    const listbox = screen.getByRole("listbox", { name: "Change priority" });

    await user.click(within(listbox).getByRole("option", { name: "High" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    const updatedRow = screen.getAllByRole("row")[0];
    expect(within(updatedRow).getByRole("button", { name: "Change priority" })).toHaveTextContent("High");
    expect(useDealsStore.getState().deals[firstId].priority).toBe("high");
  });
});
