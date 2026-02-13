import VideoCard from "@/components/VideoCard";
import TopNav from "@/components/TopNav";
import { useVideos, useUserLikes, useUserBookmarks } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { mockVideos } from "@/data/mockVideos";

const Index = () => {
  const { user } = useAuth();
  const { data: videos } = useVideos();
  const { data: likedSet } = useUserLikes(user?.id);
  const { data: bookmarkedSet } = useUserBookmarks(user?.id);

  // If no real videos exist yet, show mock feed images as placeholders
  const hasRealVideos = videos && videos.length > 0;

  return (
    <div className="snap-container scrollbar-hide">
      <TopNav />
      {hasRealVideos ? (
        videos.map((video: any) => (
          <VideoCard
            key={video.id}
            video={video}
            isLiked={likedSet?.has(video.id) ?? false}
            isBookmarked={bookmarkedSet?.has(video.id) ?? false}
          />
        ))
      ) : (
        // Fallback mock feed
        mockVideos.map((mock) => (
          <div key={mock.id} className="snap-item relative w-full overflow-hidden bg-background">
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
