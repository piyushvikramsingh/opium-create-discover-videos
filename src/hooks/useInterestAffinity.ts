import { useCallback } from "react";
import { supabase as _supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { InterestCategory } from "@/lib/interests";

const supabase: any = _supabase;

const EVENT_WEIGHT: Record<string, number> = {
  view_start: 0.3,
  view_3s: 1.2,
  view_complete: 4,
  like: 5,
  share: 8,
  follow: 6,
  hide: -10,
  report: -15,
};

/**
 * Auto-learn interest affinity for the current user.
 * Call this when a clippy interaction happens (view_complete, like, share, etc.).
 * Uses an upsert to additively accumulate score per category.
 */
export function useTrackInterestAffinity() {
  const { user } = useAuth();

  return useCallback(
    async (interestCategory: InterestCategory | string | null | undefined, eventType: string) => {
      if (!user || !interestCategory) return;
      const weight = EVENT_WEIGHT[eventType] ?? 0;
      if (weight === 0) return;

      try {
        // Read current score (so we add to it; no DB function needed)
        const { data: existing } = await supabase
          .from("user_interest_affinity")
          .select("score")
          .eq("user_id", user.id)
          .eq("interest_category", interestCategory)
          .maybeSingle();

        const nextScore = Number(existing?.score || 0) + weight;

        if (existing) {
          await supabase
            .from("user_interest_affinity")
            .update({ score: nextScore, updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("interest_category", interestCategory);
        } else {
          await supabase
            .from("user_interest_affinity")
            .insert({
              user_id: user.id,
              interest_category: interestCategory,
              score: nextScore,
            });
        }
      } catch (err) {
        // Silent fail — affinity tracking should never break playback.
        console.warn("affinity tracking failed", err);
      }
    },
    [user],
  );
}

/**
 * Fetch a user's top interest categories (for client-side ranking).
 */
export async function fetchTopInterests(userId: string, limit = 5) {
  try {
    const { data, error } = await supabase.rpc("get_user_top_interests", {
      _user_id: userId,
      _limit: limit,
    });
    if (error) throw error;
    return (data || []) as Array<{ interest_category: string; score: number }>;
  } catch {
    return [];
  }
}
