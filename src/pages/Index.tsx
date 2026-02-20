import VideoCard from "@/components/VideoCard";
import TopNav from "@/components/TopNav";
import { useForYouVideos, useUpdateUserInterests, useUserBookmarks, useUserInterests, useUserLikes } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const { data: videos } = useForYouVideos();
  const { data: likedSet } = useUserLikes(user?.id);
  const { data: bookmarkedSet } = useUserBookmarks(user?.id);
  const { data: interests } = useUserInterests();
  const updateInterests = useUpdateUserInterests();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const prefetchedVideoIdsRef = useRef<Set<string>>(new Set());
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
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

  const hasRealVideos = videos && videos.length > 0;
  const feedVideos = useMemo(() => videos ?? [], [videos]);
  const shouldShowInterestOnboarding = !!user && interests !== null && (interests?.length ?? 0) === 0;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

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

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const updateActiveFromScroll = () => {
      const viewportHeight = root.clientHeight;
      if (!viewportHeight) return;

      const rawPosition = root.scrollTop / viewportHeight;
      let nextIndex = activeIndexRef.current;

      while (rawPosition >= nextIndex + ACTIVE_SWITCH_THRESHOLD && nextIndex < feedVideos.length - 1) {
        nextIndex += 1;
      }

      while (rawPosition <= nextIndex - ACTIVE_SWITCH_THRESHOLD && nextIndex > 0) {
        nextIndex -= 1;
      }

      if (nextIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
      }
    };

    let rafId: number | null = null;
    const onScroll = () => {
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
    };
  }, [feedVideos.length]);

  useEffect(() => {
    if (!shouldShowInterestOnboarding) return;
    if (selectedInterests.length > 0) return;
    setSelectedInterests(["music", "comedy", "viral"]);
  }, [selectedInterests.length, shouldShowInterestOnboarding]);

  useEffect(() => {
    const focusVideoId = (location.state as any)?.focusVideoId as string | undefined;
    const focusSource = (location.state as any)?.focusSource as string | undefined;
    if (!focusVideoId || !feedVideos.length) return;

    const index = feedVideos.findIndex((video: any) => video.id === focusVideoId);
    if (index >= 0) {
      activeIndexRef.current = index;
      setActiveIndex(index);
      const node = itemRefs.current.get(index);
      if (node) {
        node.scrollIntoView({ behavior: focusSource === "discover" ? "auto" : "smooth", block: "start" });
      }
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [feedVideos, location.pathname, location.state, navigate]);

  useEffect(() => {
    const nextVideo = feedVideos[activeIndex + 1];
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
  }, [activeIndex, feedVideos]);

  useEffect(() => {
    const currentVideo = feedVideos[activeIndex];
    if (!currentVideo?.video_url) return;

    try {
      const url = new URL(currentVideo.video_url);
      const preconnectHref = `${url.protocol}//${url.host}`;
      const existing = document.head.querySelector(`link[rel=\"preconnect\"][href=\"${preconnectHref}\"]`);
      if (existing) return;

      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = preconnectHref;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    } catch {
      // ignore malformed URLs
    }
  }, [activeIndex, feedVideos]);

  const setItemRef = (index: number, node: HTMLDivElement | null) => {
    if (!node) {
      itemRefs.current.delete(index);
      return;
    }
    itemRefs.current.set(index, node);
  };

  return (
    <div ref={containerRef} className="snap-container scrollbar-hide fade-in" aria-label="video-feed">
      <TopNav />
      {hasRealVideos ? (
        feedVideos.map((video: any, index: number) => (
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
            <p className="mt-2 text-sm text-muted-foreground">Upload your first clip in Create to populate Home feed.</p>
            <button
              onClick={() => navigate("/create")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Go to Create
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
