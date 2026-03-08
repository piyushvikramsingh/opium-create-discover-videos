import { useState, useRef, useCallback, useEffect } from "react";
import { X, Camera, Zap, RotateCcw, Image as ImageIcon, Circle, StopCircle } from "lucide-react";
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [capturedMedia, setCapturedMedia] = useState<{
    file: File;
    url: string;
    type: "image" | "video";
  } | null>(null);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);

  const MAX_RECORD_SECONDS = 60;

  // Initialize camera
  const initCamera = useCallback(async (facing: "user" | "environment") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: mode === "video",
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      streamRef.current = stream;
      setIsInitialized(true);
    } catch (error) {
      console.error("Camera access denied:", error);
    }
  }, [mode]);

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

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
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
  }, [flashEnabled, facingMode]);

  // Start video recording
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

    const recorder = new MediaRecorder(stream, { mimeType });
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const ext = mimeType.includes("webm") ? "webm" : "mp4";
      const file = new File([blob], `story-${Date.now()}.${ext}`, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setCapturedMedia({ file, url, type: "video" });
      setRecordDuration(0);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordDuration(0);

    recordTimerRef.current = window.setInterval(() => {
      setRecordDuration((prev) => {
        if (prev >= MAX_RECORD_SECONDS - 1) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  }, []);

  // Stop video recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  // Switch camera
  const switchCamera = useCallback(() => {
    const newFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(newFacing);
    initCamera(newFacing);
  }, [facingMode, initCamera]);

  // Handle file selection from gallery
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const url = URL.createObjectURL(file);
    setCapturedMedia({ file, url, type: isVideo ? "video" : "image" });
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
    }
  }, []);

  // Init camera on mount
  useEffect(() => {
    initCamera(facingMode);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-init when mode changes (to add/remove audio)
  useEffect(() => {
    if (isInitialized && !isRecording) {
      initCamera(facingMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Handle capture/record button
  const handleCaptureButton = useCallback(() => {
    if (mode === "photo") {
      capturePhoto();
    } else {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  }, [mode, isRecording, capturePhoto, startRecording, stopRecording]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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

      {/* Recording timer */}
      {isRecording && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-destructive/90 px-4 py-1.5 backdrop-blur-sm">
          <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
          <span className="text-sm font-semibold text-white">{formatTime(recordDuration)}</span>
        </div>
      )}

      {/* Recording progress bar */}
      {isRecording && (
        <div className="absolute top-0 left-0 right-0 z-30 h-1 bg-white/20">
          <div
            className="h-full bg-destructive transition-all duration-1000 ease-linear"
            style={{ width: `${(recordDuration / MAX_RECORD_SECONDS) * 100}%` }}
          />
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4 pt-safe z-20">
        <button
          onClick={() => {
            if (isRecording) {
              stopRecording();
            }
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
      <div className="absolute bottom-0 left-0 right-0 pb-safe z-20">
        {/* Mode selector */}
        <div className="flex justify-center gap-6 mb-4">
          <button
            onClick={() => { if (!isRecording) setMode("photo"); }}
            className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === "photo" ? "text-white" : "text-white/40"
            }`}
          >
            Photo
          </button>
          <button
            onClick={() => { if (!isRecording) setMode("video"); }}
            className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === "video" ? "text-white" : "text-white/40"
            }`}
          >
            Video
          </button>
        </div>

        <div className="flex items-center justify-center gap-8 px-6 py-4">
          {/* Gallery */}
          <button
            onClick={() => !isRecording && fileInputRef.current?.click()}
            className="rounded-full bg-white/20 p-4 text-white backdrop-blur-sm"
            disabled={isRecording}
          >
            <ImageIcon className="h-6 w-6" />
          </button>

          {/* Capture / Record button */}
          <button
            onClick={handleCaptureButton}
            className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all active:scale-95 ${
              isRecording
                ? "border-destructive bg-destructive/20"
                : mode === "video"
                  ? "border-destructive bg-white/20"
                  : "border-white bg-white/20"
            } backdrop-blur-sm`}
          >
            {isRecording ? (
              <div className="h-8 w-8 rounded-sm bg-destructive" />
            ) : mode === "video" ? (
              <div className="h-16 w-16 rounded-full bg-destructive" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-white" />
            )}
          </button>

          {/* Switch camera */}
          <button
            onClick={switchCamera}
            className="rounded-full bg-white/20 p-4 text-white backdrop-blur-sm"
            disabled={isRecording}
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
