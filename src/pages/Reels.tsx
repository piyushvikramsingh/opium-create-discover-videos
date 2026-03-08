import VideoCard from "@/components/VideoCard";
import {
  useForYouVideos,
  useUserBookmarks,
  useUserLikes,
} from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { useRuntimeSettings } from "@/hooks/useRuntimeSettings";
import { Camera, Music2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const ACTIVE_SWITCH_THRESHOLD = 0.6;
const SCROLL_IDLE_RESTORE_MS = 180;
const SCROLL_JITTER_PX = 2;

const Reels = () => {
  const { user } = useAuth();
  const { autoplaySound } = useRuntimeSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    data: videos,
    isLoading: isVideosLoading,
    isFetching: isVideosFetching,
    refetch: refetchVideos,
  } = useForYouVideos();
  const { data: likedSet } = useUserLikes(user?.id);
  const { data: bookmarkedSet } = useUserBookmarks(user?.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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

  const feedVideos = useMemo(() => videos ?? [], [videos]);
  const hasRealVideos = feedVideos.length > 0;
  const activeVideo = useMemo(() => feedVideos[activeIndex] ?? null, [activeIndex, feedVideos]);

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

  useEffect(() => {
    setIsFeedMuted(!autoplaySound);
  }, [autoplaySound]);

  const toggleFeedMute = useCallback(() => {
    setIsFeedMuted((prev) => !prev);
  }, []);

  useEffect(() => {
    if (feedVideos.length === 0) {
      activeIndexRef.current = 0;
      setActiveIndex(0);
      return;
    }

    if (activeIndexRef.current >= feedVideos.length) {
      const nextIndex = feedVideos.length - 1;
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    }
  }, [feedVideos.length]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const updateActiveFromScroll = () => {
      const viewportHeight = root.clientHeight;
      if (!viewportHeight) return;

      const rawPosition = root.scrollTop / viewportHeight;
      const nextIndex = Math.max(
        0,
        Math.min(feedVideos.length - 1, Math.floor(rawPosition + ACTIVE_SWITCH_THRESHOLD)),
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
  }, [feedVideos.length]);

  useEffect(() => {
    const focusVideoId = (location.state as any)?.focusVideoId as string | undefined;
    if (!focusVideoId || !feedVideos.length) return;

    const index = feedVideos.findIndex((video: any) => video.id === focusVideoId);
    if (index >= 0) {
      activeIndexRef.current = index;
      setActiveIndex(index);
      const node = itemRefs.current.get(index);
      if (node) {
        node.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [feedVideos, location.pathname, location.state, navigate]);

  const setItemRef = (index: number, node: HTMLDivElement | null) => {
    if (!node) {
      itemRefs.current.delete(index);
      return;
    }
    itemRefs.current.set(index, node);
  };

  return (
    <div className="relative h-[100dvh] w-full bg-black">
      {/* Reels Header */}
      <div className={`pointer-events-none fixed left-0 right-0 top-0 z-[15] transition-all duration-300 ${
        isFeedPanelHidden ? "opacity-0 -translate-y-2" : "opacity-100"
      }`}>
        <div className="flex items-center justify-between px-4 py-3 pt-safe">
          <h1 className="text-xl font-bold text-white drop-shadow-lg">Reels</h1>
          <button
            onClick={() => navigate("/create")}
            className="pointer-events-auto rounded-full bg-white/20 p-2 backdrop-blur-sm"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Full-screen video feed */}
      <div 
        ref={containerRef} 
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll scrollbar-hide"
      >
        {isVideosLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              <p className="text-sm text-white/70">Loading Reels...</p>
            </div>
          </div>
        ) : hasRealVideos ? (
          feedVideos.map((video: any, index: number) => (
            <div 
              key={video.id} 
              ref={(node) => setItemRef(index, node)} 
              data-index={index} 
              className="h-[100dvh] w-full snap-start snap-always"
            >
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
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-6 rounded-full bg-white/10 p-6">
              <Sparkles className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">No Reels yet</h2>
            <p className="mt-2 text-white/60">
              Create your first Reel or come back later to discover amazing content.
            </p>
            <button
              onClick={() => navigate("/create")}
              className="mt-6 rounded-full bg-white px-8 py-3 text-sm font-semibold text-black"
            >
              Create Reel
            </button>
          </div>
        )}
      </div>

      {/* Progress indicator */}
      {hasRealVideos && (
        <div className={`pointer-events-none fixed right-3 top-1/2 z-[10] -translate-y-1/2 transition-opacity duration-300 ${
          isFeedPanelHidden ? "opacity-0" : "opacity-100"
        }`}>
          <div className="flex flex-col gap-1">
            {feedVideos.slice(0, Math.min(feedVideos.length, 10)).map((_: any, i: number) => (
              <div
                key={i}
                className={`h-6 w-1 rounded-full transition-all duration-200 ${
                  i === activeIndex 
                    ? "bg-white scale-110" 
                    : Math.abs(i - activeIndex) <= 1 
                      ? "bg-white/50" 
                      : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reels;
