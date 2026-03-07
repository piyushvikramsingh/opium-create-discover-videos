import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StoryViewer } from "./StoryViewer";
import type { StoryGroup } from "./StoryViewer";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useData";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export const StoriesBar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: storyGroups = [], isLoading } = useStories();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);

  const sortedStoryGroups = useMemo(() => {
    const groups = [...(storyGroups as StoryGroup[])];
    return groups.sort((a, b) => {
      const aUnviewed = !!a.hasUnviewed;
      const bUnviewed = !!b.hasUnviewed;
      if (aUnviewed !== bUnviewed) return aUnviewed ? -1 : 1;

      const aLatest = Math.max(...(a.stories || []).map((story) => new Date(story.created_at).getTime()));
      const bLatest = Math.max(...(b.stories || []).map((story) => new Date(story.created_at).getTime()));
      return bLatest - aLatest;
    });
  }, [storyGroups]);

  if (isLoading) {
    return (
      <div className="ig-modern-page flex gap-4 p-4 overflow-x-auto hide-scrollbar">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-[64px]">
            <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse" />
            <div className="w-12 h-3 bg-gray-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const handleOpenStory = (index: number) => {
    const group = sortedStoryGroups[index];
    const firstUnviewedIndex = (group?.stories || []).findIndex((story) => !story.viewed);
    setSelectedGroupIndex(index);
    setSelectedStoryIndex(firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0);
    setViewerOpen(true);
  };

  return (
    <>
      <div className="ig-modern-page flex gap-4 px-4 py-3 overflow-x-auto hide-scrollbar border-b border-border/70">
        {/* Your story / Add story */}
        <button
          onClick={() => navigate("/create", { state: { createType: "story" } })}
          className="flex flex-col items-center gap-1 min-w-[64px] group"
        >
          <div className="relative">
            <Avatar className="w-16 h-16 border-2 border-border/70 bg-background shadow-sm">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback>
                {profile?.display_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center border-2 border-background">
              <Plus className="w-3 h-3 text-white" />
            </div>
          </div>
          <span className="ig-type-caption font-medium">Your story</span>
        </button>

        {/* Other users' stories */}
        {sortedStoryGroups.map((group, index) => (
          <button
            key={group.user.id}
            onClick={() => handleOpenStory(index)}
            className={cn(
              "flex flex-col items-center gap-1 min-w-[64px] group",
              !group.hasUnviewed && "opacity-60"
            )}
          >
            {group.hasCloseFriendsStory && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                Close
              </span>
            )}
            <div
              className={cn(
                "relative p-0.5 rounded-full transition-all",
                group.hasUnviewed
                  ? group.hasCloseFriendsStory
                    ? "bg-gradient-to-tr from-emerald-400 via-emerald-500 to-teal-500"
                    : "bg-gradient-to-tr from-amber-400 via-pink-500 to-fuchsia-500"
                  : "bg-border/70"
              )}
            >
              {Array.isArray(group.stories) &&
                group.stories.some((story) => Date.now() - new Date(story.created_at).getTime() < 10 * 60 * 1000) && (
                  <span className="absolute -right-1 -top-1 rounded bg-primary px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground">
                    Live
                  </span>
                )}
              <div className="p-0.5 bg-background rounded-full">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={group.user.avatar_url} />
                  <AvatarFallback>
                    {group.user.display_name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            <span
              className={cn(
                "ig-type-caption text-center max-w-[64px] truncate",
                group.hasUnviewed
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {group.user.username}
            </span>
          </button>
        ))}
      </div>

      {viewerOpen && sortedStoryGroups.length > 0 && (
        <StoryViewer
          storyGroups={sortedStoryGroups}
          initialGroupIndex={selectedGroupIndex}
          initialStoryIndex={selectedStoryIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
};
