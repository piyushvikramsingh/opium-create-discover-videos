// "Surprise me" injection: every Nth slot, swap in a clippy from a category
// outside the user's current top interests so the feed never feels stale.

interface InjectionVideo {
  id: string;
  interest_category?: string | null;
  user_id?: string;
  [k: string]: any;
}

interface InjectOptions {
  /** Every Nth position becomes a surprise slot (default 5). */
  interval?: number;
  /** User's top interest categories, in priority order. */
  topInterests: string[];
  /** Maximum surprise slots to inject. */
  maxInjections?: number;
}

/**
 * Reorders a ranked feed by inserting "surprise" videos (outside the user's
 * top interests) at every Nth position. Mutates ordering only — no scoring.
 *
 * Surprises are tagged with `_surprise = true` so the UI can label them.
 */
export function injectSurpriseDiscovery<T extends InjectionVideo>(
  ranked: T[],
  options: InjectOptions,
): T[] {
  const interval = Math.max(3, options.interval ?? 5);
  const maxInjections = options.maxInjections ?? 6;
  const top = new Set(options.topInterests.map((c) => c.toLowerCase()));

  if (ranked.length < interval || top.size === 0) return ranked;

  // Partition into "fresh" (outside top) and "core" (inside top or unknown).
  const fresh: T[] = [];
  const core: T[] = [];
  for (const v of ranked) {
    const cat = (v.interest_category || "").toLowerCase();
    if (cat && !top.has(cat)) fresh.push(v);
    else core.push(v);
  }

  if (fresh.length === 0) return ranked;

  const result: T[] = [];
  let coreIdx = 0;
  let freshIdx = 0;
  let injected = 0;
  const seenIds = new Set<string>();

  for (let pos = 0; pos < ranked.length; pos++) {
    // Surprise slot: every interval (positions 4, 9, 14, ... if interval=5)
    const isSurpriseSlot =
      injected < maxInjections &&
      pos > 0 &&
      (pos + 1) % interval === 0 &&
      freshIdx < fresh.length;

    if (isSurpriseSlot) {
      const pick = fresh[freshIdx++];
      if (!seenIds.has(pick.id)) {
        seenIds.add(pick.id);
        result.push({ ...(pick as any), _surprise: true });
        injected++;
        continue;
      }
    }

    if (coreIdx < core.length) {
      const next = core[coreIdx++];
      if (!seenIds.has(next.id)) {
        seenIds.add(next.id);
        result.push(next);
      }
    } else if (freshIdx < fresh.length) {
      const next = fresh[freshIdx++];
      if (!seenIds.has(next.id)) {
        seenIds.add(next.id);
        result.push(next);
      }
    }
  }

  return result;
}
