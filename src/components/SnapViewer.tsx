import { useState, useEffect, useCallback } from "react";
import { X, Flame } from "lucide-react";

interface SnapViewerProps {
  imageUrl: string;
  senderName: string;
  caption?: string | null;
  duration?: number; // seconds
  onClose: () => void;
}

const SnapViewer = ({ imageUrl, senderName, caption, duration = 5, onClose }: SnapViewerProps) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [progress, setProgress] = useState(100);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 0.05;
        if (next <= 0) {
          clearInterval(interval);
          handleClose();
          return 0;
        }
        setProgress((next / duration) * 100);
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [duration, handleClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" onClick={handleClose}>
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 z-20 px-2 pt-2 safe-top">
        <div className="h-1 w-full rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 pt-6 safe-top">
        <Flame className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-white">{senderName}</span>
        <span className="text-xs text-white/60">{Math.ceil(timeLeft)}s</span>
        <div className="flex-1" />
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          className="rounded-full bg-black/40 p-1.5 backdrop-blur-sm"
        >
          <X className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Snap image */}
      <img
        src={imageUrl}
        alt="snap"
        className="h-full w-full object-contain"
      />

      {/* Caption */}
      {caption && (
        <div className="absolute bottom-16 left-0 right-0 z-20 px-6 safe-bottom">
          <div className="rounded-xl bg-black/50 backdrop-blur-sm px-4 py-3">
            <p className="text-center text-base text-white">{caption}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SnapViewer;
