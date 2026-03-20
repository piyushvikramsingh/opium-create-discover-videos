import { useState } from "react";
import { Archive, Clock, RotateCcw, Trash2, Plus, X } from "lucide-react";
import { useStoryArchive, useDeleteArchivedStory, useReshareArchivedStory, ArchivedStory } from "@/hooks/useStoryArchive";
import { useCreateHighlight, useProfileHighlights, useAddStoryToHighlight } from "@/hooks/useData";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface StoryArchiveProps {
  onClose: () => void;
}

export default function StoryArchive({ onClose }: StoryArchiveProps) {
  const { data: archive = [], isLoading } = useStoryArchive();
  const deleteArchived = useDeleteArchivedStory();
  const reshare = useReshareArchivedStory();
  const { data: highlights = [] } = useProfileHighlights("");
  const createHighlight = useCreateHighlight();
  const addToHighlight = useAddStoryToHighlight();
  const [selectedStory, setSelectedStory] = useState<ArchivedStory | null>(null);

  const handleReshare = (story: ArchivedStory) => {
    reshare.mutate(story);
  };

  const handleDelete = (id: string) => {
    deleteArchived.mutate(id);
  };

  const handleAddToHighlight = async (story: ArchivedStory, highlightId: string) => {
    if (!story.original_story_id) {
      toast.error("Cannot add to highlight without original story");
      return;
    }
    addToHighlight.mutate({ highlightId, storyId: story.original_story_id });
    setSelectedStory(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={onClose}><X className="w-5 h-5" /></button>
        <span className="text-sm font-semibold">Story Archive</span>
        <Archive className="w-5 h-5 text-muted-foreground" />
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-muted border-t-foreground rounded-full animate-spin" />
        </div>
      ) : archive.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Archive className="w-12 h-12" />
          <p className="text-sm">No archived stories yet</p>
          <p className="text-xs">Stories are automatically archived when they expire</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {archive.map((story) => (
              <div key={story.id} className="relative aspect-[9/16] rounded-lg overflow-hidden group cursor-pointer"
                onClick={() => setSelectedStory(story)}>
                {story.media_type === "video" ? (
                  <video src={story.media_url} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={story.media_url} alt="" className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                <div className="absolute bottom-1 left-1.5 right-1.5">
                  <p className="text-[10px] text-white/80 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDistanceToNow(new Date(story.original_created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Story action sheet */}
      <AnimatePresence>
        {selectedStory && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end"
            onClick={() => setSelectedStory(null)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28 }}
              className="w-full bg-background rounded-t-2xl p-4 pb-safe space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-3" />

              <div className="flex items-center gap-3 mb-4">
                {selectedStory.media_type === "video" ? (
                  <video src={selectedStory.media_url} className="w-14 h-20 rounded-lg object-cover" muted />
                ) : (
                  <img src={selectedStory.media_url} alt="" className="w-14 h-20 rounded-lg object-cover" />
                )}
                <div>
                  <p className="text-sm font-semibold">{selectedStory.caption || "Story"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(selectedStory.original_created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <button onClick={() => handleReshare(selectedStory)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
                <RotateCcw className="w-5 h-5" />
                <span className="text-sm font-medium">Share as new story</span>
              </button>

              {(highlights as any[]).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground px-3 mb-1">Add to Highlight</p>
                  <div className="flex gap-2 overflow-x-auto px-3 py-1">
                    {(highlights as any[]).map((h: any) => (
                      <button key={h.id} onClick={() => handleAddToHighlight(selectedStory, h.id)}
                        className="flex flex-col items-center gap-1 min-w-[60px]">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          {h.cover_url ? <img src={h.cover_url} alt="" className="w-full h-full rounded-full object-cover" /> : <Plus className="w-5 h-5" />}
                        </div>
                        <span className="text-[10px] truncate max-w-[60px]">{h.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => { handleDelete(selectedStory.id); setSelectedStory(null); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-5 h-5" />
                <span className="text-sm font-medium">Delete from archive</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
