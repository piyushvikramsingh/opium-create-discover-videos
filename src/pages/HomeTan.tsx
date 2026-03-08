import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Heart,
  Volume2,
  VolumeX,
  Sparkles,
  PlusSquare,
  Clapperboard,
  Images,
  Bookmark,
  Share2,
  RefreshCcw,
  MoreHorizontal,
  Flag,
  EyeOff,
  Link2,
  ChevronUp,
} from "lucide-react";
import {
  useForYouVideos,
  useFollowRecommendations,
  useLogCreatorRecommendationClick,
  useLogCreatorRecommendationExposure,
  useProfile,
  useFollowingList,
  useUserLikes,
  useUserBookmarks,
  useToggleLike,
  useToggleBookmark,
  useToggleFollow,
  useShareVideo,
  useTrackVideoEvent,
  useUnreadNotificationsCount,
  useHideVideo,
  useReportVideo,
} from "@/hooks/useData";
import { Button } from "@/components/ui/button";
import { StoriesBar } from "@/components/StoriesBar";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useMessages";
import CommentsSheet from "@/components/CommentsSheet";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useRuntimeSettings } from "@/hooks/useRuntimeSettings";

const HomeTan = () => {
  const navigate = useNavigate();
  const { autoplayVideos, autoplaySound, loopVideos, hideLikeCount, lowBandwidthMode } = useRuntimeSettings();
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: videos = [], isLoading, isFetching, refetch } = useForYouVideos();
  const [feedMode, setFeedMode] = useState<"forYou" | "following">("forYou");
  const [mediaFilter, setMediaFilter] = useState<"all" | "videos" | "photos">(() => {
    if (typeof window === "undefined") return "all";
    const stored = window.localStorage.getItem("home:mediaFilter");
    if (stored === "all" || stored === "videos" || stored === "photos") {
      return stored;
    }
    return "all";
  });
  const { data: serverLikedPosts } = useUserLikes(user?.id);
  const { data: serverBookmarkedPosts } = useUserBookmarks(user?.id);
  const { data: followRecommendations = [] } = useFollowRecommendations(8, feedMode === "following");
  const { data: followingList = [] } = useFollowingList(user?.id, feedMode === "following");
  const { data: unreadNotifications = 0 } = useUnreadNotificationsCount();
  const { data: conversations = [] } = useConversations();
  const hideVideo = useHideVideo();
  const reportVideo = useReportVideo();
  const toggleLike = useToggleLike();
  const toggleBookmark = useToggleBookmark();
  const toggleFollow = useToggleFollow();
  const logCreatorRecoClick = useLogCreatorRecommendationClick();
  const logCreatorRecoExposure = useLogCreatorRecommendationExposure();
  const shareVideo = useShareVideo();
  const trackVideoEvent = useTrackVideoEvent();
  const [heartBurstId, setHeartBurstId] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(() => new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(() => new Set());
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(() => new Set());
  const [pendingBookmarkIds, setPendingBookmarkIds] = useState<Set<string>>(() => new Set());
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(() => new Set());
  const [activeCommentsVideoId, setActiveCommentsVideoId] = useState<string | null>(null);
  const [isFeedMuted, setIsFeedMuted] = useState<boolean>(!autoplaySound);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [activePostActions, setActivePostActions] = useState<any | null>(null);
  const [postActionPending, setPostActionPending] = useState<"report" | "hide" | "copy" | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const loggedExposureKeysRef = useRef<Set<string>>(new Set());
  const isPullTrackingRef = useRef(false);
  const pullStartYRef = useRef(0);
  const pullTriggeredRef = useRef(false);
  const pullThresholdHapticSentRef = useRef(false);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const videoObserverRef = useRef<IntersectionObserver | null>(null);
  const videoVisibilityRef = useRef<Map<string, number>>(new Map());
  const activeVideoIdRef = useRef<string | null>(null);

  const PULL_REFRESH_TRIGGER = 78;
  const PULL_REFRESH_MAX = 112;
  const ACTIVE_VIDEO_KEEP_VISIBILITY = 0.45;
  const ACTIVE_VIDEO_SWITCH_VISIBILITY = 0.65;
  const topIconButtonClass =
    "relative ig-tap ig-icon-btn rounded-full p-2 text-foreground transition-colors hover:bg-secondary/70";
  const feedIconButtonClass =
    "ig-tap ig-icon-btn rounded-full p-2 text-foreground transition-colors hover:bg-secondary/70";

  useEffect(() => {
    setIsFeedMuted(!autoplaySound);
  }, [autoplaySound]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("home:mediaFilter", mediaFilter);
  }, [mediaFilter]);

  const followingIds = useMemo(() => {
    return new Set((followingList || []).map((p: any) => p.user_id));
  }, [followingList]);

  const formatTimeAgo = (createdAt: string) => {
    const deltaMs = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.max(1, Math.floor(deltaMs / (1000 * 60)));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const feedPosts = useMemo(() => {
    const ranked = [...videos].filter((video: any) => {
      const shouldShowOnHome = video?.cross_post_profile !== false;
      const scheduleValue = video?.scheduled_for;
      if (!scheduleValue) return shouldShowOnHome;

      const scheduledTime = new Date(scheduleValue).getTime();
      if (Number.isNaN(scheduledTime)) return shouldShowOnHome;

      return shouldShowOnHome && scheduledTime <= Date.now();
    });

    if (feedMode === "following") {
      if (followingIds.size === 0) return [];
      return ranked
        .filter((video: any) => followingIds.has(video.user_id))
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        )
        .slice(0, 40);
    }

    return ranked.slice(0, 40);
  }, [videos, feedMode, followingIds]);

  const mediaFilterCounts = useMemo(() => {
    const videosCount = feedPosts.filter((post: any) => !!post.video_url).length;
    const photosCount = feedPosts.length - videosCount;
    return {
      all: feedPosts.length,
      videos: videosCount,
      photos: photosCount,
    };
  }, [feedPosts]);

  const filteredFeedPosts = useMemo(() => {
    if (mediaFilter === "videos") {
      return feedPosts.filter((post: any) => !!post.video_url);
    }
    if (mediaFilter === "photos") {
      return feedPosts.filter((post: any) => !post.video_url);
    }
    return feedPosts;
  }, [feedPosts, mediaFilter]);

  const postById = useMemo(() => {
    return new Map(feedPosts.map((post: any) => [post.id, post]));
  }, [feedPosts]);

  const inlineSuggestedCreators = useMemo(() => {
    return (followRecommendations || []).slice(0, 4);
  }, [followRecommendations]);

  const shouldShowInlineSuggestions = inlineSuggestedCreators.length > 0 && feedPosts.length >= 2;

  const unreadMessagesCount = useMemo(() => {
    return (conversations || []).reduce((sum: number, convo: any) => sum + (convo.unreadCount || 0), 0);
  }, [conversations]);

  const formatBadgeCount = (value: number) => {
    if (value <= 0) return "";
    if (value > 9) return "9+";
    return String(value);
  };

  useEffect(() => {
    if (serverLikedPosts) setLikedPosts(new Set(serverLikedPosts as Set<string>));
  }, [serverLikedPosts]);

  useEffect(() => {
    if (serverBookmarkedPosts) setBookmarkedPosts(new Set(serverBookmarkedPosts as Set<string>));
  }, [serverBookmarkedPosts]);

  useEffect(() => {
    if (feedMode !== "following") return;
    if (!followRecommendations.length) return;

    const ids = followRecommendations.map((profile: any) => profile.user_id).filter(Boolean);
    if (!ids.length) return;

    const key = `home_following:${ids.join("|")}`;
    if (loggedExposureKeysRef.current.has(key)) return;
    loggedExposureKeysRef.current.add(key);

    void logCreatorRecoExposure.mutateAsync({ suggestedUserIds: ids, surface: "home_following" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedMode, followRecommendations]);

  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 720);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    videoObserverRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLVideoElement;
          const postId = element.dataset.postId;
          if (!postId) continue;

          if (entry.isIntersecting) {
            videoVisibilityRef.current.set(postId, entry.intersectionRatio);
          } else {
            videoVisibilityRef.current.set(postId, 0);
          }
        }

        const currentActiveId = activeVideoIdRef.current;
        const currentActiveRatio = currentActiveId
          ? videoVisibilityRef.current.get(currentActiveId) ?? 0
          : 0;

        let bestPostId: string | null = null;
        let bestRatio = ACTIVE_VIDEO_SWITCH_VISIBILITY;
        videoVisibilityRef.current.forEach((ratio, postId) => {
          if (ratio >= bestRatio) {
            bestRatio = ratio;
            bestPostId = postId;
          }
        });

        let nextActiveId: string | null = null;
        if (currentActiveId && currentActiveRatio >= ACTIVE_VIDEO_KEEP_VISIBILITY) {
          nextActiveId = currentActiveId;
        }

        if (bestPostId) {
          const shouldSwitchFromCurrent =
            !nextActiveId ||
            nextActiveId !== bestPostId ||
            (nextActiveId === bestPostId && currentActiveRatio < ACTIVE_VIDEO_SWITCH_VISIBILITY);
          if (shouldSwitchFromCurrent) {
            nextActiveId = bestPostId;
          }
        }

        activeVideoIdRef.current = nextActiveId;

        videoElementsRef.current.forEach((element, postId) => {
          if (postId === nextActiveId) {
            if (!autoplayVideos) {
              element.pause();
              return;
            }
            element.muted = isFeedMuted;
            const playAttempt = element.play();
            if (playAttempt && typeof playAttempt.catch === "function") {
              playAttempt.catch(() => undefined);
            }
          } else {
            element.pause();
          }
        });

      },
      {
        threshold: [0, 0.25, ACTIVE_VIDEO_KEEP_VISIBILITY, ACTIVE_VIDEO_SWITCH_VISIBILITY, 0.8, 1],
      },
    );

    const onVisibilityChange = () => {
      if (!document.hidden) return;
      videoVisibilityRef.current.forEach((_, postId) => {
        videoVisibilityRef.current.set(postId, 0);
      });
      activeVideoIdRef.current = null;
      videoElementsRef.current.forEach((element) => element.pause());
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      videoObserverRef.current?.disconnect();
      videoObserverRef.current = null;
    };
  }, [autoplayVideos, isFeedMuted]);

  useEffect(() => {
    const activeIds = new Set(feedPosts.map((post: any) => post.id));
    const observer = videoObserverRef.current;

    videoElementsRef.current.forEach((element, postId) => {
      if (!activeIds.has(postId)) {
        observer?.unobserve(element);
        element.pause();
        videoElementsRef.current.delete(postId);
        videoVisibilityRef.current.delete(postId);
        if (activeVideoIdRef.current === postId) {
          activeVideoIdRef.current = null;
        }
      }
    });
  }, [feedPosts]);

  const handleDoubleTapLike = async (postId: string) => {
    if (likedPosts.has(postId)) return;

    await handleToggleLike(postId, true);
    setHeartBurstId(postId);
    window.setTimeout(() => {
      setHeartBurstId((current) => (current === postId ? null : current));
    }, 650);
  };

  const handleToggleLike = async (postId: string, forceLike?: boolean) => {
    if (!user) {
      toast.error("Please sign in to like posts");
      return;
    }
    if (pendingLikeIds.has(postId)) return;

    const currentlyLiked = likedPosts.has(postId);
    const nextLiked = forceLike ?? !currentlyLiked;

    setPendingLikeIds((current) => {
      const next = new Set(current);
      next.add(postId);
      return next;
    });

    setLikedPosts((current) => {
      const next = new Set(current);
      if (nextLiked) next.add(postId);
      else next.delete(postId);
      return next;
    });

    try {
      await toggleLike.mutateAsync({ videoId: postId, isLiked: currentlyLiked });
      if (nextLiked) {
        void trackVideoEvent.mutateAsync({
          videoId: postId,
          eventType: "like",
        });
      }
    } catch {
      setLikedPosts((current) => {
        const next = new Set(current);
        if (currentlyLiked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      toast.error("Could not update like");
    } finally {
      setPendingLikeIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  };

  const handleToggleBookmark = async (postId: string) => {
    if (!user) {
      toast.error("Please sign in to save posts");
      return;
    }
    if (pendingBookmarkIds.has(postId)) return;

    const currentlyBookmarked = bookmarkedPosts.has(postId);

    setPendingBookmarkIds((current) => {
      const next = new Set(current);
      next.add(postId);
      return next;
    });

    setBookmarkedPosts((current) => {
      const next = new Set(current);
      if (currentlyBookmarked) next.delete(postId);
      else next.add(postId);
      return next;
    });

    try {
      await toggleBookmark.mutateAsync({ videoId: postId, isBookmarked: currentlyBookmarked });
      toast.success(currentlyBookmarked ? "Removed from saved" : "Saved to bookmarks");
    } catch {
      setBookmarkedPosts((current) => {
        const next = new Set(current);
        if (currentlyBookmarked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      toast.error("Could not update save");
    } finally {
      setPendingBookmarkIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  };

  const getLikeCount = (post: any) => {
    const base = post.likes_count || 0;
    const currentlyLiked = likedPosts.has(post.id);
    const serverLiked = serverLikedPosts?.has(post.id) ?? false;
    if (currentlyLiked === serverLiked) return base;
    return currentlyLiked ? base + 1 : Math.max(0, base - 1);
  };

  const markImageLoaded = (postId: string) => {
    setLoadedImageIds((current) => {
      if (current.has(postId)) return current;
      const next = new Set(current);
      next.add(postId);
      return next;
    });
  };

  const handleOpenCreate = (createType?: "story") => {
    setShowCreateOptions(false);
    if (createType === "story") {
      navigate("/create", { state: { createType: "story" } });
      return;
    }
    navigate("/create");
  };

  const handleCopyPostLink = async (postId: string) => {
    if (postActionPending) return;
    setPostActionPending("copy");
    try {
      const post = postById.get(postId);
      const url = post?.user_id
        ? `${window.location.origin}/profile/${post.user_id}`
        : `${window.location.origin}/`;
      await navigator.clipboard.writeText(url);
      toast.success("Post link copied");
      setActivePostActions(null);
    } catch {
      toast.error("Could not copy link");
    } finally {
      setPostActionPending(null);
    }
  };

  const handleSharePost = async (postId: string) => {
    const registerShare = async () => {
      await shareVideo.mutateAsync({ videoId: postId });
      void trackVideoEvent.mutateAsync({ videoId: postId, eventType: "share" });
    };

    const post = postById.get(postId);
    const url = post?.user_id
      ? `${window.location.origin}/profile/${post.user_id}`
      : `${window.location.origin}/`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Opium post",
          text: "Check this post on Opium",
          url,
        });
        await registerShare();
        toast.success("Post shared");
        return;
      } catch (error) {
        void error;
      }
    }

    await handleCopyPostLink(postId);
    try {
      await registerShare();
    } catch {
      toast.error("Could not register share");
    }
  };

  const handleRefreshFeed = async () => {
    const result = await refetch();
    if (result.error) {
      toast.error("Could not refresh feed");
      return;
    }
    toast.success("Feed refreshed");
  };

  const triggerHaptic = (durationMs = 12) => {
    const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
    if (typeof nav.vibrate === "function") {
      nav.vibrate(durationMs);
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY > 2) {
      isPullTrackingRef.current = false;
      return;
    }
    if (event.touches.length !== 1) {
      isPullTrackingRef.current = false;
      return;
    }

    isPullTrackingRef.current = true;
    pullStartYRef.current = event.touches[0].clientY;
    pullTriggeredRef.current = false;
    pullThresholdHapticSentRef.current = false;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isPullTrackingRef.current || isPullRefreshing) return;

    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = currentY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    if (window.scrollY > 2) {
      isPullTrackingRef.current = false;
      setPullDistance(0);
      return;
    }

    event.preventDefault();
    const easedDistance = Math.min(PULL_REFRESH_MAX, delta * 0.45);
    if (easedDistance >= PULL_REFRESH_TRIGGER && !pullThresholdHapticSentRef.current) {
      pullThresholdHapticSentRef.current = true;
      triggerHaptic();
    }
    if (easedDistance < PULL_REFRESH_TRIGGER) {
      pullThresholdHapticSentRef.current = false;
    }
    setPullDistance(easedDistance);
  };

  const handleTouchEnd = async () => {
    if (!isPullTrackingRef.current || isPullRefreshing) {
      setPullDistance(0);
      return;
    }

    isPullTrackingRef.current = false;

    if (pullDistance >= PULL_REFRESH_TRIGGER && !pullTriggeredRef.current) {
      pullTriggeredRef.current = true;
      setIsPullRefreshing(true);
      try {
        await handleRefreshFeed();
      } finally {
        setIsPullRefreshing(false);
      }
    }

    setPullDistance(0);
    pullThresholdHapticSentRef.current = false;
  };

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleHidePost = async (postId: string) => {
    if (postActionPending) return;
    setPostActionPending("hide");
    try {
      await hideVideo.mutateAsync({ videoId: postId });
      toast.success("Post hidden from your feed");
      setActivePostActions(null);
    } catch {
      toast.error("Could not hide post");
    } finally {
      setPostActionPending(null);
    }
  };

  const handleReportPost = async (postId: string) => {
    if (postActionPending) return;
    setPostActionPending("report");
    try {
      await reportVideo.mutateAsync({ videoId: postId, reason: "inappropriate" });
      toast.success("Report submitted");
      setActivePostActions(null);
    } catch {
      toast.error("Could not report post");
    } finally {
      setPostActionPending(null);
    }
  };

  return (
    <div
      className="ig-screen ig-screen-spring ig-modern-page min-h-screen bg-background pb-24 pt-safe"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => {
        void handleTouchEnd();
      }}
      onTouchCancel={() => {
        isPullTrackingRef.current = false;
        setPullDistance(0);
        pullThresholdHapticSentRef.current = false;
      }}
    >
      {/* Instagram-style sticky header */}
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        {/* Pull to refresh indicator */}
        <div
          className="overflow-hidden transition-all duration-200"
          style={{ height: `${isPullRefreshing ? 40 : Math.min(40, pullDistance)}px` }}
        >
          <div className="flex h-10 items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
            <RefreshCcw
              className={`h-3.5 w-3.5 ${isPullRefreshing || pullDistance >= PULL_REFRESH_TRIGGER ? "animate-spin" : ""}`}
            />
            <span>
              {isPullRefreshing
                ? "Refreshing..."
                : pullDistance >= PULL_REFRESH_TRIGGER
                  ? "Release to refresh"
                  : "Pull to refresh"}
            </span>
          </div>
        </div>

        {/* Top bar: Logo + action icons */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Opium
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/notifications")}
              className={topIconButtonClass}
              aria-label="Notifications"
            >
              <Heart className="h-[22px] w-[22px]" />
              {unreadNotifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {formatBadgeCount(unreadNotifications)}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate("/inbox")}
              className={topIconButtonClass}
              aria-label="Messages"
            >
              <MessageCircle className="h-[22px] w-[22px]" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {formatBadgeCount(unreadMessagesCount)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* For You / Following tabs */}
        <div className="flex items-center justify-center gap-0">
          <button
            onClick={() => setFeedMode("forYou")}
            aria-pressed={feedMode === "forYou"}
            className={`relative flex-1 py-2.5 text-center text-[13px] font-semibold transition-colors ${
              feedMode === "forYou" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            For You
            {feedMode === "forYou" && (
              <span className="absolute bottom-0 left-1/2 h-[2px] w-12 -translate-x-1/2 rounded-full bg-foreground" />
            )}
          </button>
          <button
            onClick={() => setFeedMode("following")}
            aria-pressed={feedMode === "following"}
            className={`relative flex-1 py-2.5 text-center text-[13px] font-semibold transition-colors ${
              feedMode === "following" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Following
            {feedMode === "following" && (
              <span className="absolute bottom-0 left-1/2 h-[2px] w-16 -translate-x-1/2 rounded-full bg-foreground" />
            )}
          </button>
        </div>
      </div>

      <div className="border-b border-border/60 pt-1">
        <StoriesBar />
      </div>

      {isLoading ? (
        <div className="space-y-0 pt-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="ig-list-item-enter overflow-hidden border-b border-border/60 bg-background"
              style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
            >
              <div className="flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="ig-shimmer h-9 w-9 animate-pulse rounded-full bg-secondary" />
                  <div className="space-y-1.5">
                    <div className="ig-shimmer h-3 w-24 animate-pulse rounded bg-secondary" />
                    <div className="ig-shimmer h-2.5 w-16 animate-pulse rounded bg-secondary" />
                  </div>
                </div>
                <div className="ig-shimmer h-5 w-5 animate-pulse rounded bg-secondary" />
              </div>
              <div className="ig-shimmer aspect-[4/5] w-full animate-pulse bg-secondary" />
              <div className="space-y-2 px-3 py-3">
                <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-secondary" />
                <div className="h-2.5 w-12 animate-pulse rounded bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-0 pt-2">
          {feedPosts.map((post: any, index: number) => (
            <Fragment key={post.id}>
              <article
                className="ig-list-item-enter overflow-hidden border-b border-border/60 bg-background"
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              >
                <div className="flex items-center justify-between px-3 py-3">
                  <button
                    onClick={() => navigate(`/profile/${post.user_id}`)}
                    className="flex items-center gap-3"
                  >
                    <div className="h-9 w-9 overflow-hidden rounded-full bg-secondary">
                      {post.profiles?.avatar_url ? (
                        <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                          {(post.profiles?.display_name?.[0] || "U").toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {post.profiles?.display_name || "User"}
                        </p>
                        {post.profiles?.is_verified && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground">@{post.profiles?.username || "user"}</p>
                    </div>
                  </button>
                  <button
                    className="ig-tap rounded-full p-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setActivePostActions(post)}
                    aria-label="Post actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                {(post.video_url || post.thumbnail_url) && (
                  <div
                    className="relative aspect-[4/5] overflow-hidden bg-secondary"
                    onDoubleClick={() => handleDoubleTapLike(post.id)}
                  >
                    {!loadedImageIds.has(post.id) && (
                      <div className="absolute inset-0 animate-pulse bg-secondary" />
                    )}
                    {post.video_url ? (
                      <video
                        data-post-id={post.id}
                        ref={(node) => {
                          const current = videoElementsRef.current.get(post.id);
                          if (current && current !== node) {
                            videoObserverRef.current?.unobserve(current);
                          }

                          if (!node) {
                            if (current) {
                              videoObserverRef.current?.unobserve(current);
                              current.pause();
                            }
                            videoElementsRef.current.delete(post.id);
                            videoVisibilityRef.current.delete(post.id);
                            return;
                          }

                          videoElementsRef.current.set(post.id, node);
                          videoVisibilityRef.current.set(post.id, 0);
                          videoObserverRef.current?.observe(node);
                        }}
                        src={post.video_url}
                        poster={post.thumbnail_url || undefined}
                        autoPlay={lowBandwidthMode ? false : autoplayVideos}
                        muted={isFeedMuted}
                        loop={loopVideos}
                        playsInline
                        preload={lowBandwidthMode ? (index === 0 ? "metadata" : "none") : index < 2 ? "auto" : "metadata"}
                        onLoadedData={() => markImageLoaded(post.id)}
                        onError={() => markImageLoaded(post.id)}
                        className={`h-full w-full object-cover transition-opacity duration-300 ${
                          loadedImageIds.has(post.id) ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    ) : (
                      <img
                        src={post.thumbnail_url}
                        alt=""
                        loading={index < 2 ? "eager" : "lazy"}
                        decoding="async"
                        onLoad={() => markImageLoaded(post.id)}
                        onError={() => markImageLoaded(post.id)}
                        className={`h-full w-full object-cover transition-opacity duration-300 ${
                          loadedImageIds.has(post.id) ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    )}
                    {heartBurstId === post.id && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="heart-burst">
                          <Heart className="h-16 w-16 text-primary" fill="currentColor" />
                        </div>
                      </div>
                    )}
                    {post.video_url && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsFeedMuted((current) => !current);
                        }}
                        className="absolute right-3 top-3 z-10 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm"
                        aria-label={isFeedMuted ? "Unmute video" : "Mute video"}
                      >
                        {isFeedMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                )}

                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        className={`${feedIconButtonClass} ${likedPosts.has(post.id) ? "text-primary" : "text-foreground"}`}
                        onClick={() => void handleToggleLike(post.id)}
                        aria-label="Like"
                        aria-pressed={likedPosts.has(post.id)}
                        disabled={pendingLikeIds.has(post.id)}
                      >
                        <Heart className="h-5 w-5" fill={likedPosts.has(post.id) ? "currentColor" : "none"} />
                      </button>
                      <button
                        className={feedIconButtonClass}
                        aria-label="Comment"
                        onClick={() => setActiveCommentsVideoId(post.id)}
                      >
                        <MessageCircle className="h-5 w-5" />
                      </button>
                      <button className={feedIconButtonClass} aria-label="Share" onClick={() => handleSharePost(post.id)}>
                        <Share2 className="h-5 w-5" />
                      </button>
                    </div>
                    <button
                      className={`${feedIconButtonClass} ${bookmarkedPosts.has(post.id) ? "text-primary" : "text-foreground"}`}
                      aria-label="Save"
                      aria-pressed={bookmarkedPosts.has(post.id)}
                      disabled={pendingBookmarkIds.has(post.id)}
                      onClick={() => void handleToggleBookmark(post.id)}
                    >
                      <Bookmark
                        className="h-5 w-5"
                        fill={bookmarkedPosts.has(post.id) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>

                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    {hideLikeCount ? "Liked by others" : `${getLikeCount(post).toLocaleString()} likes`}
                  </p>

                  <p className="mt-1 text-sm leading-snug text-foreground/90">
                    <span className="font-semibold text-foreground">
                      {post.profiles?.username || "user"}
                    </span>{" "}
                    {post.description || "No text content for this post yet."}
                  </p>

                  {!!post.comments_count && (
                    <button
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setActiveCommentsVideoId(post.id)}
                    >
                      View all {post.comments_count} comments
                    </button>
                  )}

                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {post.created_at ? formatTimeAgo(post.created_at) : ""}
                  </p>
                </div>
              </article>

              {shouldShowInlineSuggestions && index === 1 && mediaFilter !== "photos" && (
                <section className="border-b border-border/60 bg-background px-3 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Suggested accounts
                    </p>
                    <button
                      className="text-[11px] font-semibold text-foreground/80 hover:text-foreground"
                      onClick={() => navigate("/discover")}
                    >
                      See all
                    </button>
                  </div>
                  <div className="space-y-2">
                    {inlineSuggestedCreators.map((suggested: any) => (
                      <div
                        key={suggested.user_id}
                        className="flex items-center justify-between rounded-lg border border-border/80 bg-background px-3 py-2"
                      >
                        <button
                          onClick={() => {
                            void logCreatorRecoClick.mutateAsync({
                              suggestedUserId: suggested.user_id,
                              surface: "home_following",
                            });
                            navigate(`/profile/${suggested.user_id}`);
                          }}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <div className="h-8 w-8 overflow-hidden rounded-full bg-secondary">
                            {suggested.avatar_url ? (
                              <img src={suggested.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                                {(suggested.display_name?.[0] || suggested.username?.[0] || "U").toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="truncate text-xs font-semibold text-foreground">{suggested.display_name || "User"}</p>
                            <p className="truncate text-[11px] text-muted-foreground">@{suggested.username || "user"}</p>
                          </div>
                        </button>

                        <button
                          className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
                          disabled={toggleFollow.isPending}
                          onClick={async () => {
                            try {
                              const result = await toggleFollow.mutateAsync({
                                targetUserId: suggested.user_id,
                                isFollowing: false,
                                targetIsPrivate: !!suggested.is_private,
                              });
                              toast.success(result === "requested" ? "Follow request sent" : "Following");
                            } catch (error: any) {
                              toast.error(error.message || "Could not follow user");
                            }
                          }}
                        >
                          {suggested.is_private ? "Request" : "Follow"}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </Fragment>
          ))}

          {filteredFeedPosts.length > 0 && (
            <div className="bg-background px-4 py-6 text-center">
              <p className="text-sm font-semibold text-foreground">You're all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">You’ve seen the latest posts in Home.</p>
            </div>
          )}

          {filteredFeedPosts.length === 0 && (
            <div className="panel-surface mx-3 rounded-xl px-4 py-12 text-center">
              <p className="text-sm font-semibold text-foreground">
                {feedMode === "following"
                  ? "No posts from people you follow"
                  : mediaFilter === "videos"
                    ? "No video posts yet"
                    : mediaFilter === "photos"
                      ? "No photo posts yet"
                      : "No feed posts yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {feedMode === "following"
                  ? "Follow more creators to personalize your Home feed."
                  : mediaFilter === "videos"
                    ? "Switch to All or Photos to keep exploring new content."
                    : mediaFilter === "photos"
                      ? "Switch to All or Videos to keep exploring new content."
                      : "Content from creators will appear here."}
              </p>
              <Button className="mt-4" variant="secondary" onClick={() => navigate("/discover")}>
                Explore Discover
              </Button>

              {feedMode === "following" && followRecommendations.length > 0 && (
                <div className="mt-6 text-left">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Suggested creators
                  </p>
                  <div className="space-y-2">
                    {followRecommendations.slice(0, 3).map((profile: any) => (
                      <div
                        key={profile.user_id}
                        className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2"
                      >
                        <button
                          onClick={() => {
                            void logCreatorRecoClick.mutateAsync({
                              suggestedUserId: profile.user_id,
                              surface: "home_following",
                            });
                            navigate(`/profile/${profile.user_id}`);
                          }}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <div className="h-8 w-8 overflow-hidden rounded-full bg-secondary">
                            {profile.avatar_url ? (
                              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                                {(profile.display_name?.[0] || profile.username?.[0] || "U").toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {profile.display_name || "User"}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">@{profile.username || "user"}</p>
                          </div>
                        </button>

                        <button
                          className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
                          disabled={toggleFollow.isPending}
                          onClick={async () => {
                            try {
                              const result = await toggleFollow.mutateAsync({
                                targetUserId: profile.user_id,
                                isFollowing: false,
                                targetIsPrivate: !!profile.is_private,
                              });
                              toast.success(result === "requested" ? "Follow request sent" : "Following");
                            } catch (error: any) {
                              toast.error(error.message || "Could not follow user");
                            }
                          }}
                        >
                          {profile.is_private ? "Request" : "Follow"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CommentsSheet
        videoId={activeCommentsVideoId || ""}
        open={!!activeCommentsVideoId}
        onOpenChange={(open) => {
          if (!open) setActiveCommentsVideoId(null);
        }}
      />

      <Sheet open={showCreateOptions} onOpenChange={setShowCreateOptions}>
        <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background p-0">
          <div className="border-b border-border px-4 py-3 text-center">
            <SheetTitle className="text-sm font-semibold">Upload</SheetTitle>
          </div>
          <div className="space-y-1 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <button
              onClick={() => handleOpenCreate()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground hover:bg-secondary"
            >
              <Images className="h-4 w-4" /> Upload post or Clippy
            </button>
            <button
              onClick={() => handleOpenCreate("story")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground hover:bg-secondary"
            >
              <Clapperboard className="h-4 w-4" /> Upload story
            </button>
            <button
              onClick={() => setShowCreateOptions(false)}
              className="w-full rounded-xl bg-secondary px-3 py-3 text-sm font-semibold text-foreground"
            >
              Cancel
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!activePostActions} onOpenChange={(open) => !open && setActivePostActions(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background p-0">
          <div className="border-b border-border px-4 py-3 text-center">
            <SheetTitle className="text-sm font-semibold">Post actions</SheetTitle>
          </div>
          <div className="p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <button
              onClick={() => activePostActions && handleReportPost(activePostActions.id)}
              disabled={!!postActionPending}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground hover:bg-secondary"
            >
              <Flag className="h-4 w-4" /> Report
            </button>
            <button
              onClick={() => activePostActions && handleHidePost(activePostActions.id)}
              disabled={!!postActionPending}
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground hover:bg-secondary"
            >
              <EyeOff className="h-4 w-4" /> Hide
            </button>
            <button
              onClick={() => activePostActions && handleCopyPostLink(activePostActions.id)}
              disabled={!!postActionPending}
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground hover:bg-secondary"
            >
              <Link2 className="h-4 w-4" /> Copy link
            </button>
            <button
              onClick={() => setActivePostActions(null)}
              disabled={!!postActionPending}
              className="mt-2 w-full rounded-xl bg-secondary px-3 py-3 text-sm font-semibold text-foreground"
            >
              Cancel
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {showBackToTop && (
        <button
          onClick={handleBackToTop}
          className="ig-list-item-enter fixed bottom-28 right-4 z-40 lift-on-tap ig-icon-btn rounded-full border border-border/80 bg-background/95 p-3 text-foreground shadow-lg backdrop-blur"
          aria-label="Back to top"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default HomeTan;
