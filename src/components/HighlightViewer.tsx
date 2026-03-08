import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useHighlightItems } from "@/hooks/useData";
import { Progress } from "@/components/ui/progress";

interface HighlightViewerProps {
  highlightId: string;
  highlightTitle: string;
  onClose: () => void;
}

export default function HighlightViewer({ highlightId, highlightTitle, onClose }: HighlightViewerProps) {
  const { data: items = [], isLoading } = useHighlightItems(highlightId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const DURATION = 5000; // 5s per story
  const currentItem = items[currentIndex];
  const story = currentItem?.story;

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, items.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  // Auto-advance timer
  useEffect(() => {
    if (isPaused || !story || items.length === 0) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (100 / (DURATION / 50));
        if (next >= 100) {
          goNext();
          return 0;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused, story, goNext, items.length, currentIndex]);

  // Reset progress on index change
  useEffect(() => {
    setProgress(0);
  }, [currentIndex]);

  const handleTap = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      goPrev();
    } else if (x > (rect.width * 2) / 3) {
      goNext();
    } else {
      setIsPaused((prev) => !prev);
    }
  }, [goNext, goPrev]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white">
        <p className="text-sm text-white/60">No stories in this highlight yet</p>
        <button onClick={onClose} className="mt-4 rounded-full bg-white/20 px-6 py-2 text-sm font-medium">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" onClick={handleTap}>
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-2 pt-safe pb-1 pt-2">
        {items.map((_: any, i: number) => (
          <div key={i} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-75 ease-linear"
              style={{
                width: i < currentIndex ? "100%" : i === currentIndex ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{highlightTitle}</span>
          <span className="text-xs text-white/50">
            {story?.created_at ? new Date(story.created_at).toLocaleDateString() : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
            className="rounded-full bg-black/40 p-1.5 backdrop-blur-sm"
          >
            {isPaused ? <Play className="h-4 w-4 text-white" /> : <Pause className="h-4 w-4 text-white" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="rounded-full bg-black/40 p-1.5 backdrop-blur-sm"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Media */}
      {story && (
        <div className="flex-1 flex items-center justify-center">
          {story.media_type === "video" ? (
            <video
              key={story.id}
              src={story.media_url}
              className="h-full w-full object-cover"
              autoPlay
              playsInline
              muted={false}
              loop
            />
          ) : (
            <img
              key={story.id}
              src={story.media_url}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}

      {/* Caption */}
      {story?.caption && (
        <div className="absolute bottom-16 left-0 right-0 z-20 px-6 text-center">
          <p className="inline-block rounded-lg bg-black/50 px-4 py-2 text-sm text-white backdrop-blur-sm">
            {story.caption}
          </p>
        </div>
      )}

      {/* Navigation indicators */}
      {currentIndex > 0 && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <ChevronLeft className="h-8 w-8 text-white/30" />
        </div>
      )}
      {currentIndex < items.length - 1 && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <ChevronRight className="h-8 w-8 text-white/30" />
        </div>
      )}
    </div>
  );
}
