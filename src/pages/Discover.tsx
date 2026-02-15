import { Search, Play, TrendingUp, Users } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useVideos } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { mockVideos } from "@/data/mockVideos";

const trendingTags = [
  "dance", "viral", "foodie", "cats",
  "streetstyle", "comedy", "music", "fitness", "art",
];

function useSearchProfiles(query: string) {
  return useQuery({
    queryKey: ["search-profiles", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}

const Discover = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const { data: videos } = useVideos();
  const { data: searchProfiles } = useSearchProfiles(searchQuery);

  const isSearching = searchQuery.length >= 2;

  // Filter videos by search query or tag
  const filteredVideos = useMemo(() => {
    const source = videos && videos.length > 0 ? videos : null;
    if (!source) return null;

    if (isSearching) {
      const q = searchQuery.toLowerCase();
      return source.filter(
        (v: any) =>
          v.description?.toLowerCase().includes(q) ||
          v.music?.toLowerCase().includes(q) ||
          v.profiles?.username?.toLowerCase().includes(q)
      );
    }

    if (activeTag) {
      const tag = activeTag.toLowerCase();
      return source.filter((v: any) =>
        v.description?.toLowerCase().includes(`#${tag}`) ||
        v.description?.toLowerCase().includes(tag)
      );
    }

    // Default: show all sorted by popularity
    return [...source].sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0));
  }, [videos, searchQuery, activeTag, isSearching]);

  const hasRealVideos = filteredVideos && filteredVideos.length > 0;

  return (
    <div className="min-h-screen bg-background pb-20 pt-4">
      {/* Search bar */}
      <div className="px-4 py-2">
        <div className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3">
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
            <button onClick={() => setSearchQuery("")} className="text-xs text-muted-foreground">
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
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              activeTag === tag
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            #{tag}
          </button>
        ))}
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
                className="flex shrink-0 flex-col items-center gap-1.5 w-20"
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
        <div className="px-4 pb-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <TrendingUp className="h-3.5 w-3.5" />
            {activeTag ? `#${activeTag}` : "Trending"}
          </p>
        </div>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5">
        {hasRealVideos
          ? filteredVideos.map((video: any) => (
              <button
                key={video.id}
                onClick={() => navigate("/")}
                className="relative aspect-[9/16] overflow-hidden bg-secondary text-left"
              >
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : video.video_url ? (
                  <video src={video.video_url} className="h-full w-full object-cover" muted preload="metadata" />
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
            ))
          : // Fallback mock grid
            [...mockVideos, ...mockVideos].map((video, i) => (
              <div key={`${video.id}-${i}`} className="relative aspect-[9/16] overflow-hidden bg-secondary">
                <img src={video.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute bottom-1 left-1 flex items-center gap-1">
                  <Play className="h-3 w-3 text-white" fill="white" />
                  <span className="text-[10px] font-medium text-white">
                    {(video.likes / 1000).toFixed(0)}K
                  </span>
                </div>
              </div>
            ))}
      </div>

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
