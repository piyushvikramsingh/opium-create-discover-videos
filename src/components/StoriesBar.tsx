import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StoryViewer } from "./StoryViewer";
import type { StoryGroup } from "./StoryViewer";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useData";
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
      <div className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-hide">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 min-w-[66px]">
            <div className="w-[62px] h-[62px] rounded-full bg-secondary animate-pulse" />
            <div className="w-10 h-2.5 bg-secondary rounded animate-pulse" />
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
      <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
        {/* Your Story */}
        <button
          onClick={() => user ? navigate("/create", { state: { createType: "story" } }) : navigate("/auth")}
          className="flex flex-col items-center gap-1.5 min-w-[66px]"
        >
          <div className="relative">
            <div className="w-[62px] h-[62px] rounded-full bg-secondary overflow-hidden border-[1px] border-border/50">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                  {(profile?.display_name?.[0] || "U").toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary">
              <Plus className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground leading-none">Your story</span>
        </button>

        {/* Other stories */}
        {sortedStoryGroups.map((group, index) => {
          const hasUnviewed = !!group.hasUnviewed;
          return (
            <button
              key={group.userId || index}
              onClick={() => handleOpenStory(index)}
              className="flex flex-col items-center gap-1.5 min-w-[66px]"
            >
              <div
                className={`rounded-full p-[2.5px] ${
                  hasUnviewed
                    ? "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600"
                    : "bg-border/50"
                }`}
              >
                <div className="w-[57px] h-[57px] rounded-full bg-background p-[2px]">
                  <Avatar className="h-full w-full">
                    <AvatarImage src={group.avatarUrl || ""} className="object-cover" />
                    <AvatarFallback className="text-xs font-semibold bg-secondary text-muted-foreground">
                      {(group.username?.[0] || "U").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <span className={`text-[11px] leading-none max-w-[60px] truncate ${
                hasUnviewed ? "text-foreground font-medium" : "text-muted-foreground"
              }`}>
                {group.username || "user"}
              </span>
            </button>
          );
        })}
      </div>

      {viewerOpen && sortedStoryGroups.length > 0 && (
        <StoryViewer
          groups={sortedStoryGroups}
          initialGroupIndex={selectedGroupIndex}
          initialStoryIndex={selectedStoryIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
};
