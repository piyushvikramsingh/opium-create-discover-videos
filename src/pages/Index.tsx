import VideoCard from "@/components/VideoCard";
import TopNav from "@/components/TopNav";
import { useVideos, useUserLikes, useUserBookmarks } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { mockVideos } from "@/data/mockVideos";
import { useEffect, useMemo, useRef, useState } from "react";

const Index = () => {
  const { user } = useAuth();
  const { data: videos } = useVideos();
  const { data: likedSet } = useUserLikes(user?.id);
  const { data: bookmarkedSet } = useUserBookmarks(user?.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId = 0;
    const updateActiveIndex = () => {
      rafId = 0;
      const itemHeight = el.clientHeight || window.innerHeight;
      if (!itemHeight) return;
      const nextIndex = Math.round(el.scrollTop / itemHeight);
      setActiveIndex((prev) => (prev === nextIndex ? prev : nextIndex));
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateActiveIndex);
    };

    updateActiveIndex();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // If no real videos exist yet, show mock feed images as placeholders
  const hasRealVideos = videos && videos.length > 0;
  const feedVideos = useMemo(() => videos ?? [], [videos]);

  return (
    <div ref={containerRef} className="snap-container scrollbar-hide fade-in" aria-label="video-feed">
      <TopNav />
      {hasRealVideos ? (
        feedVideos.map((video: any, index: number) => (
          <VideoCard
            key={video.id}
            video={video}
            isLiked={likedSet?.has(video.id) ?? false}
            isBookmarked={bookmarkedSet?.has(video.id) ?? false}
            isNearActive={Math.abs(index - activeIndex) <= 1}
          />
        ))
      ) : (
        // Fallback mock feed
        mockVideos.map((mock) => (
          <div key={mock.id} className="snap-item relative w-full overflow-hidden bg-background fade-in">
            <img src={mock.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/30" />
            <div className="absolute bottom-20 left-3 right-20">
              <p className="text-base font-bold text-foreground">{mock.username}</p>
              <p className="mt-1 text-sm text-foreground/90 leading-snug line-clamp-2">{mock.description}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default Index;
