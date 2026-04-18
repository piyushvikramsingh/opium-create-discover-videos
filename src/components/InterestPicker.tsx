import { useEffect, useRef, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { supabase as _supabase } from "@/integrations/supabase/client";
import {
  INTEREST_CATEGORIES,
  INTEREST_LABELS,
  suggestInterestsLocally,
  type InterestCategory,
} from "@/lib/interests";
import { Button } from "@/components/ui/button";

const supabase: any = _supabase;

interface InterestPickerProps {
  text: string; // caption + hashtags concatenated
  value: InterestCategory | null;
  onChange: (value: InterestCategory | null) => void;
}

/**
 * AI auto-suggest + manual interest picker for clippy uploads.
 * - Shows AI-suggested top picks at the top (debounced on caption changes).
 * - Falls back to local keyword heuristic instantly.
 * - User can override with any preset category.
 */
export function InterestPicker({ text, value, onChange }: InterestPickerProps) {
  const [aiSuggestions, setAiSuggestions] = useState<InterestCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const userTouchedRef = useRef(false);

  const localSuggestions = suggestInterestsLocally(text);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!text || text.trim().length < 8) {
      setAiSuggestions([]);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("suggest-interest", {
          body: { text },
        });
        if (!error && Array.isArray(data?.suggestions)) {
          const filtered = data.suggestions.filter((s: string) =>
            (INTEREST_CATEGORIES as readonly string[]).includes(s),
          ) as InterestCategory[];
          setAiSuggestions(filtered);

          // Auto-select top suggestion if user hasn't picked anything yet
          if (!userTouchedRef.current && !value && filtered[0]) {
            onChange(filtered[0]);
          }
        }
      } catch {
        // ignore — local fallback still shown
      } finally {
        setLoading(false);
      }
    }, 700);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const merged = Array.from(new Set([...aiSuggestions, ...localSuggestions])) as InterestCategory[];
  const handlePick = (cat: InterestCategory) => {
    userTouchedRef.current = true;
    onChange(cat === value ? null : cat);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium">Interest category</label>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          {loading ? "AI suggesting…" : "AI suggested"}
        </span>
      </div>

      {merged.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {merged.slice(0, 4).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handlePick(cat)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                value === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {value === cat && <Check className="h-3 w-3" />}
              {INTEREST_LABELS[cat]}
              {aiSuggestions.includes(cat) && (
                <Sparkles className="h-2.5 w-2.5 opacity-60" />
              )}
            </button>
          ))}
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
          Browse all categories
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {INTEREST_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handlePick(cat)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                value === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {INTEREST_LABELS[cat]}
            </button>
          ))}
        </div>
      </details>

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => {
            userTouchedRef.current = true;
            onChange(null);
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
