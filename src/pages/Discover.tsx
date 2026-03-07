import { Search, Play, TrendingUp, Users, EyeOff, PlusSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useContinueWatchingVideos,
  useFollowRecommendations,
  useHideVideo,
  useLogCreatorRecommendationClick,
  useLogCreatorRecommendationExposure,
  useToggleFollow,
  useTrackVideoEvent,
  useUnhideVideo,
  useVideos,
} from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildOrIlikeClause, normalizeSearchInput } from "@/lib/search";
import { getEngagementPersonalizationBoost, loadEngagementLoopState } from "@/lib/engagementLoop";
import { diversifyFeedRanking } from "@/lib/feedDiversity";

const trendingTags = [
  "dance", "viral", "foodie", "cats",
  "streetstyle", "comedy", "music", "fitness", "art",
];

function useSearchProfiles(query: string) {
  return useQuery({
    queryKey: ["search-profiles", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const normalized = normalizeSearchInput(query);
      if (!normalized || normalized.length < 2) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .or(buildOrIlikeClause(["username", "display_name"], normalized))
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}

const Discover = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [isFeedMuted, setIsFeedMuted] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem("opium_feed_muted");
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const isSearching = debouncedSearchQuery.length >= 2;
  const { data: videos } = useVideos();
  const { data: continueWatching = [] } = useContinueWatchingVideos(12);
  const { data: followRecommendations = [] } = useFollowRecommendations(10, !isSearching);
  const logCreatorRecoClick = useLogCreatorRecommendationClick();
  const logCreatorRecoExposure = useLogCreatorRecommendationExposure();
  const toggleFollow = useToggleFollow();
  const hideVideo = useHideVideo();
  const unhideVideo = useUnhideVideo();
  const trackEvent = useTrackVideoEvent();
  const { data: searchProfiles } = useSearchProfiles(debouncedSearchQuery);
  const loggedExposureKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 220);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const q = (searchParams.get("q") || "").trim();
    if (!q) return;
    setSearchQuery(q);
    setDebouncedSearchQuery(q);
    setActiveTag(null);
  }, [searchParams]);

  useEffect(() => {
    const syncMutePref = () => {
      try {
        const stored = window.localStorage.getItem("opium_feed_muted");
        if (stored === "0") setIsFeedMuted(false);
        else if (stored === "1") setIsFeedMuted(true);
      } catch {
        // ignore storage errors
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        syncMutePref();
      }
    };

    window.addEventListener("storage", syncMutePref);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("storage", syncMutePref);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (isSearching) return;
    if (!followRecommendations.length) return;

    const ids = followRecommendations.map((profile: any) => profile.user_id).filter(Boolean);
    if (!ids.length) return;

    const key = `discover:${ids.join("|")}`;
    if (loggedExposureKeysRef.current.has(key)) return;
    loggedExposureKeysRef.current.add(key);

    void logCreatorRecoExposure.mutateAsync({ suggestedUserIds: ids, surface: "discover" });
  }, [followRecommendations, isSearching, logCreatorRecoExposure]);

  // Filter videos by search query or tag
  const filteredVideos = useMemo(() => {
    const source = videos && videos.length > 0 ? videos : null;
    if (!source) return null;

    const engagementState = loadEngagementLoopState();

    const personalizeOrder = (rows: any[]) =>
      diversifyFeedRanking(
        [...rows]
          .map((video: any) => {
            const basePopularity =
              (video.likes_count || 0) * 1 +
              (video.comments_count || 0) * 1.2 +
              (video.shares_count || 0) * 1.8 +
              (video.bookmarks_count || 0) * 1.4;
            const personalized = getEngagementPersonalizationBoost(video, engagementState, {
              baseScore: basePopularity,
            });

            return {
              ...video,
              _score: personalized.score,
              _discoverScore: personalized.score,
            };
          })
          .sort((a: any, b: any) => b._discoverScore - a._discoverScore),
        { candidateWindow: 16 },
      );

    if (isSearching) {
      const q = searchQuery.toLowerCase();
      return personalizeOrder(source.filter(
        (v: any) =>
          v.description?.toLowerCase().includes(q) ||
          v.music?.toLowerCase().includes(q) ||
          v.profiles?.username?.toLowerCase().includes(q)
      ));
    }

    if (activeTag) {
      const tag = activeTag.toLowerCase();
      return personalizeOrder(source.filter((v: any) =>
        v.description?.toLowerCase().includes(`#${tag}`) ||
        v.description?.toLowerCase().includes(tag)
      ));
    }

    return personalizeOrder(source);
  }, [videos, searchQuery, activeTag, isSearching]);

  const hasRealVideos = filteredVideos && filteredVideos.length > 0;

  return (
    <div className="ig-screen-spring ig-modern-page min-h-screen bg-background pb-20 pt-safe fade-in">
      <div className="ig-header ig-modern-header sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="px-4 pb-1 pt-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="ig-type-h1 text-foreground">Discover</h1>
              <p className="ig-type-sub">Explore clips and creators</p>
            </div>
            <button
              onClick={() => navigate("/create")}
              className="ig-tap ig-icon-btn rounded-full p-2 text-foreground hover:bg-secondary/70"
              aria-label="Create"
            >
              <PlusSquare className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Search bar */}
        <div className="px-4 py-2">
          <div className="ig-modern-input flex items-center gap-3 px-4 py-2.5 focus-within:border-primary/35">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search videos and users"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.length > 0) setActiveTag(null);
              }}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="ig-tap ig-icon-btn text-xs text-muted-foreground">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Trending tags */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-3">
          {trendingTags.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setActiveTag(activeTag === tag ? null : tag);
                setSearchQuery("");
              }}
              className={`ig-tap ig-icon-btn ig-modern-chip shrink-0 px-4 py-1.5 text-xs font-medium transition-colors ${
                activeTag === tag
                  ? "text-primary"
                  : "text-secondary-foreground"
              }`}
              data-active={activeTag === tag}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Search results: Users */}
      {isSearching && searchProfiles && searchProfiles.length > 0 && (
        <div className="px-4 pb-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Users className="h-3.5 w-3.5" /> Users
          </p>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            {searchProfiles.map((p) => (
              <button
                key={p.user_id}
                onClick={() => navigate(`/profile/${p.user_id}`)}
                className="ig-tap ig-icon-btn ig-list-item-enter flex w-20 shrink-0 flex-col items-center gap-1.5"
              >
                <div className="h-14 w-14 rounded-full bg-secondary overflow-hidden">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground">
                      {(p.display_name?.[0] || "U").toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-foreground font-medium truncate w-full text-center">
                  @{p.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section title */}
      {!isSearching && (
        <>
          {!!continueWatching.length && (
            <div className="px-4 pb-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Continue Watching
              </p>
              <div className="scrollbar-hide flex gap-2 overflow-x-auto">
                {continueWatching.map((video: any) => (
                  <button
                    key={video.id}
                    onClick={() => navigate("/clipy", { state: { focusVideoId: video.id, focusSource: "discover" } })}
                    className="ig-tap ig-icon-btn relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary"
                  >
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Play className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1">
                      <Play className="h-3 w-3 text-white" fill="white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!!followRecommendations.length && (
            <div className="px-4 pb-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Users className="h-3.5 w-3.5" /> Suggested creators
              </p>
              <div className="scrollbar-hide flex gap-2 overflow-x-auto">
                {followRecommendations.map((profile: any) => (
                  <div
                    key={profile.user_id}
                    className="ig-list-item-enter ig-modern-card w-[170px] shrink-0 p-2"
                  >
                    <button
                      onClick={() => {
                        void logCreatorRecoClick.mutateAsync({
                          suggestedUserId: profile.user_id,
                          surface: "discover",
                        });
                        navigate(`/profile/${profile.user_id}`);
                      }}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <div className="h-9 w-9 overflow-hidden rounded-full bg-secondary">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                            {(profile.display_name?.[0] || profile.username?.[0] || "U").toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {profile.display_name || "User"}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">@{profile.username || "user"}</p>
                      </div>
                    </button>

                    <button
                      onClick={async () => {
                        if (!user) {
                          navigate("/auth");
                          return;
                        }

                        try {
                          const result = await toggleFollow.mutateAsync({
                            targetUserId: profile.user_id,
                            isFollowing: false,
                            targetIsPrivate: !!profile.is_private,
                          });

                          if (result === "requested") toast.success("Follow request sent");
                          else toast.success("Following");
                        } catch (error: any) {
                          toast.error(error.message || "Could not follow user");
                        }
                      }}
                      disabled={toggleFollow.isPending}
                      className="mt-2 w-full rounded-lg bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      {toggleFollow.isPending ? "Please wait..." : profile.is_private ? "Request" : "Follow"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 pb-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <TrendingUp className="h-3.5 w-3.5" />
            {activeTag ? `#${activeTag}` : "Trending"}
          </p>
          </div>
        </>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5">
        {hasRealVideos &&
          filteredVideos.map((video: any) => (
              <div key={video.id} className="ig-list-item-enter relative aspect-[9/16] overflow-hidden border border-border/40 bg-secondary">
                <button
                  onClick={() => navigate("/clipy", { state: { focusVideoId: video.id, focusSource: "discover" } })}
                  className="ig-tap ig-icon-btn h-full w-full text-left"
                >
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : video.video_url ? (
                    <video src={video.video_url} className="h-full w-full object-cover" muted={isFeedMuted} preload="metadata" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Play className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 flex items-center gap-1">
                    <Play className="h-3 w-3 text-white" fill="white" />
                    <span className="text-[10px] font-medium text-white">
                      {video.likes_count >= 1000
                        ? (video.likes_count / 1000).toFixed(0) + "K"
                        : video.likes_count}
                    </span>
                  </div>
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();

                    if (!user) {
                      navigate("/auth");
                      return;
                    }

                    hideVideo.mutate(
                      { videoId: video.id },
                      {
                        onSuccess: () => {
                          trackEvent.mutate({ videoId: video.id, eventType: "hide" });
                          toast.success("We’ll show less like this", {
                            action: {
                              label: "Undo",
                              onClick: () => {
                                unhideVideo.mutate(
                                  { videoId: video.id },
                                  {
                                    onSuccess: () => {
                                      toast.success("Video restored");
                                    },
                                  },
                                );
                              },
                            },
                          });
                        },
                      },
                    );
                  }}
                  className="absolute right-1 top-1 z-10 rounded-full bg-black/45 p-1.5 backdrop-blur-sm"
                  aria-label="Not interested"
                >
                  <EyeOff className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ))}
      </div>

      {!hasRealVideos && (
        <div className="px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">No videos to discover yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Once videos are uploaded, they’ll appear here automatically.</p>
        </div>
      )}

      {/* Empty state for search/tag with no results */}
      {(isSearching || activeTag) && hasRealVideos === false && videos && videos.length > 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No results found{isSearching ? ` for "${searchQuery}"` : ` for #${activeTag}`}
        </div>
      )}
    </div>
  );
};

export default Discover;
