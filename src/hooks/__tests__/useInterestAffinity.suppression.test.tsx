/**
 * End-to-end-style test for the persistent down-rank flow:
 *
 *   1. User watches a clippy in category "comedy" — affinity climbs.
 *   2. User opens Profile → Your interests and down-ranks "comedy"
 *      (we simulate that by setting `is_suppressed=true`,
 *       `suppression_multiplier=0.25`, and lowering the score in our
 *       fake DB row).
 *   3. We tear the hook down (simulating the user closing the app)
 *      and remount it (a new session). The hook MUST read the
 *      suppression multiplier from the DB on every write and scale
 *      positive engagement gains, so the category stays suppressed
 *      across sessions even when the user keeps engaging with it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ----- Fake auth ---------------------------------------------------------
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

// ----- In-memory DB + chainable supabase mock ----------------------------
type Row = {
  user_id: string;
  interest_category: string;
  score: number;
  is_suppressed?: boolean;
  suppression_multiplier?: number;
};

const db: { rows: Row[] } = { rows: [] };

function makeChain(table: string) {
  let op: "select" | "update" | "insert" | null = null;
  const filters: Record<string, unknown> = {};
  let updatePayload: Partial<Row> | null = null;
  let insertPayload: Row | null = null;

  const chain: any = {
    select: () => {
      op = "select";
      return chain;
    },
    update: (payload: Partial<Row>) => {
      op = "update";
      updatePayload = payload;
      return chain;
    },
    insert: (payload: Row) => {
      op = "insert";
      insertPayload = payload;
      // insert resolves immediately
      db.rows.push({ ...payload });
      return Promise.resolve({ data: payload, error: null });
    },
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      // update is finalized when the last .eq resolves via a thenable
      if (op === "update") {
        return {
          ...chain,
          then: (resolve: (v: { data: null; error: null }) => void) => {
            const target = db.rows.find((r) =>
              Object.entries(filters).every(([k, v]) => (r as any)[k] === v),
            );
            if (target && updatePayload) Object.assign(target, updatePayload);
            resolve({ data: null, error: null });
          },
        };
      }
      return chain;
    },
    maybeSingle: () => {
      const row = db.rows.find((r) =>
        Object.entries(filters).every(([k, v]) => (r as any)[k] === v),
      );
      return Promise.resolve({ data: row ?? null, error: null });
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeChain(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

// Import AFTER mocks
import { useTrackInterestAffinity } from "@/hooks/useInterestAffinity";

beforeEach(() => {
  db.rows = [];
});

describe("interest down-rank persistence across sessions", () => {
  it("keeps a down-ranked category suppressed in a fresh session", async () => {
    // ---- SESSION 1: user engages with "comedy" --------------------------
    const session1 = renderHook(() => useTrackInterestAffinity());
    await act(async () => {
      await session1.result.current("comedy", "like"); // +5
      await session1.result.current("comedy", "view_complete"); // +4
    });

    const row1 = db.rows.find((r) => r.interest_category === "comedy");
    expect(row1).toBeDefined();
    expect(row1!.score).toBeCloseTo(9, 5);

    // ---- USER DOWN-RANKS in Profile (mirrors YourInterests.handleDownrank)
    row1!.score = row1!.score * 0.4;
    row1!.is_suppressed = true;
    row1!.suppression_multiplier = 0.25;
    const scoreAfterDownrank = row1!.score; // 3.6

    // ---- SESSION 2: tear down, remount (simulated new session) ----------
    session1.unmount();
    const session2 = renderHook(() => useTrackInterestAffinity());

    // User engages with comedy AGAIN in the new session.
    await act(async () => {
      await session2.result.current("comedy", "like"); // would be +5
      await session2.result.current("comedy", "view_complete"); // would be +4
    });

    const row2 = db.rows.find((r) => r.interest_category === "comedy")!;
    // Positive gains MUST be scaled by suppression_multiplier (0.25),
    // so total gain across two events = 9 * 0.25 = 2.25
    const expectedScore = scoreAfterDownrank + 9 * 0.25;
    expect(row2.score).toBeCloseTo(expectedScore, 5);

    // And the suppression flag survives.
    expect(row2.is_suppressed).toBe(true);
    expect(row2.suppression_multiplier).toBe(0.25);

    // Sanity: without suppression the score would have been much higher.
    expect(row2.score).toBeLessThan(scoreAfterDownrank + 9);
  });

  it("does NOT scale negative signals (hide/report bypass suppression)", async () => {
    db.rows.push({
      user_id: "user-1",
      interest_category: "tech",
      score: 20,
      is_suppressed: true,
      suppression_multiplier: 0.25,
    });

    const { result } = renderHook(() => useTrackInterestAffinity());
    await act(async () => {
      await result.current("tech", "hide"); // -10 at full strength
    });

    const row = db.rows.find((r) => r.interest_category === "tech")!;
    expect(row.score).toBeCloseTo(10, 5);
  });
});
