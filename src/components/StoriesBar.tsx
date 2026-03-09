import { useMemo, useState } from "react";
import { Plus, Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StoryViewer } from "./StoryViewer";
import type { StoryGroup } from "./StoryViewer";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

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
      const aLatest = Math.max(...(a.stories || []).map((s) => new Date(s.created_at).getTime()));
      const bLatest = Math.max(...(b.stories || []).map((s) => new Date(s.created_at).getTime()));
      return bLatest - aLatest;
    });
  }, [storyGroups]);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 min-w-[72px]">
            <div className="w-[68px] h-[68px] rounded-full bg-secondary animate-pulse" />
            <div className="w-10 h-2.5 bg-secondary rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const handleOpenStory = (index: number) => {
    const group = sortedStoryGroups[index];
    const firstUnviewedIndex = (group?.stories || []).findIndex((s) => !s.viewed);
    setSelectedGroupIndex(index);
    setSelectedStoryIndex(firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0);
    setViewerOpen(true);
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
        {/* Your Story — Instagram style */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => user ? navigate("/create", { state: { createType: "story" } }) : navigate("/auth")}
          className="flex flex-col items-center gap-1 min-w-[72px]"
        >
          <div className="relative">
            <div className="w-[68px] h-[68px] rounded-full overflow-hidden border-[1.5px] border-border/40">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-secondary text-lg font-bold text-muted-foreground">
                  {(profile?.display_name?.[0] || "U").toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-[2.5px] border-background bg-primary shadow-md">
              <Plus className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground leading-tight">Your story</span>
        </motion.button>

        {/* Other stories — Instagram gradient ring */}
        {sortedStoryGroups.map((group, index) => {
          const hasUnviewed = !!group.hasUnviewed;
          const isCloseFriend = !!group.hasCloseFriendsStory;
          return (
            <motion.button
              key={group.user?.id || index}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleOpenStory(index)}
              className="flex flex-col items-center gap-1 min-w-[72px]"
            >
              <div className="relative">
                {/* Gradient ring */}
                <div
                  className={`w-[68px] h-[68px] rounded-full p-[2.5px] ${
                    hasUnviewed
                      ? isCloseFriend
                        ? "bg-gradient-to-br from-green-400 to-green-600"
                        : "story-ring-gradient"
                      : "bg-border/40"
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-background p-[2px]">
                    <Avatar className="h-full w-full">
                      <AvatarImage src={group.user?.avatar_url || ""} className="object-cover" />
                      <AvatarFallback className="text-xs font-semibold bg-secondary text-muted-foreground">
                        {(group.user?.username?.[0] || "U").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                {/* Live badge (placeholder) */}
              </div>
              <span className={`text-[11px] leading-tight max-w-[64px] truncate ${
                hasUnviewed ? "text-foreground font-medium" : "text-muted-foreground"
              }`}>
                {group.user?.username || "user"}
              </span>
            </motion.button>
          );
        })}
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
