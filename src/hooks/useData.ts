import { supabase as _supabase, isSupabaseEgressRestricted } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { getEngagementPersonalizationBoost, loadEngagementLoopState } from "@/lib/engagementLoop";
import { diversifyFeedRanking } from "@/lib/feedDiversity";

const lowBandwidthEnv = String(import.meta.env.VITE_LOW_BANDWIDTH_MODE || "").toLowerCase();
const LOW_BANDWIDTH_MODE = lowBandwidthEnv === "true";

const getVisibilityAwareRefetchInterval = (visibleMs: number, hiddenMs: number) => {
  if (isSupabaseEgressRestricted()) return false;
  if (typeof document === "undefined") return visibleMs;
  return document.visibilityState === "visible" ? visibleMs : hiddenMs;
};

const isSchemaMismatchError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
};

const extractMentionUsernames = (text: string) => {
  const matches = text.match(/@[\w.]+/g) || [];
  return Array.from(new Set(matches.map((value) => value.replace("@", "").toLowerCase())));
};

const ensureMentionTargetsAllowMentions = async (mentionUsernames: string[]) => {
  if (mentionUsernames.length === 0) return;

  const { data: mentionProfiles, error: mentionProfilesError } = await supabase
    .from("profiles")
    .select("username, allow_mentions")
    .in("username", mentionUsernames);
  if (mentionProfilesError && !isSchemaMismatchError(mentionProfilesError)) throw mentionProfilesError;

  const disallowed = (mentionProfiles || [])
    .filter((profile: any) => profile.allow_mentions === false)
    .map((profile: any) => `@${profile.username}`);

  if (disallowed.length > 0) {
    throw new Error(`Mentions are restricted for: ${disallowed.join(", ")}`);
  }
};

export interface VideoComment {
  id: string;
  user_id: string;
  video_id: string;
  content: string;
  created_at: string;
  profile: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

type VideoEventType =
  | "view_start"
  | "view_3s"
  | "view_complete"
  | "like"
  | "share"
  | "follow"
  | "hide"
  | "report";

const loadSafetyFilters = async (userId: string) => {
  const [hidden, blocks, mutes] = await Promise.all([
    supabase.from("hidden_videos").select("video_id").eq("user_id", userId),
    supabase.from("user_blocks").select("blocked_user_id").eq("user_id", userId),
    supabase.from("user_mutes").select("muted_user_id").eq("user_id", userId),
  ]);

  if (hidden.error && !isSchemaMismatchError(hidden.error)) throw hidden.error;
  if (blocks.error && !isSchemaMismatchError(blocks.error)) throw blocks.error;
  if (mutes.error && !isSchemaMismatchError(mutes.error)) throw mutes.error;

  return {
    hiddenVideoIds: new Set((hidden.data || []).map((row: any) => row.video_id)),
    blockedUserIds: new Set((blocks.data || []).map((row: any) => row.blocked_user_id)),
    mutedUserIds: new Set((mutes.data || []).map((row: any) => row.muted_user_id)),
  };
};

const withPlayableVideoUrl = (video: any) => {
  const directUrl = String(video?.video_url || "").trim();
  const playbackId = String(video?.stream_playback_id || "").trim();

  if (LOW_BANDWIDTH_MODE && playbackId) {
    return {
      ...video,
      video_url: `https://stream.mux.com/${playbackId}.m3u8`,
    };
  }

  if (directUrl) {
    return {
      ...video,
      video_url: directUrl,
    };
  }

  if (playbackId) {
    return {
      ...video,
      video_url: `https://stream.mux.com/${playbackId}.m3u8`,
    };
  }

  return {
    ...video,
    video_url: "",
  };
};

function updateVideosCommentsCount(
  queryClient: ReturnType<typeof useQueryClient>,
  videoId: string,
  delta: number,
) {
  queryClient.setQueryData<any[]>(["videos"], (currentVideos) => {
    if (!currentVideos) return currentVideos;

    return currentVideos.map((video) => {
      if (video.id !== videoId) return video;
      return {
        ...video,
        comments_count: Math.max(0, (video.comments_count ?? 0) + delta),
      };
    });
  });
}

type ReliableMutationType = "like" | "bookmark" | "comment" | "share";

type ReliableLikePayload = {
  videoId: string;
  shouldLike: boolean;
};

type ReliableBookmarkPayload = {
  videoId: string;
  shouldBookmark: boolean;
};

type ReliableCommentPayload = {
  videoId: string;
  content: string;
  clientRequestId: string;
};

type ReliableSharePayload = {
  videoId: string;
};

type ReliableMutationPayload = ReliableLikePayload | ReliableBookmarkPayload | ReliableCommentPayload | ReliableSharePayload;

type ReliableMutationResult = {
  queued?: boolean;
  clientRequestId?: string;
};

type ReliableMutationAction = {
  id: string;
  userId: string;
  type: ReliableMutationType;
  dedupeKey: string;
  payload: ReliableMutationPayload;
  createdAt: number;
  attemptCount: number;
  nextAttemptAt: number;
  lastErrorMessage?: string;
};

const RELIABLE_QUEUE_STORAGE_KEY = "opium.reliable-mutation-queue.v1";
const RELIABLE_QUEUE_MAX_SIZE = 150;
const RELIABLE_RETRY_BACKOFF_MS = [1500, 4500, 12000, 30000, 60000, 120000, 300000];

const getBrowserWindow = () => {
  if (typeof window === "undefined") return null;
  return window;
};

const makeReliableActionId = () => {
  const browserWindow = getBrowserWindow();
  const random = browserWindow?.crypto?.randomUUID?.();
  if (random) return random;
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getRetryDelayMs = (attemptCount: number) =>
  RELIABLE_RETRY_BACKOFF_MS[Math.min(Math.max(0, attemptCount), RELIABLE_RETRY_BACKOFF_MS.length - 1)];

const readReliableQueue = (): ReliableMutationAction[] => {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return [];

  try {
    const raw = browserWindow.localStorage.getItem(RELIABLE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => !!entry && typeof entry === "object");
  } catch {
    return [];
  }
};

const writeReliableQueue = (actions: ReliableMutationAction[]) => {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return;

  try {
    const bounded = actions
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-RELIABLE_QUEUE_MAX_SIZE);
    browserWindow.localStorage.setItem(RELIABLE_QUEUE_STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // ignore storage errors to keep app functional in private mode / strict browsers
  }
};

const upsertReliableQueueAction = (action: ReliableMutationAction) => {
  const existing = readReliableQueue();
  const filtered = existing.filter((entry) => {
    if (entry.userId !== action.userId) return true;
    if (entry.dedupeKey !== action.dedupeKey) return true;
    // Always keep latest intent per user+resource for like/bookmark.
    return action.type === "comment";
  });
  filtered.push(action);
  writeReliableQueue(filtered);
};

const isRetryableMutationError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status || 0);

  if (status >= 500) return true;
  if (status === 0) return true;
  if (message.includes("failed to fetch") || message.includes("network")) return true;
  if (message.includes("timeout") || message.includes("timed out")) return true;
  if (code.startsWith("08")) return true;
  if (["57014", "53300"].includes(code)) return true;

  if (code === "22023") return false; // validation/safety rule failure
  if (status === 401 || status === 403) return false;
  if (message.includes("not authenticated")) return false;
  if (message.includes("blocked term")) return false;

  return false;
};

const setVideoLikeState = async (userId: string, videoId: string, shouldLike: boolean) => {
  const rpc = await supabase.rpc("set_video_like", {
    p_video_id: videoId,
    p_should_like: shouldLike,
  });

  if (!rpc.error) return;
  if (!isSchemaMismatchError(rpc.error)) throw rpc.error;

  if (shouldLike) {
    const { error } = await supabase.from("likes").insert({ user_id: userId, video_id: videoId });
    if (error) {
      const code = String(error.code || "");
      const message = String(error.message || "").toLowerCase();
      const duplicate = code === "23505" || message.includes("duplicate key");
      if (!duplicate) throw error;
    }
    return;
  }

  const { error } = await supabase
    .from("likes")
    .delete()
    .eq("user_id", userId)
    .eq("video_id", videoId);
  if (error) throw error;
};

const setVideoBookmarkState = async (userId: string, videoId: string, shouldBookmark: boolean) => {
  const rpc = await supabase.rpc("set_video_bookmark", {
    p_video_id: videoId,
    p_should_bookmark: shouldBookmark,
  });

  if (!rpc.error) return;
  if (!isSchemaMismatchError(rpc.error)) throw rpc.error;

  if (shouldBookmark) {
    const { error } = await supabase.from("bookmarks").insert({ user_id: userId, video_id: videoId });
    if (error) {
      const code = String(error.code || "");
      const message = String(error.message || "").toLowerCase();
      const duplicate = code === "23505" || message.includes("duplicate key");
      if (!duplicate) throw error;
    }
    return;
  }

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", userId)
    .eq("video_id", videoId);
  if (error) throw error;
};

const createCommentIdempotent = async (
  userId: string,
  videoId: string,
  content: string,
  clientRequestId: string,
) => {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");

  const rpc = await supabase.rpc("create_comment_idempotent", {
    p_video_id: videoId,
    p_content: trimmed,
    p_client_request_id: clientRequestId,
  });
  if (!rpc.error) return;
  if (!isSchemaMismatchError(rpc.error)) throw rpc.error;

  const insertWithRequestId = await supabase.from("comments").insert({
    user_id: userId,
    video_id: videoId,
    content: trimmed,
    client_request_id: clientRequestId,
  });

  if (!insertWithRequestId.error) return;
  if (!isSchemaMismatchError(insertWithRequestId.error)) {
    const code = String(insertWithRequestId.error.code || "");
    const message = String(insertWithRequestId.error.message || "").toLowerCase();
    const duplicate = code === "23505" || message.includes("duplicate key");
    if (!duplicate) throw insertWithRequestId.error;
    return;
  }

  const fallbackInsert = await supabase.from("comments").insert({
    user_id: userId,
    video_id: videoId,
    content: trimmed,
  });
  if (fallbackInsert.error) throw fallbackInsert.error;
};

const incrementVideoShareState = async (userId: string, videoId: string) => {
  const rpc = await supabase.rpc("increment_video_share", {
    p_video_id: videoId,
  });

  if (!rpc.error) return;
  if (!isSchemaMismatchError(rpc.error)) throw rpc.error;

  const { data: current, error: readError } = await supabase
    .from("videos")
    .select("shares_count")
    .eq("id", videoId)
    .maybeSingle();
  if (readError) throw readError;

  const next = (current?.shares_count || 0) + 1;
  const { error } = await supabase
    .from("videos")
    .update({ shares_count: next })
    .eq("id", videoId)
    .eq("user_id", userId);
  if (error) throw error;
};

const runReliableAction = async (action: ReliableMutationAction) => {
  if (action.type === "like") {
    const payload = action.payload as ReliableLikePayload;
    await setVideoLikeState(action.userId, payload.videoId, payload.shouldLike);
    return;
  }

  if (action.type === "bookmark") {
    const payload = action.payload as ReliableBookmarkPayload;
    await setVideoBookmarkState(action.userId, payload.videoId, payload.shouldBookmark);
    return;
  }

  if (action.type === "share") {
    const payload = action.payload as ReliableSharePayload;
    await incrementVideoShareState(action.userId, payload.videoId);
    return;
  }

  const payload = action.payload as ReliableCommentPayload;
  await createCommentIdempotent(action.userId, payload.videoId, payload.content, payload.clientRequestId);
};

const flushReliableActionQueue = async (userId: string, maxActions = 8) => {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return { processed: 0, remaining: 0 };
  if (browserWindow.navigator && browserWindow.navigator.onLine === false) {
    return { processed: 0, remaining: readReliableQueue().filter((entry) => entry.userId === userId).length };
  }

  const sourceQueue = readReliableQueue();
  if (sourceQueue.length === 0) return { processed: 0, remaining: 0 };

  const now = Date.now();
  let processed = 0;
  const nextQueue: ReliableMutationAction[] = [];

  for (const action of sourceQueue) {
    if (action.userId !== userId) {
      nextQueue.push(action);
      continue;
    }

    if (processed >= maxActions) {
      nextQueue.push(action);
      continue;
    }

    if (action.nextAttemptAt > now) {
      nextQueue.push(action);
      continue;
    }

    try {
      await runReliableAction(action);
      processed += 1;
    } catch (error) {
      const attempts = (action.attemptCount || 0) + 1;
      if (!isRetryableMutationError(error) || attempts > 8) {
        continue;
      }

      nextQueue.push({
        ...action,
        attemptCount: attempts,
        nextAttemptAt: Date.now() + getRetryDelayMs(attempts),
        lastErrorMessage: String(error instanceof Error ? error.message : "mutation failed"),
      });
    }
  }

  writeReliableQueue(nextQueue);
  return {
    processed,
    remaining: nextQueue.filter((entry) => entry.userId === userId).length,
  };
};

const invalidateReliableQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ["user-likes"] });
  queryClient.invalidateQueries({ queryKey: ["user-bookmarks"] });
  queryClient.invalidateQueries({ queryKey: ["videos"] });
  queryClient.invalidateQueries({ queryKey: ["for-you-videos"] });
  queryClient.invalidateQueries({ queryKey: ["video-comments"] });
};

export function useReliableMutationPipelineWorker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    let disposed = false;
    const drain = async () => {
      const result = await flushReliableActionQueue(user.id, 10);
      if (!disposed && result.processed > 0) {
        invalidateReliableQueries(queryClient);
      }
    };

    void drain();

    const intervalId = window.setInterval(() => {
      void drain();
    }, 8000);
    const onOnline = () => {
      void drain();
    };

    window.addEventListener("online", onOnline);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", onOnline);
    };
  }, [queryClient, user]);
}

export function useVideos() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["videos", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles!videos_user_id_fkey(username, display_name, avatar_url)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const normalized = (data || []).map((video: any) => withPlayableVideoUrl(video));
      const playable = normalized.filter((video: any) => !!video.video_url);

      if (!user) return playable;

      const { hiddenVideoIds, blockedUserIds, mutedUserIds } = await loadSafetyFilters(user.id);

      return playable.filter(
        (video: any) =>
          !hiddenVideoIds.has(video.id) &&
          !blockedUserIds.has(video.user_id) &&
          !mutedUserIds.has(video.user_id),
      );
    },
  });
}

export function useForYouVideos() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["for-you-videos", user?.id],
    refetchOnMount: "always",
    staleTime: 30_000,
    queryFn: async () => {
      const engagementState = loadEngagementLoopState();

      const { data: videos, error } = await supabase
        .from("videos")
        .select("*, profiles!videos_user_id_fkey(username, display_name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;

      if (!user) {
        return (videos || [])
          .map((video: any) => withPlayableVideoUrl(video))
          .filter((video: any) => !!video.video_url);
      }

      const logForYouTelemetry = (
        rows: Array<{ video_id: string; score: number; rank_position: number; components?: Record<string, any> }>,
      ) => {
        if (!rows.length) return;

        const payload = rows.slice(0, 30).map((row) => ({
          video_id: row.video_id,
          score: row.score,
          rank_position: row.rank_position,
          components: row.components || {},
        }));

        void supabase
          .rpc("log_for_you_ranking_batch", {
            rows_payload: payload,
            surface_name: "for_you",
          })
          .then(({ error: telemetryError }) => {
            if (telemetryError && !isSchemaMismatchError(telemetryError)) {
              console.warn("Failed to log feed ranking telemetry", telemetryError.message);
            }
          });
      };

      const rpcResult = await supabase.rpc("get_for_you_video_ids", { limit_count: 150 });
      if (!rpcResult.error && rpcResult.data) {
        const orderedIds = rpcResult.data.map((row: any) => row.video_id).filter(Boolean);
        if (orderedIds.length === 0) {
          // Fall through to client-side ranking fallback instead of returning empty feed.
        } else {
          logForYouTelemetry(
            rpcResult.data.map((row: any, index: number) => ({
              video_id: row.video_id,
              score: Number(row.score || 0),
              rank_position: index + 1,
              components: { source: "rpc" },
            })),
          );

          const { data: rankedVideos, error: rankedVideosError } = await supabase
            .from("videos")
            .select("*, profiles!videos_user_id_fkey(username, display_name, avatar_url)")
            .in("id", orderedIds);

          if (rankedVideosError) throw rankedVideosError;

          const byId = new Map(
            (rankedVideos || []).map((video: any) => {
              const normalizedVideo = withPlayableVideoUrl(video);
              return [normalizedVideo.id, normalizedVideo];
            }),
          );

          const rpcRanked = orderedIds
            .map((id: string) => byId.get(id))
            .filter((video: any) => !!video?.video_url);

          if (rpcRanked.length > 0) {
            const personalizedRpcRanked = rpcRanked
              .map((video: any, index: number) => {
                const baseScore = rpcRanked.length - index;
                const personalized = getEngagementPersonalizationBoost(video, engagementState, {
                  baseScore,
                });

                return {
                  ...video,
                  _score: personalized.score,
                  _personalization: personalized.components,
                };
              })
              .sort((a: any, b: any) => b._score - a._score);

            const diversifiedRpcRanked = diversifyFeedRanking(personalizedRpcRanked, {
              candidateWindow: 20,
            });

            logForYouTelemetry(
              diversifiedRpcRanked.map((video: any, index: number) => ({
                video_id: video.id,
                score: Number(video._finalScore || video._score || 0),
                rank_position: index + 1,
                components: {
                  source: "rpc_plus_local",
                  diversity_adjustment: Number(video._diversityAdjustment || 0),
                  ...(video._personalization || {}),
                },
              })),
            );

            return diversifiedRpcRanked;
          }
          // If RPC ranking resolves to no playable videos, continue to client fallback.
        }
      }

      if (rpcResult.error && !isSchemaMismatchError(rpcResult.error)) {
        throw rpcResult.error;
      }

      const [{ hiddenVideoIds, blockedUserIds, mutedUserIds }, eventsRes, followsRes, interestsRes, affinityRes] = await Promise.all([
        loadSafetyFilters(user.id),
        supabase
          .from("video_events")
          .select("video_id, event_type, watch_ms")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(600),
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
        supabase
          .from("profiles")
          .select("interests")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_interest_affinity")
          .select("interest_category, score")
          .eq("user_id", user.id),
      ]);

      if (eventsRes.error && !isSchemaMismatchError(eventsRes.error)) throw eventsRes.error;
      if (followsRes.error) throw followsRes.error;
      if (interestsRes.error && !isSchemaMismatchError(interestsRes.error)) throw interestsRes.error;

      const interactionWeights: Record<string, number> = {
        view_start: 0.5,
        view_3s: 2,
        view_complete: 8.8,
        like: 9.5,
        share: 16,
        follow: 18,
        hide: -22,
        report: -30,
      };

      const perVideoStats = new Map<
        string,
        {
          affinity: number;
          starts: number;
          completes: number;
          maxWatchMs: number;
        }
      >();

      (eventsRes.data || []).forEach((event: any, index: number) => {
        const baseWeight = interactionWeights[event.event_type] ?? 0;
        const decay = Math.max(0.18, 1 - index * 0.0022);
        const watchDepthBoost = ["view_3s", "view_complete"].includes(event.event_type)
          ? Math.min(Number(event.watch_ms || 0) / 1000, 30) * 0.085
          : 0;

        const entry = perVideoStats.get(event.video_id) || {
          affinity: 0,
          starts: 0,
          completes: 0,
          maxWatchMs: 0,
        };

        entry.affinity += (baseWeight + watchDepthBoost) * decay;
        if (event.event_type === "view_start") entry.starts += 1;
        if (event.event_type === "view_complete") entry.completes += 1;
        entry.maxWatchMs = Math.max(entry.maxWatchMs, Number(event.watch_ms || 0));
        perVideoStats.set(event.video_id, entry);
      });

      const followedSet = new Set((followsRes.data || []).map((row: any) => row.following_id));
      const interests = (interestsRes.data?.interests || []).map((interest: string) => interest.toLowerCase());

      const creatorAffinity = new Map<string, number>();

      const filtered = (videos || [])
        .map((video: any) => withPlayableVideoUrl(video))
        .filter((video: any) => !!video.video_url)
        .filter((video: any) => {
          if (!video?.scheduled_for) return true;
          const scheduledAt = new Date(video.scheduled_for).getTime();
          if (Number.isNaN(scheduledAt)) return true;
          return scheduledAt <= Date.now();
        })
        .filter(
        (video: any) =>
          !hiddenVideoIds.has(video.id) &&
          !blockedUserIds.has(video.user_id) &&
          !mutedUserIds.has(video.user_id),
      );

      filtered.forEach((video: any) => {
        const stats = perVideoStats.get(video.id);
        if (!stats) return;
        creatorAffinity.set(video.user_id, (creatorAffinity.get(video.user_id) || 0) + stats.affinity);
      });

      const ranked = filtered
        .map((video: any) => {
          const stats = perVideoStats.get(video.id) || {
            affinity: 0,
            starts: 0,
            completes: 0,
            maxWatchMs: 0,
          };
          const hoursSinceCreated = Math.max(
            1,
            (Date.now() - new Date(video.created_at).getTime()) / (1000 * 60 * 60),
          );
          const recencyBoost = 18 / Math.sqrt(hoursSinceCreated);
          const popularity =
            (video.likes_count || 0) * 1.15 +
            (video.comments_count || 0) * 1.7 +
            (video.shares_count || 0) * 2.45 +
            (video.bookmarks_count || 0) * 2.05;
          const affinity = stats.affinity * 2.35;
          const completionBoost = stats.starts > 0 ? Math.min(10, (stats.completes / stats.starts) * 11) : 0;
          const creatorBoost = (creatorAffinity.get(video.user_id) || 0) * 0.75;
          const watchDepthBoost = Math.min(stats.maxWatchMs / 1000, 30) * 0.12;
          const followingBoost = followedSet.has(video.user_id) ? 10 : 0;
          const textBlob = `${video.description || ""} ${video.music || ""}`.toLowerCase();
          const interestMatches = interests.reduce(
            (sum: number, interest: string) => (textBlob.includes(interest) ? sum + 1 : sum),
            0,
          );
          const interestBoost = interestMatches * 10.5;
          const stalePenalty = hoursSinceCreated > 24 * 14 ? 4 : 0;

          return {
            ...video,
            _score:
              popularity +
              affinity +
              followingBoost +
              recencyBoost +
              interestBoost +
              completionBoost +
              creatorBoost +
              watchDepthBoost -
              stalePenalty,
          };
        })
        .sort((a: any, b: any) => b._score - a._score);

      const personalizedRanked = ranked
        .map((video: any) => {
          const personalized = getEngagementPersonalizationBoost(video, engagementState, {
            baseScore: Number(video._score || 0),
          });

          return {
            ...video,
            _score: personalized.score,
            _personalization: personalized.components,
          };
        })
        .sort((a: any, b: any) => b._score - a._score);

      const diversifiedRanked = diversifyFeedRanking(personalizedRanked, {
        candidateWindow: 20,
      });

      logForYouTelemetry(
        diversifiedRanked.map((video: any, index: number) => ({
          video_id: video.id,
          score: Number(video._finalScore || video._score || 0),
          rank_position: index + 1,
          components: {
            source: "client_fallback",
            diversity_adjustment: Number(video._diversityAdjustment || 0),
            ...(video._personalization || {}),
          },
        })),
      );

      return diversifiedRanked;
    },
  });
}

export function useUserVideos(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-videos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const advanced = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", userId!)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (!advanced.error) return advanced.data;
      if (!isSchemaMismatchError(advanced.error)) throw advanced.error;

      const fallback = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (fallback.error) throw fallback.error;
      return fallback.data;
    },
  });
}

export function useTaggedVideos(userId: string | undefined) {
  return useQuery({
    queryKey: ["tagged-videos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const tagged = await supabase
        .from("tagged_videos")
        .select("video_id")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });

      if (tagged.error) {
        if (isSchemaMismatchError(tagged.error)) return [];
        throw tagged.error;
      }

      const ids = (tagged.data || []).map((row: any) => row.video_id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase.from("videos").select("*").in("id", ids);
      if (error) throw error;
      const map = new Map((data || []).map((video: any) => [video.id, video]));
      return ids.map((id: string) => map.get(id)).filter(Boolean);
    },
  });
}

export function useUserLikes(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-likes", userId],
    enabled: !!userId,
    initialData: () => new Set<string>(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("likes")
        .select("video_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return new Set((data || []).map((l) => l.video_id));
    },
  });
}

export function useUserBookmarks(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-bookmarks", userId],
    enabled: !!userId,
    initialData: () => new Set<string>(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select("video_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return new Set((data || []).map((b) => b.video_id));
    },
  });
}

export function useVideoComments(videoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["video-comments", videoId],
    enabled: !!videoId && enabled,
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from("comments")
        .select("id, user_id, video_id, content, created_at")
        .eq("video_id", videoId!)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!comments || comments.length === 0) return [] as VideoComment[];

      const userIds = [...new Set(comments.map((comment) => comment.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

      return comments.map((comment) => ({
        ...comment,
        profile: profileMap.get(comment.user_id) ?? null,
      })) as VideoComment[];
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, content }: { videoId: string; content: string }): Promise<ReliableMutationResult> => {
      if (!user) throw new Error("Not authenticated");

      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error("Comment cannot be empty");
      }

      const { data: videoRow, error: videoError } = await supabase
        .from("videos")
        .select("user_id")
        .eq("id", videoId)
        .maybeSingle();
      if (videoError) throw videoError;

      if (videoRow?.user_id) {
        const { data: ownerProfile, error: ownerProfileError } = await supabase
          .from("profiles")
          .select("allow_comments")
          .eq("user_id", videoRow.user_id)
          .maybeSingle();
        if (ownerProfileError && !isSchemaMismatchError(ownerProfileError)) throw ownerProfileError;

        if (ownerProfile?.allow_comments === false && videoRow.user_id !== user.id) {
          throw new Error("This creator has turned off comments");
        }
      }

      const mentionUsernames = extractMentionUsernames(trimmedContent);
      await ensureMentionTargetsAllowMentions(mentionUsernames);

      const clientRequestId = makeReliableActionId();
      try {
        await createCommentIdempotent(user.id, videoId, trimmedContent, clientRequestId);
        return { queued: false, clientRequestId };
      } catch (error) {
        if (!isRetryableMutationError(error)) throw error;

        upsertReliableQueueAction({
          id: makeReliableActionId(),
          userId: user.id,
          type: "comment",
          dedupeKey: `comment:${user.id}:${clientRequestId}`,
          payload: {
            videoId,
            content: trimmedContent,
            clientRequestId,
          },
          createdAt: Date.now(),
          attemptCount: 0,
          nextAttemptAt: Date.now() + getRetryDelayMs(0),
          lastErrorMessage: String(error instanceof Error ? error.message : "queued"),
        });

        return { queued: true, clientRequestId };
      }
    },
    onMutate: async ({ videoId, content }) => {
      await qc.cancelQueries({ queryKey: ["video-comments", videoId] });
      await qc.cancelQueries({ queryKey: ["videos"] });

      const previousComments = qc.getQueryData<VideoComment[]>(["video-comments", videoId]);
      const previousVideos = qc.getQueryData<any[]>(["videos"]);

      const optimisticComment: VideoComment = {
        id: `optimistic-${Date.now()}`,
        user_id: user?.id ?? "",
        video_id: videoId,
        content: content.trim(),
        created_at: new Date().toISOString(),
        profile: null,
      };

      qc.setQueryData<VideoComment[]>(["video-comments", videoId], (currentComments) => [
        optimisticComment,
        ...(currentComments ?? []),
      ]);

      updateVideosCommentsCount(qc, videoId, 1);

      return { previousComments, previousVideos };
    },
    onError: (_error, variables, context) => {
      if (context?.previousComments) {
        qc.setQueryData(["video-comments", variables.videoId], context.previousComments);
      }
      if (context?.previousVideos) {
        qc.setQueryData(["videos"], context.previousVideos);
      }
    },
    onSuccess: (data, variables) => {
      if (data?.queued) return;
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
    },
    onSettled: (data, _error, variables) => {
      if (data?.queued) return;
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, commentId }: { videoId: string; commentId: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onMutate: async ({ videoId, commentId }) => {
      await qc.cancelQueries({ queryKey: ["video-comments", videoId] });
      await qc.cancelQueries({ queryKey: ["videos"] });

      const previousComments = qc.getQueryData<VideoComment[]>(["video-comments", videoId]);
      const previousVideos = qc.getQueryData<any[]>(["videos"]);

      qc.setQueryData<VideoComment[]>(["video-comments", videoId], (currentComments) => {
        if (!currentComments) return currentComments;
        return currentComments.filter((comment) => comment.id !== commentId);
      });

      updateVideosCommentsCount(qc, videoId, -1);

      return { previousComments, previousVideos };
    },
    onError: (_error, variables, context) => {
      if (context?.previousComments) {
        qc.setQueryData(["video-comments", variables.videoId], context.previousComments);
      }
      if (context?.previousVideos) {
        qc.setQueryData(["videos"], context.previousVideos);
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ["video-comments", variables.videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, isLiked }: { videoId: string; isLiked: boolean }): Promise<ReliableMutationResult> => {
      if (!user) throw new Error("Not authenticated");
      const shouldLike = !isLiked;

      try {
        await setVideoLikeState(user.id, videoId, shouldLike);
        return { queued: false };
      } catch (error) {
        if (!isRetryableMutationError(error)) throw error;

        upsertReliableQueueAction({
          id: makeReliableActionId(),
          userId: user.id,
          type: "like",
          dedupeKey: `like:${user.id}:${videoId}`,
          payload: {
            videoId,
            shouldLike,
          },
          createdAt: Date.now(),
          attemptCount: 0,
          nextAttemptAt: Date.now() + getRetryDelayMs(0),
          lastErrorMessage: String(error instanceof Error ? error.message : "queued"),
        });

        return { queued: true };
      }
    },
    onSuccess: (data) => {
      if (data?.queued) return;
      qc.invalidateQueries({ queryKey: ["user-likes"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
    },
  });
}

export function useTrackVideoEvent() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, eventType, watchMs }: { videoId: string; eventType: VideoEventType; watchMs?: number }) => {
      if (!user) return;
      const { error } = await supabase.from("video_events").insert({
        user_id: user.id,
        video_id: videoId,
        event_type: eventType,
        watch_ms: watchMs ?? null,
      });
      if (error && !isSchemaMismatchError(error)) throw error;
    },
  });
}

export function useUpdateVideo() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      videoId,
      description,
      music,
      hashtags,
    }: {
      videoId: string;
      description?: string;
      music?: string;
      hashtags?: string[];
    }) => {
      if (!user) throw new Error("Not authenticated");
      const updates: Record<string, any> = {};
      if (description !== undefined) updates.description = description;
      if (music !== undefined) updates.music = music;
      if (hashtags !== undefined) updates.hashtags = hashtags;

      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from("videos")
        .update(updates)
        .eq("id", videoId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["user-videos"] });
    },
  });
}

export function useShareVideo() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ videoId }: { videoId: string }): Promise<ReliableMutationResult> => {
      if (!user) throw new Error("Not authenticated");

      try {
        await incrementVideoShareState(user.id, videoId);
        return { queued: false };
      } catch (error) {
        if (!isRetryableMutationError(error)) throw error;

        upsertReliableQueueAction({
          id: makeReliableActionId(),
          userId: user.id,
          type: "share",
          dedupeKey: `share:${user.id}:${videoId}:${Date.now()}`,
          payload: {
            videoId,
          },
          createdAt: Date.now(),
          attemptCount: 0,
          nextAttemptAt: Date.now() + getRetryDelayMs(0),
          lastErrorMessage: String(error instanceof Error ? error.message : "queued"),
        });

        return { queued: true };
      }
    },
    onSuccess: (data) => {
      if (data?.queued) return;
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
    },
  });
}

export function useHideVideo() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ videoId }: { videoId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("hidden_videos").upsert(
        { user_id: user.id, video_id: videoId },
        { onConflict: "user_id,video_id" },
      );
      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["hidden-videos"] });
    },
  });
}

export function useUnhideVideo() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ videoId }: { videoId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("hidden_videos")
        .delete()
        .eq("user_id", user.id)
        .eq("video_id", videoId);
      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["continue-watching"] });
      qc.invalidateQueries({ queryKey: ["hidden-videos"] });
    },
  });
}

export function useHiddenVideos(limit = 100, enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["hidden-videos", user?.id, limit],
    enabled: !!user && enabled,
    queryFn: async () => {
      const { data: hiddenRows, error } = await supabase
        .from("hidden_videos")
        .select("video_id, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }

      const ids = (hiddenRows || []).map((row: any) => row.video_id);
      if (ids.length === 0) return [];

      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("id, user_id, description, thumbnail_url, video_url, likes_count, created_at")
        .in("id", ids);
      if (videosError) throw videosError;

      const videoMap = new Map((videos || []).map((video: any) => [video.id, video]));
      return ids.map((id: string) => videoMap.get(id)).filter(Boolean);
    },
  });
}

export function useBlockUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId }: { targetUserId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("user_blocks").upsert(
        { user_id: user.id, blocked_user_id: targetUserId },
        { onConflict: "user_id,blocked_user_id" },
      );
      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useBlockedUsers(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["blocked-users", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("user_blocks")
        .select("blocked_user_id, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }

      const blockedIds = [...new Set((rows || []).map((row: any) => row.blocked_user_id))];
      if (blockedIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url, is_verified")
        .in("user_id", blockedIds);
      if (profileError) throw profileError;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      return (rows || []).map((row: any) => ({
        ...row,
        profile: profileMap.get(row.blocked_user_id) || null,
      }));
    },
  });
}

export function useUnblockUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId }: { targetUserId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("user_id", user.id)
        .eq("blocked_user_id", targetUserId);
      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocked-users"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMuteUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId }: { targetUserId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("user_mutes").upsert(
        { user_id: user.id, muted_user_id: targetUserId },
        { onConflict: "user_id,muted_user_id" },
      );
      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMutedUsers(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["muted-users", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("user_mutes")
        .select("muted_user_id, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }

      const mutedIds = [...new Set((rows || []).map((row: any) => row.muted_user_id))];
      if (mutedIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url, is_verified")
        .in("user_id", mutedIds);
      if (profileError) throw profileError;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      return (rows || []).map((row: any) => ({
        ...row,
        profile: profileMap.get(row.muted_user_id) || null,
      }));
    },
  });
}

export function useUnmuteUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId }: { targetUserId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_mutes")
        .delete()
        .eq("user_id", user.id)
        .eq("muted_user_id", targetUserId);
      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["muted-users"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useReportVideo() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, reason, details }: { videoId: string; reason: string; details?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("video_reports").insert({
        reporter_id: user.id,
        video_id: videoId,
        reason,
        details: details || null,
      });
      if (error && !isSchemaMismatchError(error)) throw error;
    },
  });
}

const BUNDLABLE_NOTIFICATION_TYPES = new Set(["like", "save", "follow", "comment", "reply"]);
const NOTIFICATION_BUNDLE_WINDOW_MS = 2 * 60 * 60 * 1000;

const toTimestamp = (value?: string | null) => {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.NaN : parsed;
};

const buildNotificationBundleKey = (notification: any) => {
  return `${notification.type || "unknown"}:${notification.actor_id || "system"}:${notification.entity_id || "none"}`;
};

const bundleNotifications = (rows: any[]) => {
  const sorted = [...rows].sort((a: any, b: any) => {
    const right = toTimestamp(b.created_at);
    const left = toTimestamp(a.created_at);
    const safeRight = Number.isNaN(right) ? 0 : right;
    const safeLeft = Number.isNaN(left) ? 0 : left;
    return safeRight - safeLeft;
  });

  const bundled: any[] = [];
  const bundleMeta = new Map<string, { index: number; leadTimestamp: number }>();

  sorted.forEach((notification) => {
    const bundleType = String(notification.type || "");
    const createdAtMs = toTimestamp(notification.created_at);
    if (!BUNDLABLE_NOTIFICATION_TYPES.has(bundleType) || Number.isNaN(createdAtMs)) {
      bundled.push({
        ...notification,
        bundle_count: 1,
        bundled_ids: [notification.id],
      });
      return;
    }

    const key = buildNotificationBundleKey(notification);
    const existing = bundleMeta.get(key);
    if (existing && existing.leadTimestamp - createdAtMs <= NOTIFICATION_BUNDLE_WINDOW_MS) {
      const lead = bundled[existing.index];
      lead.bundle_count = Number(lead.bundle_count || 1) + 1;
      lead.bundled_ids = [...(lead.bundled_ids || [lead.id]), notification.id];
      lead.is_read = !!lead.is_read && !!notification.is_read;
      return;
    }

    bundled.push({
      ...notification,
      bundle_count: 1,
      bundled_ids: [notification.id],
    });
    bundleMeta.set(key, {
      index: bundled.length - 1,
      leadTimestamp: createdAtMs,
    });
  });

  return bundled;
};

export function useNotifications(limit = 30) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return bundleNotifications(data || []);
    },
    refetchInterval: () => getVisibilityAwareRefetchInterval(20000, 120000),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}-${limit}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", user.id, limit] });
          qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        },
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          qc.invalidateQueries({ queryKey: ["notifications", user.id, limit] });
          qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit, qc, user]);

  return query;
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkMessageRequestNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("type", "message_request")
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}

export function useMarkNotificationRead() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationId }: { notificationId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}

export function useMarkNotificationsReadBatch() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationIds }: { notificationIds: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      const ids = Array.from(new Set(notificationIds.filter(Boolean)));
      if (ids.length === 0) return;

      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}

export function useDeleteNotification() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationId }: { notificationId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}

export function useDeleteNotificationsBatch() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationIds }: { notificationIds: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      const ids = Array.from(new Set(notificationIds.filter(Boolean)));
      if (ids.length === 0) return;

      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
}

export function useInboxNotes(limit = 24) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["inbox-notes", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data: followingRows, error: followError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user!.id);
      if (followError) throw followError;

      const visibleUserIds = [
        user!.id,
        ...(followingRows || []).map((row: any) => row.following_id),
      ];

      const { data: notes, error } = await (supabase as any)
        .from("inbox_notes")
        .select("id, user_id, content, created_at, expires_at")
        .in("user_id", visibleUserIds)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }

      const noteUserIds = Array.from(new Set((notes || []).map((row: any) => row.user_id)));
      if (noteUserIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", noteUserIds);
      if (profileError) throw profileError;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));

      return (notes || []).map((note: any) => ({
        ...note,
        profile: profileMap.get(note.user_id) || null,
      }));
    },
  });
}

export function useUpsertInboxNote() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      if (!user) throw new Error("Not authenticated");

      const trimmed = content.trim();
      if (!trimmed) throw new Error("Note cannot be empty");
      if (trimmed.length > 60) throw new Error("Note must be 60 characters or less");

      const { error } = await (supabase as any)
        .from("inbox_notes")
        .upsert(
          {
            user_id: user.id,
            content: trimmed,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-notes"] });
    },
  });
}

export function useUnreadNotificationsCount() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);

      if (error) {
        if (isSchemaMismatchError(error)) return 0;
        throw error;
      }

      return count || 0;
    },
    refetchInterval: () => getVisibilityAwareRefetchInterval(20000, 120000),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-unread-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        },
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, user]);

  return query;
}

export function useCreateReferral() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data, error } = await supabase
        .from("referrals")
        .insert({ inviter_id: user.id, code, status: "sent" })
        .select("*")
        .maybeSingle();
      if (error) {
        if (isSchemaMismatchError(error)) return null;
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
    },
  });
}

export function useReferrals() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["referrals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("inviter_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });
}

export function useContinueWatchingVideos(limit = 12) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["continue-watching", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("video_events")
        .select("video_id, event_type, watch_ms, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }

      const progressMap = new Map<
        string,
        { hasStart: boolean; hasComplete: boolean; watchMs: number; latestAt: string }
      >();

      for (const event of events || []) {
        const current = progressMap.get(event.video_id) || {
          hasStart: false,
          hasComplete: false,
          watchMs: 0,
          latestAt: event.created_at,
        };

        const hasStart = current.hasStart || event.event_type === "view_start" || event.event_type === "view_3s";
        const hasComplete = current.hasComplete || event.event_type === "view_complete";
        const watchMs = Math.max(current.watchMs, event.watch_ms || 0);

        progressMap.set(event.video_id, {
          hasStart,
          hasComplete,
          watchMs,
          latestAt: current.latestAt,
        });
      }

      const ids = [...progressMap.entries()]
        .filter(([, progress]) => progress.hasStart && !progress.hasComplete && progress.watchMs >= 3000)
        .sort((a, b) => new Date(b[1].latestAt).getTime() - new Date(a[1].latestAt).getTime())
        .slice(0, limit)
        .map(([videoId]) => videoId);

      if (ids.length === 0) return [];

      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("*")
        .in("id", ids);
      if (videosError) throw videosError;

      const videoMap = new Map((videos || []).map((video: any) => [video.id, video]));
      return ids.map((id) => videoMap.get(id)).filter(Boolean);
    },
  });
}

export function useUserInterests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-interests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("interests")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) {
        if (isSchemaMismatchError(error)) return null;
        throw error;
      }
      return data?.interests || [];
    },
  });
}

export function useUpdateUserInterests() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ interests }: { interests: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ interests })
        .eq("user_id", user.id);
      if (error && !isSchemaMismatchError(error)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-interests"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useToggleBookmark() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, isBookmarked }: { videoId: string; isBookmarked: boolean }): Promise<ReliableMutationResult> => {
      if (!user) throw new Error("Not authenticated");
      const shouldBookmark = !isBookmarked;

      try {
        await setVideoBookmarkState(user.id, videoId, shouldBookmark);
        return { queued: false };
      } catch (error) {
        if (!isRetryableMutationError(error)) throw error;

        upsertReliableQueueAction({
          id: makeReliableActionId(),
          userId: user.id,
          type: "bookmark",
          dedupeKey: `bookmark:${user.id}:${videoId}`,
          payload: {
            videoId,
            shouldBookmark,
          },
          createdAt: Date.now(),
          attemptCount: 0,
          nextAttemptAt: Date.now() + getRetryDelayMs(0),
          lastErrorMessage: String(error instanceof Error ? error.message : "queued"),
        });

        return { queued: true };
      }
    },
    onSuccess: (data) => {
      if (data?.queued) return;
      qc.invalidateQueries({ queryKey: ["user-bookmarks"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
    },
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useFollowersList(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["followers-list", userId],
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId!);
      if (error) throw error;
      const ids = [...new Set((rows || []).map((row: any) => row.follower_id))];
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", ids);
      if (pErr) throw pErr;
      return profiles || [];
    },
  });
}

export function useFollowingList(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["following-list", userId],
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId!);
      if (error) throw error;
      const ids = [...new Set((rows || []).map((row: any) => row.following_id))];
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", ids);
      if (pErr) throw pErr;
      return profiles || [];
    },
  });
}

export function useFollowRecommendations(limit = 12, enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["follow-recommendations", user?.id, limit],
    enabled: !!user && enabled,
    queryFn: async () => {
      const rpc = await supabase.rpc("get_follow_recommendations", { limit_count: limit });
      if (!rpc.error) return rpc.data || [];
      if (!isSchemaMismatchError(rpc.error)) throw rpc.error;

      const followingRes = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user!.id);
      if (followingRes.error) throw followingRes.error;

      const excludeIds = new Set((followingRes.data || []).map((row: any) => row.following_id));
      excludeIds.add(user!.id);

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url, is_private, is_verified")
        .limit(100);
      if (profilesError) throw profilesError;

      return (profiles || [])
        .filter((profile: any) => !excludeIds.has(profile.user_id))
        .slice(0, limit)
        .map((profile: any) => ({
          ...profile,
          score: 0,
        }));
    },
  });
}

export function useLogCreatorRecommendationExposure() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ suggestedUserIds, surface = "discover" }: { suggestedUserIds: string[]; surface?: string }) => {
      if (!user) return;
      if (!suggestedUserIds.length) return;

      const { error } = await supabase.rpc("log_creator_recommendation_exposure_batch", {
        suggested_user_ids: suggestedUserIds,
        surface_name: surface,
      });
      if (error && !isSchemaMismatchError(error)) throw error;
    },
  });
}

export function useLogCreatorRecommendationClick() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ suggestedUserId, surface = "discover" }: { suggestedUserId: string; surface?: string }) => {
      if (!user) return;
      if (!suggestedUserId) return;

      const { error } = await supabase.rpc("log_creator_recommendation_click", {
        suggested_user_id_input: suggestedUserId,
        surface_name: surface,
      });
      if (error && !isSchemaMismatchError(error)) throw error;
    },
  });
}

export function useLogMessageRequestAction() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, action, surface = "inbox" }: { conversationId: string; action: "accept" | "delete"; surface?: string }) => {
      if (!user) return;
      if (!conversationId) return;

      const { error } = await (supabase as any).rpc("log_message_request_action", {
        conversation_id_input: conversationId,
        action_input: action,
        surface_name: surface,
      });
      if (error && !isSchemaMismatchError(error)) throw error;
    },
  });
}

export function useMessageRequestAdminMetrics(windowDays = 7) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["message-request-admin-metrics", user?.id, windowDays],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_message_request_admin_metrics", {
        window_days: windowDays,
      });
      if (error) throw error;
      return Array.isArray(data) ? (data[0] || null) : data;
    },
  });
}

export function useMessageRequestAdminAlerts(windowDays = 7, deleteRateThresholdPercent = 70, minActions = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["message-request-admin-alerts", user?.id, windowDays, deleteRateThresholdPercent, minActions],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_message_request_alerts", {
        window_days: windowDays,
        delete_rate_threshold_percent: deleteRateThresholdPercent,
        min_actions: minActions,
      });
      if (error) throw error;
      return Array.isArray(data) ? (data[0] || null) : data;
    },
  });
}

export function useRunMessageRequestCriticalMitigation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      windowDays = 7,
      deleteRateThresholdPercent = 70,
      minActions = 20,
      throttleHours = 24,
      maxSenders = 5,
    }: {
      windowDays?: number;
      deleteRateThresholdPercent?: number;
      minActions?: number;
      throttleHours?: number;
      maxSenders?: number;
    } = {}) => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { data, error } = await (supabase as any).rpc("run_message_request_critical_mitigation", {
        window_days: windowDays,
        delete_rate_threshold_percent: deleteRateThresholdPercent,
        min_actions: minActions,
        throttle_hours: throttleHours,
        max_senders: maxSenders,
      });
      if (error) throw error;
      return data || [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-request-admin-metrics"] });
      qc.invalidateQueries({ queryKey: ["message-request-admin-alerts"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

export function useActiveMessageRequestSenderThrottles(limit = 100) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["message-request-active-throttles", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const { data, error } = await (supabase as any).rpc("get_active_message_request_sender_throttles", {
        limit_count: limit,
      });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useReleaseMessageRequestSenderThrottle() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ senderId, reason = "manual_admin_release" }: { senderId: string; reason?: string }) => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { data, error } = await (supabase as any).rpc("release_message_request_sender_throttle", {
        sender_id_input: senderId,
        release_reason: reason,
      });
      if (error) throw error;
      return !!data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-request-active-throttles"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

export function useCleanupExpiredMessageRequestSenderThrottles() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { data, error } = await (supabase as any).rpc("cleanup_expired_message_request_sender_throttles");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return Number(row?.released_count || 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-request-active-throttles"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

export function useFollowRequestStatus(targetUserId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["follow-request-status", user?.id, targetUserId],
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_requests")
        .select("id, status")
        .eq("follower_id", user!.id)
        .eq("following_id", targetUserId!)
        .maybeSingle();

      if (error) {
        if (isSchemaMismatchError(error)) return null;
        throw error;
      }

      return data;
    },
  });
}

export function useIncomingFollowRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["incoming-follow-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: requests, error } = await supabase
        .from("follow_requests")
        .select("id, follower_id, following_id, status, created_at")
        .eq("following_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }

      const followerIds = [...new Set((requests || []).map((row: any) => row.follower_id))];
      if (followerIds.length === 0) return [];

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", followerIds);
      if (pErr) throw pErr;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      return (requests || []).map((request: any) => ({
        ...request,
        profile: profileMap.get(request.follower_id) || null,
      }));
    },
  });
}

export function useRespondFollowRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ requestId, followerId, accept }: { requestId: string; followerId: string; accept: boolean }) => {
      if (!user) throw new Error("Not authenticated");

      if (accept) {
        const { error: followErr } = await supabase
          .from("follows")
          .insert({ follower_id: followerId, following_id: user.id });
        if (followErr) throw followErr;
      }

      const { error } = await supabase
        .from("follow_requests")
        .update({ status: accept ? "accepted" : "rejected" })
        .eq("id", requestId)
        .eq("following_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incoming-follow-requests"] });
      qc.invalidateQueries({ queryKey: ["follow-counts"] });
      qc.invalidateQueries({ queryKey: ["is-following"] });
    },
  });
}

export function useFollowCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ["follow-counts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [followers, following] = await Promise.all([
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId!),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId!),
      ]);
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
      };
    },
  });
}

export function useIsFollowing(targetUserId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-following", user?.id, targetUserId],
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user!.id)
        .eq("following_id", targetUserId!)
        .maybeSingle();
      return !!data;
    },
  });
}

export function useToggleFollow() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      targetUserId,
      isFollowing,
      targetIsPrivate,
      hasPendingRequest,
    }: {
      targetUserId: string;
      isFollowing: boolean;
      targetIsPrivate?: boolean;
      hasPendingRequest?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUserId);
        return "unfollowed";
      }

      if (targetIsPrivate) {
        if (hasPendingRequest) {
          const cancel = await supabase
            .from("follow_requests")
            .delete()
            .eq("follower_id", user.id)
            .eq("following_id", targetUserId)
            .eq("status", "pending");

          if (cancel.error && !isSchemaMismatchError(cancel.error)) throw cancel.error;
          return "request-cancelled";
        }

        const request = await supabase
          .from("follow_requests")
          .upsert(
            {
              follower_id: user.id,
              following_id: targetUserId,
              status: "pending",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "follower_id,following_id" },
          );

        if (request.error) {
          if (isSchemaMismatchError(request.error)) {
            await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
            return "followed";
          }
          throw request.error;
        }

        return "requested";
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
        return "followed";
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["is-following"] });
      qc.invalidateQueries({ queryKey: ["follow-request-status"] });
      qc.invalidateQueries({ queryKey: ["incoming-follow-requests"] });
      qc.invalidateQueries({ queryKey: ["follow-counts"] });
      qc.invalidateQueries({ queryKey: ["followers-list"] });
      qc.invalidateQueries({ queryKey: ["following-list"] });
      qc.invalidateQueries({ queryKey: ["follow-recommendations"] });
    },
  });
}

export function useProfileHighlights(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile-highlights", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_highlights")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });

      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });
}

export function useCreateHighlight() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, cover_url }: { title: string; cover_url?: string | null }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.from("profile_highlights").insert({
        user_id: user.id,
        title,
        cover_url: cover_url || null,
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-highlights"] });
    },
  });
}

export function useDeleteHighlight() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ highlightId }: { highlightId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profile_highlights")
        .delete()
        .eq("id", highlightId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-highlights"] });
    },
  });
}

export function useHighlightItems(highlightId: string | undefined) {
  return useQuery({
    queryKey: ["highlight-items", highlightId],
    enabled: !!highlightId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_highlight_items")
        .select("*, story:story_id(id, media_url, media_type, thumbnail_url, caption, created_at, user_id)")
        .eq("highlight_id", highlightId!)
        .order("added_at", { ascending: true });
      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });
}

export function useAddStoryToHighlight() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ highlightId, storyId }: { highlightId: string; storyId: string }) => {
      const { error } = await supabase.from("story_highlight_items").insert({
        highlight_id: highlightId,
        story_id: storyId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["highlight-items", vars.highlightId] });
      qc.invalidateQueries({ queryKey: ["profile-highlights"] });
    },
  });
}

export function useRemoveStoryFromHighlight() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ highlightId, storyId }: { highlightId: string; storyId: string }) => {
      const { error } = await supabase
        .from("story_highlight_items")
        .delete()
        .eq("highlight_id", highlightId)
        .eq("story_id", storyId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["highlight-items", vars.highlightId] });
      qc.invalidateQueries({ queryKey: ["profile-highlights"] });
    },
  });
}

export function useProfileLinks(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile-links", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_links")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });
      if (error) {
        if (isSchemaMismatchError(error)) return [];
        throw error;
      }
      return data || [];
    },
  });
}

export function useUpsertProfileLink() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      label,
      url,
      link_type,
    }: {
      id?: string;
      label: string;
      url: string;
      link_type?: "custom" | "affiliate" | "shop";
    }) => {
      if (!user) throw new Error("Not authenticated");

      const payload: any = {
        user_id: user.id,
        label,
        url,
        link_type: link_type || "custom",
      };
      if (id) payload.id = id;

      const { error } = await supabase.from("profile_links").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-links"] });
    },
  });
}

export function useDeleteProfileLink() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ linkId }: { linkId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profile_links")
        .delete()
        .eq("id", linkId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-links"] });
    },
  });
}

export function useMutualFollowers(targetUserId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["mutual-followers", user?.id, targetUserId],
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    queryFn: async () => {
      const [mine, target] = await Promise.all([
        supabase.from("follows").select("follower_id").eq("following_id", user!.id),
        supabase.from("follows").select("follower_id").eq("following_id", targetUserId!),
      ]);

      if (mine.error) throw mine.error;
      if (target.error) throw target.error;

      const mineSet = new Set((mine.data || []).map((row: any) => row.follower_id));
      const mutualIds = (target.data || [])
        .map((row: any) => row.follower_id)
        .filter((id: string) => mineSet.has(id));

      if (mutualIds.length === 0) return [];

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", mutualIds.slice(0, 5));
      if (error) throw error;
      return profiles || [];
    },
  });
}

export function useSuggestedUsers(limit = 8) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["suggested-users", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data: following } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user!.id);

      const excluded = new Set<string>([user!.id, ...(following || []).map((row: any) => row.following_id)]);
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .limit(Math.max(limit * 2, 20));
      if (error) throw error;

      return (profiles || []).filter((profile: any) => !excluded.has(profile.user_id)).slice(0, limit);
    },
  });
}

export function useCreatorMetrics(userId: string | undefined) {
  return useQuery({
    queryKey: ["creator-metrics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: videos, error } = await supabase
        .from("videos")
        .select("id, thumbnail_url, likes_count, comments_count, shares_count")
        .eq("user_id", userId!);
      if (error) throw error;

      const totalPosts = (videos || []).length;
      const likes = (videos || []).reduce((sum: number, video: any) => sum + (video.likes_count || 0), 0);
      const comments = (videos || []).reduce((sum: number, video: any) => sum + (video.comments_count || 0), 0);
      const shares = (videos || []).reduce((sum: number, video: any) => sum + (video.shares_count || 0), 0);
      const engagement = likes + comments + shares;
      const reach = likes * 3 + comments * 5 + shares * 8;

      const videoIds = (videos || []).map((video: any) => video.id);
      let avgWatchPercent = 0;
      let completionRate = 0;
      let totalViews = 0;

      if (videoIds.length > 0) {
        const [starts, completes, watchRows] = await Promise.all([
          supabase.from("video_events").select("id", { count: "exact", head: true }).in("video_id", videoIds).eq("event_type", "view_start"),
          supabase.from("video_events").select("id", { count: "exact", head: true }).in("video_id", videoIds).eq("event_type", "view_complete"),
          supabase.from("video_events").select("watch_ms").in("video_id", videoIds).not("watch_ms", "is", null).limit(2000),
        ]);

        if (starts.error && !isSchemaMismatchError(starts.error)) throw starts.error;
        if (completes.error && !isSchemaMismatchError(completes.error)) throw completes.error;
        if (watchRows.error && !isSchemaMismatchError(watchRows.error)) throw watchRows.error;

        totalViews = starts.count || 0;
        const completeViews = completes.count || 0;
        completionRate = totalViews > 0 ? Math.round((completeViews / totalViews) * 100) : 0;

        const watchValues = (watchRows.data || []).map((row: any) => row.watch_ms || 0).filter((value: number) => value > 0);
        if (watchValues.length > 0) {
          const avgWatchMs = watchValues.reduce((sum: number, value: number) => sum + value, 0) / watchValues.length;
          avgWatchPercent = Math.min(100, Math.round((avgWatchMs / 10000) * 100));
        }
      }

      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: followerGrowthCount, error: followerGrowthError } = await supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", userId!)
        .gte("created_at", last7Days);
      if (followerGrowthError) throw followerGrowthError;

      const topVideos = [...(videos || [])]
        .sort(
          (a: any, b: any) =>
            (b.likes_count || 0) + (b.comments_count || 0) * 2 + (b.shares_count || 0) * 3 -
            ((a.likes_count || 0) + (a.comments_count || 0) * 2 + (a.shares_count || 0) * 3),
        )
        .slice(0, 5)
        .map((video: any) => ({
          id: video.id,
          thumbnail_url: video.thumbnail_url,
          score: (video.likes_count || 0) + (video.comments_count || 0) * 2 + (video.shares_count || 0) * 3,
        }));

      return {
        posts: totalPosts,
        likes,
        comments,
        shares,
        engagement,
        reach,
        totalViews,
        avgWatchPercent,
        completionRate,
        followerGrowth7d: followerGrowthCount || 0,
        topVideos,
      };
    },
  });
}

export function useUpdateLastActive() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error && !isSchemaMismatchError(error)) throw error;
    },
  });
}

export function useLikedVideos(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["liked-videos", userId],
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data: likes, error: lErr } = await supabase
        .from("likes")
        .select("video_id")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (lErr) throw lErr;
      if (!likes || likes.length === 0) return [];
      const ids = likes.map((l) => l.video_id);
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .in("id", ids);
      if (error) throw error;
      // Preserve order from likes
      const map = new Map((data || []).map((v) => [v.id, v]));
      return ids.map((id) => map.get(id)).filter(Boolean);
    },
  });
}

export function useBookmarkedVideos(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["bookmarked-videos", userId],
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data: bookmarks, error: bErr } = await supabase
        .from("bookmarks")
        .select("video_id")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (bErr) throw bErr;
      if (!bookmarks || bookmarks.length === 0) return [];
      const ids = bookmarks.map((b) => b.video_id);
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .in("id", ids);
      if (error) throw error;
      const map = new Map((data || []).map((v) => [v.id, v]));
      return ids.map((id) => map.get(id)).filter(Boolean);
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: {
      display_name?: string;
      username?: string;
      bio?: string;
      location?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      avatar_url?: string | null;
      website_url?: string | null;
      category?: string | null;
      contact_email?: string | null;
      contact_phone?: string | null;
      affiliate_url?: string | null;
      shop_url?: string | null;
      is_private?: boolean;
      show_last_active?: boolean;
      professional_account?: boolean;
      allow_comments?: boolean;
      allow_mentions?: boolean;
      allow_messages_from?: "everyone" | "following" | "none";
      push_likes?: boolean;
      push_comments?: boolean;
      push_messages?: boolean;
      two_factor_enabled?: boolean;
      login_alerts?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useUserSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useUpsertUserSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: {
      privacy?: Record<string, any>;
      notifications?: Record<string, any>;
      content?: Record<string, any>;
      interactions?: Record<string, any>;
      ads?: Record<string, any>;
      accessibility?: Record<string, any>;
      app?: Record<string, any>;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const current = await supabase
        .from("user_settings")
        .select("privacy, notifications, content, interactions, ads, accessibility, app")
        .eq("user_id", user.id)
        .maybeSingle();

      if (current.error) throw current.error;

      const payload = {
        user_id: user.id,
        privacy: {
          ...(current.data?.privacy || {}),
          ...(updates.privacy || {}),
        },
        notifications: {
          ...(current.data?.notifications || {}),
          ...(updates.notifications || {}),
        },
        content: {
          ...(current.data?.content || {}),
          ...(updates.content || {}),
        },
        interactions: {
          ...(current.data?.interactions || {}),
          ...(updates.interactions || {}),
        },
        ads: {
          ...(current.data?.ads || {}),
          ...(updates.ads || {}),
        },
        accessibility: {
          ...(current.data?.accessibility || {}),
          ...(updates.accessibility || {}),
        },
        app: {
          ...(current.data?.app || {}),
          ...(updates.app || {}),
        },
      };

      const { error } = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });
}

export function useAdminUpdateProfileStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      targetUserId,
      isVerified,
      isMonetized,
    }: {
      targetUserId: string;
      isVerified: boolean;
      isMonetized: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: me, error: meError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (meError) throw meError;
      if (!me?.is_admin) throw new Error("Only admins can update verification/monetization");

      const { error } = await supabase
        .from("profiles")
        .update({
          is_verified: isVerified,
          is_monetized: isMonetized,
        })
        .eq("user_id", targetUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

const ensureCurrentUserIsAdmin = async (userId: string) => {
  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (meError) throw meError;
  if (!me?.is_admin) throw new Error("Admin access required");
};

export function useAdminProfiles(limit = 100) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["admin-profiles", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "user_id, username, display_name, avatar_url, is_private, is_verified, is_monetized, is_admin, professional_account, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

export function useAdminVideoReports(limit = 100) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["admin-video-reports", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const { data: reports, error: reportsError } = await supabase
        .from("video_reports")
        .select("id, reporter_id, video_id, reason, details, status, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (reportsError) throw reportsError;
      if (!reports || reports.length === 0) return [];

      const videoIds = [...new Set(reports.map((report) => report.video_id))];
      const reporterIds = [...new Set(reports.map((report) => report.reporter_id))];

      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("id, user_id, description, thumbnail_url, video_url, created_at")
        .in("id", videoIds);
      if (videosError) throw videosError;

      const ownerIds = [...new Set((videos || []).map((video) => video.user_id))];
      const profileIds = [...new Set([...reporterIds, ...ownerIds])];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", profileIds);
      if (profilesError) throw profilesError;

      const videoMap = new Map((videos || []).map((video) => [video.id, video]));
      const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

      return reports.map((report) => {
        const video = videoMap.get(report.video_id);
        return {
          ...report,
          video,
          reporter_profile: profileMap.get(report.reporter_id) || null,
          owner_profile: video ? profileMap.get((video as any).user_id) || null : null,
        };
      });
    },
  });
}

export function useAdminPriorityVideoReports(limit = 25) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["admin-priority-video-reports", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const rpc = await supabase.rpc("get_priority_video_reports", { limit_count: limit });
      if (!rpc.error) return rpc.data || [];
      if (!isSchemaMismatchError(rpc.error)) throw rpc.error;

      const fallback = await supabase
        .from("video_reports")
        .select("id, reporter_id, video_id, reason, details, status, created_at")
        .in("status", ["open", "reviewing"])
        .order("created_at", { ascending: true })
        .limit(limit);

      if (fallback.error) throw fallback.error;

      return (fallback.data || []).map((row: any) => ({
        report_id: row.id,
        video_id: row.video_id,
        reporter_id: row.reporter_id,
        owner_user_id: "",
        reason: row.reason,
        status: row.status,
        details: row.details,
        created_at: row.created_at,
        reporter_username: "",
        owner_username: "",
        report_count_on_video: 1,
        owner_open_reports: 1,
        priority_score: 0,
      }));
    },
  });
}

export function useCreatorRecommendationExperimentConfig() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["creator-reco-experiment", user?.id],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const { data, error } = await supabase.rpc("get_creator_recommendation_experiment_admin");
      if (error) throw error;
      return data?.[0] || null;
    },
  });
}

export function useCreatorRecommendationExperimentMetrics(windowDays = 7) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["creator-reco-experiment-metrics", user?.id, windowDays],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const { data, error } = await supabase.rpc("get_creator_recommendation_experiment_metrics", {
        window_days: windowDays,
      });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreatorRecommendationExperimentAlerts(windowDays = 7, ctrDropThresholdPercent = 10) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["creator-reco-experiment-alerts", user?.id, windowDays, ctrDropThresholdPercent],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const { data, error } = await supabase.rpc("get_creator_recommendation_experiment_alerts", {
        window_days: windowDays,
        ctr_drop_threshold_percent: ctrDropThresholdPercent,
      });
      if (error) throw error;
      return data?.[0] || null;
    },
  });
}

export function useUpsertCreatorRecommendationExperiment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      name,
      status,
      controlWeights,
      variantWeights,
      exposureCap,
    }: {
      name: string;
      status: "active" | "paused";
      controlWeights: Record<string, number>;
      variantWeights: Record<string, number>;
      exposureCap: number;
    }) => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { data, error } = await supabase.rpc("upsert_creator_recommendation_experiment", {
        experiment_name: name,
        experiment_status: status,
        control_weights_input: controlWeights,
        variant_weights_input: variantWeights,
        exposure_cap_input: exposureCap,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator-reco-experiment"] });
      qc.invalidateQueries({ queryKey: ["follow-recommendations"] });
    },
  });
}

export function useAdminUpdateReportStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ reportId, status }: { reportId: string; status: "open" | "reviewing" | "resolved" | "dismissed" }) => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { error } = await supabase
        .from("video_reports")
        .update({ status })
        .eq("id", reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-video-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-priority-video-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

export function useRunAbuseModerationAutomation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ maxUpdates = 100 }: { maxUpdates?: number } = {}) => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { data, error } = await supabase.rpc("run_abuse_moderation_automation", {
        max_updates: maxUpdates,
      });
      if (error) throw error;
      return data || [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-video-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-priority-video-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

export function useRunRetentionNudges() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ limitCount = 200 }: { limitCount?: number } = {}) => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { data, error } = await supabase.rpc("run_retention_nudges", {
        limit_count: limitCount,
      });
      if (error) throw error;
      return data || [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

export function useAdminDeleteVideo() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId }: { videoId: string }) => {
      if (!user) throw new Error("Not authenticated");
      await ensureCurrentUserIsAdmin(user.id);

      const { error } = await supabase
        .from("videos")
        .delete()
        .eq("id", videoId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-video-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-priority-video-reports"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["for-you-videos"] });
      qc.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    },
  });
}

export function useAdminAuditLogs(limit = 200) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["admin-audit-logs", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      await ensureCurrentUserIsAdmin(user!.id);

      const { data: logs, error: logsError } = await supabase
        .from("admin_audit_logs")
        .select("id, actor_user_id, action, target_user_id, target_video_id, target_report_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (logsError) throw logsError;
      if (!logs || logs.length === 0) return [];

      const profileIds = [...new Set(
        logs.flatMap((log) => [log.actor_user_id, log.target_user_id]).filter(Boolean) as string[],
      )];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", profileIds);
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

      return logs.map((log) => ({
        ...log,
        actor_profile: profileMap.get(log.actor_user_id) || null,
        target_profile: log.target_user_id ? profileMap.get(log.target_user_id) || null : null,
      }));
    },
  });
}

export function useTogglePinVideo() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, isPinned }: { videoId: string; isPinned: boolean }) => {
      if (!user) throw new Error("Not authenticated");

      const updateAttempt = await supabase
        .from("videos")
        .update({ is_pinned: !isPinned })
        .eq("id", videoId)
        .eq("user_id", user.id);

      if (updateAttempt.error) {
        if (isSchemaMismatchError(updateAttempt.error)) {
          throw new Error("Pinning requires latest database migration");
        }
        throw updateAttempt.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-videos"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}
