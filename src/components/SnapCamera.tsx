import { useState, useRef, useCallback, useEffect } from "react";
import { X, Camera, SwitchCamera, Send, Flame, Type } from "lucide-react";
import { toast } from "sonner";

interface SnapCameraProps {
  onCapture: (file: File, caption: string) => void;
  onClose: () => void;
  sending?: boolean;
}

const SnapCamera = ({ onCapture, onClose, sending }: SnapCameraProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [captured, setCaptured] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [showCaption, setShowCaption] = useState(false);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast.error("Camera access denied");
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode, startCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `snap-${Date.now()}.jpg`, { type: "image/jpeg" });
      setCapturedFile(file);
      setCaptured(canvas.toDataURL("image/jpeg"));
      // Stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    }, "image/jpeg", 0.9);
  };

  const handleSend = () => {
    if (!capturedFile) return;
    onCapture(capturedFile, caption);
  };

  const handleRetake = () => {
    setCaptured(null);
    setCapturedFile(null);
    setCaption("");
    setShowCaption(false);
    startCamera(facingMode);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <canvas ref={canvasRef} className="hidden" />

      {captured ? (
        // Preview captured snap
        <>
          <div className="absolute inset-0">
            <img src={captured} alt="snap" className="h-full w-full object-cover" />
          </div>

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-4 safe-top">
            <button onClick={handleRetake} className="rounded-full bg-black/40 p-2 backdrop-blur-sm">
              <X className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={() => setShowCaption(!showCaption)}
              className={`rounded-full p-2 backdrop-blur-sm ${showCaption ? "bg-white text-black" : "bg-black/40 text-white"}`}
            >
              <Type className="h-5 w-5" />
            </button>
          </div>

          {/* Caption input */}
          {showCaption && (
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-10 px-6">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption..."
                autoFocus
                className="w-full bg-black/50 backdrop-blur-sm text-white text-center text-lg py-3 px-4 rounded-xl outline-none placeholder:text-white/50"
              />
            </div>
          )}

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-6 pb-8 safe-bottom">
            <div className="flex items-center gap-2 text-white">
              <Flame className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Snap</span>
            </div>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send Snap"}
            </button>
          </div>
        </>
      ) : (
        // Camera viewfinder
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-4 safe-top">
            <button onClick={onClose} className="rounded-full bg-black/40 p-2 backdrop-blur-sm">
              <X className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={() => setFacingMode(facingMode === "user" ? "environment" : "user")}
              className="rounded-full bg-black/40 p-2 backdrop-blur-sm"
            >
              <SwitchCamera className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Capture button */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center pb-10 safe-bottom">
            <button
              onClick={handleCapture}
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white"
            >
              <div className="h-16 w-16 rounded-full bg-white" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SnapCamera;
