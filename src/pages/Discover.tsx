import { Search, Play, TrendingUp, Users, EyeOff, PlusSquare, Grid3X3, Film, Heart, Image as ImageIcon, RefreshCw, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildOrIlikeClause, normalizeSearchInput } from "@/lib/search";
import { getEngagementPersonalizationBoost, loadEngagementLoopState } from "@/lib/engagementLoop";
import { diversifyFeedRanking } from "@/lib/feedDiversity";

const trendingTags = [
  "dance", "viral", "foodie", "cats",
  "streetstyle", "comedy", "music", "fitness", "art",
];

const ITEMS_PER_PAGE = 18;
const PULL_THRESHOLD = 80;

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

// Instagram-style masonry grid patterns
const getMasonryPattern = (index: number): string => {
  const patterns = [
    "col-span-1 row-span-1", // small square
    "col-span-1 row-span-1", // small square
    "col-span-1 row-span-2", // tall
    "col-span-1 row-span-1", // small square
    "col-span-1 row-span-1", // small square
    "col-span-2 row-span-2", // large square (featured)
    "col-span-1 row-span-1", // small square
    "col-span-1 row-span-1", // small square
    "col-span-1 row-span-2", // tall
  ];
  return patterns[index % patterns.length];
};

const Discover = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const isSearching = debouncedSearchQuery.length >= 2;
  const { data: videos, refetch: refetchVideos, isFetching } = useVideos();
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
  const hoverTimeoutRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const scrollTopAtStartRef = useRef<number>(0);

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

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

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

  const handleVideoHover = (videoId: string) => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredVideoId(videoId);
    }, 150);
  };

  const handleVideoLeave = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredVideoId(null);
  };

  return (
    <div className="ig-screen-spring ig-modern-page min-h-screen bg-background pb-20 pt-safe fade-in">
      {/* Instagram-style header */}
      <div className="ig-header sticky top-0 z-20 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="px-4 pb-2 pt-3">
          <h1 className="text-xl font-bold text-foreground">Explore</h1>
        </div>
        
        {/* Search bar - Instagram style */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-xl bg-secondary/80 px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.length > 0) setActiveTag(null);
              }}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category pills - Instagram style */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-3 pb-3">
          <button
            onClick={() => setActiveTag(null)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              !activeTag
                ? "bg-foreground text-background"
                : "bg-secondary/80 text-foreground"
            }`}
          >
            For You
          </button>
          {trendingTags.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setActiveTag(activeTag === tag ? null : tag);
                setSearchQuery("");
              }}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-all ${
                activeTag === tag
                  ? "bg-foreground text-background"
                  : "bg-secondary/80 text-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Search results: Users */}
      {isSearching && searchProfiles && searchProfiles.length > 0 && (
        <div className="border-b border-border/40 px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Accounts</p>
          <div className="space-y-3">
            {searchProfiles.slice(0, 5).map((p) => (
              <button
                key={p.user_id}
                onClick={() => navigate(`/profile/${p.user_id}`)}
                className="flex w-full items-center gap-3 text-left"
              >
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 p-0.5">
                  <div className="h-full w-full rounded-full bg-secondary overflow-hidden">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground">
                        {(p.display_name?.[0] || "U").toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {p.username}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.display_name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested creators carousel - only when not searching */}
      {!isSearching && !!followRecommendations.length && (
        <div className="border-b border-border/40 px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Suggested for you</p>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto">
            {followRecommendations.map((profile: any) => (
              <div
                key={profile.user_id}
                className="w-36 shrink-0 rounded-xl border border-border/40 bg-card p-4 text-center"
              >
                <button
                  onClick={() => {
                    void logCreatorRecoClick.mutateAsync({
                      suggestedUserId: profile.user_id,
                      surface: "discover",
                    });
                    navigate(`/profile/${profile.user_id}`);
                  }}
                  className="w-full"
                >
                  <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent p-0.5">
                    <div className="h-full w-full rounded-full bg-card overflow-hidden">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted-foreground">
                          {(profile.display_name?.[0] || profile.username?.[0] || "U").toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-foreground">
                    {profile.username || "user"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile.display_name || "User"}
                  </p>
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
                  className="mt-3 w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {toggleFollow.isPending ? "..." : "Follow"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instagram-style Masonry Grid */}
      <div className="grid grid-cols-3 auto-rows-[120px] gap-0.5 p-0.5">
        {hasRealVideos &&
          filteredVideos.map((video: any, index: number) => {
            const pattern = getMasonryPattern(index);
            const isLarge = pattern.includes("col-span-2") || pattern.includes("row-span-2");
            const isHovered = hoveredVideoId === video.id;
            
            return (
              <div 
                key={video.id} 
                className={`relative overflow-hidden bg-secondary ${pattern}`}
                onMouseEnter={() => handleVideoHover(video.id)}
                onMouseLeave={handleVideoLeave}
              >
                <button
                  onClick={() => navigate("/", { state: { focusVideoId: video.id, focusSource: "discover" } })}
                  className="h-full w-full text-left group"
                >
                  {/* Thumbnail/Video */}
                  {video.thumbnail_url ? (
                    <img 
                      src={video.thumbnail_url} 
                      alt="" 
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" 
                      loading="lazy" 
                    />
                  ) : video.video_url ? (
                    <video 
                      src={video.video_url} 
                      className="h-full w-full object-cover" 
                      muted 
                      playsInline
                      loop
                      autoPlay={isHovered}
                      preload="metadata" 
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-secondary">
                      <Play className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Video indicator */}
                  {video.video_url && (
                    <div className="absolute right-2 top-2">
                      <Film className="h-4 w-4 text-white drop-shadow-lg" />
                    </div>
                  )}
                  
                  {/* Hover overlay with stats */}
                  <div className={`absolute inset-0 bg-black/40 flex items-center justify-center gap-6 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                    <div className="flex items-center gap-1.5 text-white">
                      <Heart className="h-5 w-5 fill-white" />
                      <span className="text-sm font-semibold">
                        {video.likes_count >= 1000
                          ? (video.likes_count / 1000).toFixed(0) + "K"
                          : video.likes_count || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-white">
                      <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                        <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22z" />
                      </svg>
                      <span className="text-sm font-semibold">
                        {video.comments_count || 0}
                      </span>
                    </div>
                  </div>
                  
                  {/* Play count badge (bottom left) - mobile */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 md:hidden">
                    <Play className="h-3 w-3 text-white fill-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white drop-shadow-lg">
                      {video.likes_count >= 1000
                        ? (video.likes_count / 1000).toFixed(0) + "K"
                        : video.likes_count || 0}
                    </span>
                  </div>
                </button>

                {/* Hide button */}
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
                          toast.success("We'll show less like this", {
                            action: {
                              label: "Undo",
                              onClick: () => {
                                unhideVideo.mutate(
                                  { videoId: video.id },
                                  { onSuccess: () => toast.success("Video restored") },
                                );
                              },
                            },
                          });
                        },
                      },
                    );
                  }}
                  className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/50 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
                  aria-label="Not interested"
                >
                  <EyeOff className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            );
          })}
      </div>

      {!hasRealVideos && !isSearching && !activeTag && (
        <div className="px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-foreground/20">
            <Grid3X3 className="h-10 w-10 text-foreground/40" />
          </div>
          <p className="text-xl font-semibold text-foreground">Start exploring</p>
          <p className="mt-2 text-sm text-muted-foreground">
            When you explore, you'll see photos and videos here.
          </p>
        </div>
      )}

      {/* Empty state for search/tag with no results */}
      {(isSearching || activeTag) && hasRealVideos === false && videos && videos.length > 0 && (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground/20">
            <Search className="h-8 w-8 text-foreground/40" />
          </div>
          <p className="text-lg font-semibold text-foreground">No results found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSearching ? `Try searching for something else` : `No posts with #${activeTag}`}
          </p>
        </div>
      )}
    </div>
  );
};

export default Discover;
