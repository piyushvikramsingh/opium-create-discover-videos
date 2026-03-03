import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useTrendingSounds,
  useSearchSounds,
  useSound,
  useVideosBySound,
} from "@/hooks/useSounds";
import { ArrowLeft, Music, Search, Play, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatCount(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

/**
 * Sound browser page — /sounds
 * Lists trending sounds, search, tap to see sound detail.
 */
export default function SoundsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const { data: trending = [], isLoading: trendingLoading } = useTrendingSounds();
  const { data: searchResults = [], isLoading: searchLoading } = useSearchSounds(query);

  const sounds = query.length >= 2 ? searchResults : trending;
  const isLoading = query.length >= 2 ? searchLoading : trendingLoading;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Sounds</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search sounds..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-2">
        {!query && (
          <div className="flex items-center gap-2 px-2 py-3 text-sm font-semibold text-muted-foreground">
            <TrendingUp className="w-4 h-4" />
            <span>Trending Sounds</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : sounds.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {query ? "No sounds found" : "No trending sounds yet"}
          </div>
        ) : (
          <div className="space-y-1">
            {sounds.map((sound) => (
              <button
                key={sound.id}
                onClick={() => navigate(`/sounds/${sound.id}`)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition text-left"
              >
                <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
                  {sound.cover_url ? (
                    <img
                      src={sound.cover_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{sound.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{sound.artist}</p>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Play className="w-3 h-3" />
                  {formatCount(sound.use_count)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sound detail page — /sounds/:id
 * Shows sound info + grid of videos using this sound.
 */
export function SoundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: sound, isLoading } = useSound(id ?? "");
  const { data: videos = [] } = useVideosBySound(id ?? "");

  if (isLoading || !sound) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="relative bg-gradient-to-b from-primary/20 to-background pb-6">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex flex-col items-center px-4">
          <div className="w-20 h-20 rounded-xl bg-secondary overflow-hidden mb-3">
            {sound.cover_url ? (
              <img src={sound.cover_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <h2 className="font-bold text-lg text-center">{sound.title}</h2>
          <p className="text-sm text-muted-foreground">{sound.artist}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCount(sound.use_count)} videos
          </p>
        </div>

        <div className="px-4 mt-4">
          <Button
            className="w-full"
            onClick={() => {
              navigate("/create", { state: { soundId: sound.id } });
            }}
          >
            <Music className="w-4 h-4 mr-2" />
            Use This Sound
          </Button>
        </div>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5">
        {videos.map((video: any) => (
          <div
            key={video.id}
            className="aspect-[9/16] bg-secondary relative cursor-pointer hover:opacity-90"
            onClick={() => navigate(`/?v=${video.id}`)}
          >
            {video.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Play className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {videos.length === 0 && (
          <div className="col-span-3 py-20 text-center text-muted-foreground">
            No videos yet using this sound
          </div>
        )}
      </div>
    </div>
  );
}
