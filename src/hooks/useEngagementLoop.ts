import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase as _supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  coerceEngagementLoopState,
  type EngagementActionContext,
  type EngagementActionType,
  getEngagementSummary,
  loadEngagementLoopState,
  saveEngagementLoopState,
  recordEngagementAction,
} from "@/lib/engagementLoop";

const supabase: any = _supabase;

const isSchemaMismatchError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
};

export const useEngagementLoop = () => {
  const { user } = useAuth();
  const [state, setState] = useState(loadEngagementLoopState);
  const [syncStatus, setSyncStatus] = useState<"local" | "syncing" | "synced" | "error">("local");
  const hasHydratedFromServerRef = useRef(false);
  const hydrationInFlightRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSavedAtRef = useRef(0);

  const refresh = useCallback(() => {
    setState(loadEngagementLoopState());
  }, []);

  const recordAction = useCallback((actionType: EngagementActionType, context?: EngagementActionContext) => {
    const result = recordEngagementAction(actionType, { context });
    setState(result.state);
    return result;
  }, []);

  useEffect(() => {
    const onFocus = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes("opium.engagement.loop")) {
        refresh();
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    hasHydratedFromServerRef.current = false;
    if (!user) {
      setSyncStatus("local");
      return;
    }
    if (hydrationInFlightRef.current) return;

    hydrationInFlightRef.current = true;
    setSyncStatus("syncing");

    const hydrate = async () => {
      const localState = loadEngagementLoopState();

      const { data, error } = await supabase
        .from("user_engagement_profiles")
        .select("engagement_state, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        hydrationInFlightRef.current = false;
        if (!isSchemaMismatchError(error)) {
          setSyncStatus("error");
          console.warn("Failed to hydrate engagement profile", error.message || error);
        } else {
          setSyncStatus("local");
        }
        hasHydratedFromServerRef.current = true;
        return;
      }

      if (!data?.engagement_state) {
        setSyncStatus("synced");
        hasHydratedFromServerRef.current = true;
        hydrationInFlightRef.current = false;
        return;
      }

      const remoteState = coerceEngagementLoopState(data.engagement_state);
      const remoteUpdatedAt = data.updated_at ? new Date(data.updated_at).getTime() : remoteState.lastUpdatedAt;

      if (remoteUpdatedAt > localState.lastUpdatedAt) {
        saveEngagementLoopState({ ...remoteState, lastUpdatedAt: remoteUpdatedAt });
        setState({ ...remoteState, lastUpdatedAt: remoteUpdatedAt });
      }

      hasHydratedFromServerRef.current = true;
      hydrationInFlightRef.current = false;
      setSyncStatus("synced");
    };

    void hydrate();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!hasHydratedFromServerRef.current) return;
    if (state.lastUpdatedAt <= lastSavedAtRef.current) return;

    setSyncStatus("syncing");

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void supabase
        .from("user_engagement_profiles")
        .upsert(
          {
            user_id: user.id,
            engagement_state: state,
            updated_at: new Date(state.lastUpdatedAt).toISOString(),
          },
          { onConflict: "user_id" },
        )
        .then(({ error }: { error: any }) => {
          if (error) {
            if (!isSchemaMismatchError(error)) {
              setSyncStatus("error");
              console.warn("Failed to persist engagement profile", error.message || error);
            } else {
              setSyncStatus("local");
            }
            return;
          }
          lastSavedAtRef.current = state.lastUpdatedAt;
          setSyncStatus("synced");
        });
    }, 700);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [state, user]);

  const summary = useMemo(() => {
    const full = getEngagementSummary();
    return {
      missions: full.missions,
      badges: full.badges,
      nextBadge: full.nextBadge,
    };
  }, [state]);

  return {
    state,
    syncStatus,
    recordAction,
    refresh,
    ...summary,
  };
};
