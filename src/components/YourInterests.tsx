import { useEffect, useState } from "react";
import { Sparkles, RotateCcw, ArrowDown, X } from "lucide-react";
import { supabase as _supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { INTEREST_LABELS, type InterestCategory } from "@/lib/interests";
import { toast } from "sonner";

const supabase: any = _supabase;

interface YourInterestsProps {
  userId: string;
}

export function YourInterests({ userId }: YourInterestsProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows, refetch, isLoading } = useQuery({
    queryKey: ["user-interest-affinity", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_interest_affinity")
        .select("interest_category, score, updated_at")
        .eq("user_id", userId)
        .order("score", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data || []) as Array<{
        interest_category: string;
        score: number;
        updated_at: string;
      }>;
    },
  });

  const top = (rows || []).slice(0, 5);
  const maxScore = Math.max(1, ...(top.map((r) => Number(r.score) || 0)));

  const invalidateFeed = () => {
    queryClient.invalidateQueries({ queryKey: ["for-you-videos"] });
  };

  const handleDownrank = async (cat: string) => {
    setBusy(cat);
    try {
      // Persist a sticky suppression — even if the user keeps engaging with this
      // category, future affinity gains are scaled down so the down-rank survives sessions.
      const current = top.find((r) => r.interest_category === cat);
      const next = Math.max(0, Number(current?.score || 0) * 0.4);
      await supabase
        .from("user_interest_affinity")
        .update({
          score: next,
          is_suppressed: true,
          suppressed_at: new Date().toISOString(),
          suppression_multiplier: 0.25,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("interest_category", cat);
      toast.success(`Showing less ${INTEREST_LABELS[cat as InterestCategory] || cat}`);
      await refetch();
      invalidateFeed();
    } catch (e: any) {
      toast.error(e?.message || "Could not update");
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async (cat: string) => {
    setBusy(cat);
    try {
      await supabase
        .from("user_interest_affinity")
        .delete()
        .eq("user_id", userId)
        .eq("interest_category", cat);
      toast.success(`Reset ${INTEREST_LABELS[cat as InterestCategory] || cat}`);
      await refetch();
      invalidateFeed();
    } catch (e: any) {
      toast.error(e?.message || "Could not reset");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return null;

  return (
    <div className="ig-list-item-enter ig-modern-card mt-5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Your interests</p>
        </div>
        <span className="text-[10px] text-muted-foreground">Auto-learned from Clippy</span>
      </div>

      {top.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Watch, like and share clippies to teach Clippy what you love. Your top topics will appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {top.map((row) => {
            const label = INTEREST_LABELS[row.interest_category as InterestCategory] || row.interest_category;
            const pct = Math.min(100, Math.round((Number(row.score) / maxScore) * 100));
            const isBusy = busy === row.interest_category;
            return (
              <li
                key={row.interest_category}
                className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{label}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {Number(row.score).toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDownrank(row.interest_category)}
                    title="Show less of this"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background hover:bg-muted disabled:opacity-50"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleReset(row.interest_category)}
                    title="Reset this category"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background hover:bg-muted disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {top.length > 0 && (
        <button
          type="button"
          onClick={async () => {
            try {
              await supabase
                .from("user_interest_affinity")
                .delete()
                .eq("user_id", userId);
              toast.success("All interests reset — Clippy will relearn from your next swipes");
              await refetch();
              invalidateFeed();
            } catch (e: any) {
              toast.error(e?.message || "Could not reset");
            }
          }}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Reset all
        </button>
      )}
    </div>
  );
}
