import { Heart, MessageCircle, Share2, Bookmark, Music, Plus, Volume2, VolumeX } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToggleLike, useToggleBookmark } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";

function formatCount(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

interface VideoCardProps {
  video: {
    id: string;
    description: string;
    music: string;
    thumbnail_url: string;
    video_url: string;
    likes_count: number;
    comments_count: number;
    shares_count: number;
    bookmarks_count: number;
    user_id: string;
    profiles?: {
      username: string;
      display_name: string;
      avatar_url: string;
    };
  };
  isLiked: boolean;
  isBookmarked: boolean;
}

const VideoCard = ({ video, isLiked, isBookmarked }: VideoCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toggleLike = useToggleLike();
  const toggleBookmark = useToggleBookmark();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true); // Start muted for autoplay compliance
  const [paused, setPaused] = useState(false);
  const [showUnmuteHint, setShowUnmuteHint] = useState(true);

  // Auto-play when visible, pause when not
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const vid = videoRef.current;
        if (!vid) return;
        if (entry.isIntersecting) {
          vid.muted = true; // Always start muted for autoplay
          setMuted(true);
          vid.play().then(() => {
            setPaused(false);
          }).catch(() => {
            setPaused(true);
          });
        } else {
          vid.pause();
          vid.currentTime = 0;
          setPaused(true);
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setPaused(false);
    } else {
      videoRef.current.pause();
      setPaused(true);
    }
  }, []);

  const handleLike = () => {
    if (!user) { navigate("/auth"); return; }
    toggleLike.mutate({ videoId: video.id, isLiked });
  };

  const handleBookmark = () => {
    if (!user) { navigate("/auth"); return; }
    toggleBookmark.mutate({ videoId: video.id, isBookmarked });
  };

  const profile = video.profiles;
  const avatarUrl = profile?.avatar_url || `https://i.pravatar.cc/100?u=${video.user_id}`;

  const isVideo = !!video.video_url;
  const posterUrl = video.thumbnail_url && video.thumbnail_url.length > 0 ? video.thumbnail_url : undefined;

  return (
    <div ref={containerRef} className="snap-item relative w-full overflow-hidden bg-background">
      {isVideo ? (
        <video
          ref={videoRef}
          src={video.video_url}
          poster={posterUrl}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          playsInline
          muted={muted}
          preload="auto"
          onClick={() => {
            togglePlayPause();
            if (muted) {
              setMuted(false);
              if (videoRef.current) videoRef.current.muted = false;
              setShowUnmuteHint(false);
            }
          }}
        />
      ) : (
        <img
          src={video.thumbnail_url || video.video_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/30 pointer-events-none" />

      {/* Mute toggle */}
      {isVideo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const next = !muted;
            setMuted(next);
            if (videoRef.current) videoRef.current.muted = next;
            setShowUnmuteHint(false);
          }}
          className="absolute right-3 top-16 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        >
          {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
        </button>
      )}

      {/* Unmute hint */}
      {isVideo && muted && showUnmuteHint && !paused && (
        <div className="absolute left-3 top-16 z-10 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm animate-pulse pointer-events-none">
          <VolumeX className="h-3.5 w-3.5 text-white" />
          <span className="text-xs text-white font-medium">Tap to unmute</span>
        </div>
      )}

      {/* Paused indicator */}
      {paused && isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-16 w-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <div className="ml-1 border-l-[18px] border-y-[12px] border-y-transparent border-l-white" />
          </div>
        </div>
      )}

      {/* Right side actions */}
      <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5">
        <div className="relative">
          <img
            src={avatarUrl}
            alt={profile?.display_name || "user"}
            className="h-12 w-12 rounded-full border-2 border-foreground object-cover"
          />
          <button className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Plus className="h-3 w-3 text-primary-foreground" />
          </button>
        </div>

        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <Heart className={`h-7 w-7 transition-all ${isLiked ? "fill-primary text-primary scale-110" : "text-foreground"}`} />
          <span className="text-xs text-foreground font-medium">{formatCount(video.likes_count)}</span>
        </button>

        <button className="flex flex-col items-center gap-1">
          <MessageCircle className="h-7 w-7 text-foreground" />
          <span className="text-xs text-foreground font-medium">{formatCount(video.comments_count)}</span>
        </button>

        <button onClick={handleBookmark} className="flex flex-col items-center gap-1">
          <Bookmark className={`h-7 w-7 transition-all ${isBookmarked ? "fill-primary text-primary scale-110" : "text-foreground"}`} />
          <span className="text-xs text-foreground font-medium">{formatCount(video.bookmarks_count)}</span>
        </button>

        <button className="flex flex-col items-center gap-1">
          <Share2 className="h-7 w-7 text-foreground" />
          <span className="text-xs text-foreground font-medium">{formatCount(video.shares_count)}</span>
        </button>

        <div className="mt-1 h-10 w-10 rounded-full border-2 border-muted bg-secondary animate-spin-slow overflow-hidden">
          <img src={avatarUrl} alt="music" className="h-full w-full object-cover" />
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-3 right-20">
        <p className="text-base font-bold text-foreground">@{profile?.username || "user"}</p>
        <p className="mt-1 text-sm text-foreground/90 leading-snug line-clamp-2">{video.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <Music className="h-3.5 w-3.5 text-foreground" />
          <p className="text-xs text-foreground/80 truncate">{video.music || "original sound"}</p>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
