import VideoCard from "@/components/VideoCard";
import TopNav from "@/components/TopNav";
import {
  useFollowingList,
  useForYouVideos,
  useUpdateUserInterests,
  useUserBookmarks,
  useUserInterests,
  useUserLikes,
} from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const interestOptions = [
  "dance",
  "viral",
  "foodie",
  "comedy",
  "music",
  "fitness",
  "art",
  "gaming",
  "travel",
  "fashion",
  "tech",
  "sports",
];

const PREFETCH_CACHE_LIMIT = 60;
const ACTIVE_SWITCH_THRESHOLD = 0.6;
const SCROLL_IDLE_RESTORE_MS = 180;
const SCROLL_JITTER_PX = 2;

function isSlowConnection() {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;

  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}

const Index = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    data: videos,
    isLoading: isVideosLoading,
    isFetching: isVideosFetching,
    refetch: refetchVideos,
  } = useForYouVideos();
  const { data: likedSet } = useUserLikes(user?.id);
  const { data: bookmarkedSet } = useUserBookmarks(user?.id);
  const { data: interests } = useUserInterests();
  const { data: followingProfiles } = useFollowingList(user?.id, !!user);
  const updateInterests = useUpdateUserInterests();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const prefetchedVideoIdsRef = useRef<Set<string>>(new Set());
  const feedPanelIdleTimeoutRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFeedPanelHidden, setIsFeedPanelHidden] = useState(false);
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
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [activeFeedTab, setActiveFeedTab] = useState<"following" | "foryou">("foryou");

  const feedVideos = useMemo(() => videos ?? [], [videos]);
  const followingUserIds = useMemo(
    () => new Set((followingProfiles ?? []).map((profile: any) => profile.user_id)),
    [followingProfiles],
  );
  const visibleVideos = useMemo(() => {
    if (activeFeedTab === "following") {
      return feedVideos.filter((video: any) => followingUserIds.has(video.user_id));
    }
    return feedVideos;
  }, [activeFeedTab, feedVideos, followingUserIds]);
  const hasRealVideos = visibleVideos.length > 0;
  const activeVideo = useMemo(() => visibleVideos[activeIndex] ?? null, [activeIndex, visibleVideos]);
  const activeTopic = useMemo(() => {
    if (!activeVideo) return "discover";

    const match = String(activeVideo.description || "").match(/#([a-zA-Z0-9_]+)/);
    if (match?.[1]) return match[1].toLowerCase();

    const music = String(activeVideo.music || "").trim();
    if (!music) return "discover";

    return (music.split(/[\s|,-]/).filter(Boolean)[0] || "discover").toLowerCase();
  }, [activeVideo]);
  const activeEngagementLabel = useMemo(() => {
    if (!activeVideo) return "Fresh picks";

    if ((activeVideo.likes_count || 0) >= 25000 || (activeVideo.shares_count || 0) >= 4000) {
      return "Exploding now";
    }
    if ((activeVideo.comments_count || 0) >= 500) {
      return "High discussion";
    }
    if ((activeVideo.shares_count || 0) >= 1000) {
      return "Highly shared";
    }
    return "Fresh picks";
  }, [activeVideo]);
  const shouldShowInterestOnboarding = !!user && interests !== null && (interests?.length ?? 0) === 0;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (feedPanelIdleTimeoutRef.current !== null) {
        window.clearTimeout(feedPanelIdleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("opium_feed_muted", isFeedMuted ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [isFeedMuted]);

  const toggleFeedMute = useCallback(() => {
    setIsFeedMuted((prev) => !prev);
  }, []);

  const handleRefreshFeed = useCallback(async () => {
    try {
      await refetchVideos();
      toast.success("Feed refreshed");
    } catch {
      toast.error("Could not refresh feed");
    }
  }, [refetchVideos]);

  const jumpToTop = useCallback(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeFeedTab]);

  useEffect(() => {
    if (visibleVideos.length === 0) {
      activeIndexRef.current = 0;
      setActiveIndex(0);
      return;
    }

    if (activeIndexRef.current >= visibleVideos.length) {
      const nextIndex = visibleVideos.length - 1;
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    }
  }, [visibleVideos.length]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const updateActiveFromScroll = () => {
      const viewportHeight = root.clientHeight;
      if (!viewportHeight) return;

      const rawPosition = root.scrollTop / viewportHeight;
      const nextIndex = Math.max(
        0,
        Math.min(visibleVideos.length - 1, Math.floor(rawPosition + ACTIVE_SWITCH_THRESHOLD)),
      );

      if (nextIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
      }
    };

    let rafId: number | null = null;
    const onScroll = () => {
      const currentScrollTop = root.scrollTop;
      const delta = Math.abs(currentScrollTop - lastScrollTopRef.current);
      lastScrollTopRef.current = currentScrollTop;

      if (delta <= SCROLL_JITTER_PX) return;

      setIsFeedPanelHidden((prev) => (prev ? prev : true));
      if (feedPanelIdleTimeoutRef.current !== null) {
        window.clearTimeout(feedPanelIdleTimeoutRef.current);
      }
      feedPanelIdleTimeoutRef.current = window.setTimeout(() => {
        setIsFeedPanelHidden(false);
        feedPanelIdleTimeoutRef.current = null;
      }, SCROLL_IDLE_RESTORE_MS);

      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        updateActiveFromScroll();
        rafId = null;
      });
    };

    updateActiveFromScroll();
    root.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      root.removeEventListener("scroll", onScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (feedPanelIdleTimeoutRef.current !== null) {
        window.clearTimeout(feedPanelIdleTimeoutRef.current);
        feedPanelIdleTimeoutRef.current = null;
      }
    };
  }, [visibleVideos.length]);

  useEffect(() => {
    if (!shouldShowInterestOnboarding) return;
    if (selectedInterests.length > 0) return;
    setSelectedInterests(["music", "comedy", "viral"]);
  }, [selectedInterests.length, shouldShowInterestOnboarding]);

  useEffect(() => {
    const focusVideoId = (location.state as any)?.focusVideoId as string | undefined;
    const focusSource = (location.state as any)?.focusSource as string | undefined;
    const focusFromQuery = (searchParams.get("focus") || "").trim();
    const targetVideoId = focusVideoId || focusFromQuery;
    if (!targetVideoId || !feedVideos.length) return;

    if (activeFeedTab === "following" && !visibleVideos.some((video: any) => video.id === targetVideoId)) {
      setActiveFeedTab("foryou");
      return;
    }

    const index = visibleVideos.findIndex((video: any) => video.id === targetVideoId);
    if (index >= 0) {
      activeIndexRef.current = index;
      setActiveIndex(index);
      const node = itemRefs.current.get(index);
      if (node) {
        const fromQuery = !!focusFromQuery && !focusVideoId;
        node.scrollIntoView({ behavior: focusSource === "discover" || fromQuery ? "auto" : "smooth", block: "start" });
      }
    }

    const fromQuery = !!focusFromQuery && !focusVideoId;
    if (fromQuery) {
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      const query = next.toString();
      navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true, state: {} });
      return;
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [activeFeedTab, feedVideos, location.pathname, location.state, navigate, searchParams, visibleVideos]);

  useEffect(() => {
    const nextVideo = visibleVideos[activeIndex + 1];
    if (!nextVideo?.id) return;
    if (isSlowConnection()) return;
    if (prefetchedVideoIdsRef.current.has(nextVideo.id)) return;

    if (prefetchedVideoIdsRef.current.size >= PREFETCH_CACHE_LIMIT) {
      const firstCachedId = prefetchedVideoIdsRef.current.values().next().value as string | undefined;
      if (firstCachedId) {
        prefetchedVideoIdsRef.current.delete(firstCachedId);
      }
    }

    prefetchedVideoIdsRef.current.add(nextVideo.id);

    if (nextVideo.thumbnail_url) {
      const image = new Image();
      image.src = nextVideo.thumbnail_url;
    }

    if (nextVideo.video_url) {
      const prefetchVideo = document.createElement("video");
      prefetchVideo.preload = "metadata";
      prefetchVideo.src = nextVideo.video_url;
      prefetchVideo.load();
    }
  }, [activeIndex, visibleVideos]);

  useEffect(() => {
    const currentVideo = visibleVideos[activeIndex];
    if (!currentVideo?.video_url) return;

    try {
      const url = new URL(currentVideo.video_url);
      const preconnectHref = `${url.protocol}//${url.host}`;
      const existing = document.head.querySelector(`link[rel="preconnect"][href="${preconnectHref}"]`);
      if (existing) return;

      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = preconnectHref;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    } catch {
      // ignore malformed URLs
    }
  }, [activeIndex, visibleVideos]);

  const setItemRef = (index: number, node: HTMLDivElement | null) => {
    if (!node) {
      itemRefs.current.delete(index);
      return;
    }
    itemRefs.current.set(index, node);
  };

  return (
    <div ref={containerRef} className="snap-container scrollbar-hide fade-in" aria-label="video-feed">
      <TopNav
        activeTab={activeFeedTab}
        onTabChange={setActiveFeedTab}
        followingCount={followingProfiles?.length ?? 0}
      />

      <div
        className={`pointer-events-none fixed left-0 right-0 top-[132px] z-[8] pt-safe transition-all duration-250 ease-out ${
          isFeedPanelHidden && hasRealVideos ? "-translate-y-2 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="mx-auto max-w-lg px-3">
          <div
            className={`mr-14 panel-surface rounded-xl px-3 py-2 transition-all duration-250 ease-out ${
              isFeedPanelHidden && hasRealVideos ? "pointer-events-none" : "pointer-events-auto"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {activeFeedTab === "following" ? "Following updates" : "For You picks"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  #{activeTopic} • {activeEngagementLabel}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleRefreshFeed}
                  disabled={isVideosFetching}
                  className="lift-on-tap rounded-full bg-secondary/80 p-2 text-foreground disabled:opacity-60"
                  aria-label="Refresh feed"
                >
                  <RefreshCw className={`h-4 w-4 ${isVideosFetching ? "animate-spin" : ""}`} />
                </button>
                {activeIndex > 0 && (
                  <button
                    onClick={jumpToTop}
                    className="lift-on-tap rounded-full bg-secondary/80 p-2 text-foreground"
                    aria-label="Back to top"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 h-1.5 w-full rounded-full bg-secondary/70">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${visibleVideos.length ? ((activeIndex + 1) / visibleVideos.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {isVideosLoading ? (
        <div className="snap-item flex items-center justify-center px-6 text-center">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4">
            <div className="h-4 w-28 animate-pulse rounded bg-secondary/80" />
            <div className="h-3 w-full animate-pulse rounded bg-secondary/70" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-secondary/70" />
            <div className="h-52 animate-pulse rounded-xl bg-secondary/60" />
            <p className="text-xs text-muted-foreground">Loading your personalized feed…</p>
          </div>
        </div>
      ) : hasRealVideos ? (
        visibleVideos.map((video: any, index: number) => (
          <div key={video.id} ref={(node) => setItemRef(index, node)} data-index={index} className="snap-item">
            <VideoCard
              video={video}
              isLiked={likedSet?.has(video.id) ?? false}
              isBookmarked={bookmarkedSet?.has(video.id) ?? false}
              isActive={index === activeIndex}
              isNearActive={Math.abs(index - activeIndex) <= 1}
              isMuted={isFeedMuted}
              onToggleMute={toggleFeedMute}
            />
          </div>
        ))
      ) : (
        <div className="snap-item flex items-center justify-center px-6 text-center">
          <div>
            <p className="text-base font-semibold text-foreground">No videos yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeFeedTab === "following"
                ? "Follow creators to see their latest clips here."
                : "Upload your first clip in Create to populate Home feed."}
            </p>
            <button
              onClick={() => navigate(activeFeedTab === "following" ? "/discover" : "/create")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {activeFeedTab === "following" ? "Go to Discover" : "Go to Create"}
            </button>
          </div>
        </div>
      )}

      {shouldShowInterestOnboarding && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 p-4">
          <div className="w-full rounded-2xl border border-border bg-background p-4">
            <h2 className="text-base font-bold text-foreground">Pick your interests</h2>
            <p className="mt-1 text-xs text-muted-foreground">This makes your For You feed relevant immediately.</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {interestOptions.map((interest) => {
                const active = selectedInterests.includes(interest);
                return (
                  <button
                    key={interest}
                    onClick={() => {
                      setSelectedInterests((current) =>
                        current.includes(interest)
                          ? current.filter((item) => item !== interest)
                          : [...current, interest],
                      );
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    #{interest}
                  </button>
                );
              })}
            </div>

            <button
              onClick={async () => {
                if (selectedInterests.length < 3) {
                  toast.error("Select at least 3 interests");
                  return;
                }

                try {
                  await updateInterests.mutateAsync({ interests: selectedInterests });
                  toast.success("Feed personalized");
                } catch {
                  toast.error("Could not save interests");
                }
              }}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
