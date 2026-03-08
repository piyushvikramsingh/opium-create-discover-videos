import { useState, useRef, useCallback } from "react";
import { X, Camera, Zap, RotateCcw, Image as ImageIcon } from "lucide-react";
import StoryCreator from "./StoryCreator";

interface QuickStoryCaptureProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function QuickStoryCapture({ onClose, onSuccess }: QuickStoryCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [capturedMedia, setCapturedMedia] = useState<{
    file: File;
    url: string;
    type: "image" | "video";
  } | null>(null);
  const [flashEnabled, setFlashEnabled] = useState(false);

  // Initialize camera
  const initCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      streamRef.current = stream;
      setIsInitialized(true);
    } catch (error) {
      console.error("Camera access denied:", error);
    }
  }, [facingMode]);

  // Capture photo
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Flash effect
    if (flashEnabled) {
      const flashEl = document.getElementById("flash-overlay");
      if (flashEl) {
        flashEl.style.opacity = "1";
        setTimeout(() => {
          flashEl.style.opacity = "0";
        }, 100);
      }
    }

    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `story-${Date.now()}.jpg`, { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          setCapturedMedia({ file, url, type: "image" });
        }
      },
      "image/jpeg",
      0.92
    );
  }, [flashEnabled]);

  // Switch camera
  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }, []);

  // Handle file selection from gallery
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const url = URL.createObjectURL(file);
    setCapturedMedia({ file, url, type: isVideo ? "video" : "image" });
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (capturedMedia?.url) {
      URL.revokeObjectURL(capturedMedia.url);
    }
  }, [capturedMedia]);

  // Initialize camera on mount
  useState(() => {
    initCamera();
    return cleanup;
  });

  // Reinit when facing mode changes
  useState(() => {
    if (isInitialized) {
      initCamera();
    }
  });

  // If we have captured media, show the StoryCreator
  if (capturedMedia) {
    return (
      <StoryCreator
        mediaFile={capturedMedia.file}
        mediaUrl={capturedMedia.url}
        mediaType={capturedMedia.type}
        onClose={() => {
          setCapturedMedia(null);
          cleanup();
          onClose();
        }}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Flash overlay */}
      <div
        id="flash-overlay"
        className="absolute inset-0 z-50 bg-white pointer-events-none transition-opacity duration-100"
        style={{ opacity: 0 }}
      />

      {/* Camera preview */}
      <video
        ref={videoRef}
        className="flex-1 object-cover"
        autoPlay
        playsInline
        muted
        style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
      />

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4 pt-safe">
        <button
          onClick={() => {
            cleanup();
            onClose();
          }}
          className="rounded-full bg-black/40 p-2.5 text-white backdrop-blur-sm"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFlashEnabled(!flashEnabled)}
            className={`rounded-full p-2.5 backdrop-blur-sm ${
              flashEnabled ? "bg-yellow-400 text-black" : "bg-black/40 text-white"
            }`}
          >
            <Zap className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-safe">
        <div className="flex items-center justify-center gap-8 px-6 py-6">
          {/* Gallery */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-white/20 p-4 text-white backdrop-blur-sm"
          >
            <ImageIcon className="h-6 w-6" />
          </button>

          {/* Capture button */}
          <button
            onClick={capturePhoto}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 backdrop-blur-sm transition-transform active:scale-95"
          >
            <div className="h-16 w-16 rounded-full bg-white" />
          </button>

          {/* Switch camera */}
          <button
            onClick={switchCamera}
            className="rounded-full bg-white/20 p-4 text-white backdrop-blur-sm"
          >
            <RotateCcw className="h-6 w-6" />
          </button>
        </div>

        {/* Mode indicator */}
        <div className="flex justify-center gap-6 pb-4">
          <span className="text-xs font-semibold text-white/60">STORY</span>
        </div>
      </div>
    </div>
  );
}
