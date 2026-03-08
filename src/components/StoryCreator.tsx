import { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Type,
  Sticker,
  Palette,
  Download,
  Send,
  Undo,
  Pencil,
  Circle,
  Square,
  Minus,
  ChevronLeft,
  ChevronRight,
  Music,
  AtSign,
  Hash,
  MapPin,
  Clock,
  Smile,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCreateStory } from "@/hooks/useStories";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface StoryCreatorProps {
  mediaFile: File;
  mediaUrl: string;
  mediaType: "image" | "video";
  onClose: () => void;
  onSuccess?: () => void;
}

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  rotation: number;
  backgroundColor?: string;
}

interface StickerOverlay {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

interface DrawingPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

type Tool = "none" | "text" | "sticker" | "draw" | "color";

const COLORS = [
  "#FFFFFF", "#000000", "#FF3B30", "#FF9500", "#FFCC00",
  "#34C759", "#00C7BE", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55",
];

const FONT_FAMILIES = [
  { id: "sans", label: "Sans", value: "system-ui, sans-serif" },
  { id: "serif", label: "Serif", value: "Georgia, serif" },
  { id: "mono", label: "Mono", value: "ui-monospace, monospace" },
  { id: "handwritten", label: "Script", value: "cursive" },
];

const STICKERS = [
  "❤️", "🔥", "😂", "😍", "🎉", "✨", "💯", "🙌",
  "👏", "🥳", "😎", "🤩", "💪", "🌟", "💫", "⭐",
  "🎵", "📍", "🏷️", "💬", "❓", "‼️", "⏰", "📸",
];

const BACKGROUND_COLORS = [
  "transparent",
  "rgba(0,0,0,0.6)",
  "rgba(255,255,255,0.9)",
  "rgba(255,59,48,0.8)",
  "rgba(0,122,255,0.8)",
  "rgba(52,199,89,0.8)",
];

export default function StoryCreator({
  mediaFile,
  mediaUrl,
  mediaType,
  onClose,
  onSuccess,
}: StoryCreatorProps) {
  const { user } = useAuth();
  const createStory = useCreateStory();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeTool, setActiveTool] = useState<Tool>("none");
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [stickerOverlays, setStickerOverlays] = useState<StickerOverlay[]>([]);
  const [drawingPaths, setDrawingPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawingPath | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState("#FFFFFF");
  const [drawWidth, setDrawWidth] = useState(4);
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [textBgColor, setTextBgColor] = useState("transparent");
  const [textFontIndex, setTextFontIndex] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [caption, setCaption] = useState("");
  const [showCaptionInput, setShowCaptionInput] = useState(false);
  const [audience, setAudience] = useState<"followers" | "close_friends">("followers");

  const isDrawing = useRef(false);

  // Add new text overlay
  const addTextOverlay = useCallback(() => {
    const newText: TextOverlay = {
      id: `text-${Date.now()}`,
      text: "Tap to edit",
      x: 50,
      y: 50,
      fontSize: 24,
      color: textColor,
      fontFamily: FONT_FAMILIES[textFontIndex].value,
      rotation: 0,
      backgroundColor: textBgColor !== "transparent" ? textBgColor : undefined,
    };
    setTextOverlays((prev) => [...prev, newText]);
    setSelectedTextId(newText.id);
    setActiveTool("none");
  }, [textColor, textFontIndex, textBgColor]);

  // Add sticker overlay
  const addStickerOverlay = useCallback((emoji: string) => {
    const newSticker: StickerOverlay = {
      id: `sticker-${Date.now()}`,
      emoji,
      x: 50,
      y: 50,
      size: 48,
      rotation: 0,
    };
    setStickerOverlays((prev) => [...prev, newSticker]);
    setActiveTool("none");
  }, []);

  // Drawing handlers
  const handleDrawStart = useCallback((e: React.PointerEvent) => {
    if (activeTool !== "draw") return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    isDrawing.current = true;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCurrentPath({
      id: `path-${Date.now()}`,
      points: [{ x, y }],
      color: drawColor,
      width: drawWidth,
    });
  }, [activeTool, drawColor, drawWidth]);

  const handleDrawMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current || !currentPath) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCurrentPath((prev) => prev ? {
      ...prev,
      points: [...prev.points, { x, y }],
    } : null);
  }, [currentPath]);

  const handleDrawEnd = useCallback(() => {
    if (currentPath && currentPath.points.length > 1) {
      setDrawingPaths((prev) => [...prev, currentPath]);
    }
    setCurrentPath(null);
    isDrawing.current = false;
  }, [currentPath]);

  // Undo last action
  const handleUndo = useCallback(() => {
    if (drawingPaths.length > 0) {
      setDrawingPaths((prev) => prev.slice(0, -1));
    } else if (stickerOverlays.length > 0) {
      setStickerOverlays((prev) => prev.slice(0, -1));
    } else if (textOverlays.length > 0) {
      setTextOverlays((prev) => prev.slice(0, -1));
    }
  }, [drawingPaths.length, stickerOverlays.length, textOverlays.length]);

  // Update text content
  const updateTextContent = useCallback((id: string, newText: string) => {
    setTextOverlays((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text: newText } : t))
    );
  }, []);

  // Drag text/sticker
  const handleOverlayDrag = useCallback((
    type: "text" | "sticker",
    id: string,
    e: React.PointerEvent
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const item = type === "text"
      ? textOverlays.find((t) => t.id === id)
      : stickerOverlays.find((s) => s.id === id);
    if (!item) return;

    const startItemX = item.x;
    const startItemY = item.y;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100;

      if (type === "text") {
        setTextOverlays((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, x: Math.max(0, Math.min(100, startItemX + dx)), y: Math.max(0, Math.min(100, startItemY + dy)) }
              : t
          )
        );
      } else {
        setStickerOverlays((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, x: Math.max(0, Math.min(100, startItemX + dx)), y: Math.max(0, Math.min(100, startItemY + dy)) }
              : s
          )
        );
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [textOverlays, stickerOverlays]);

  // Publish story
  const handlePublish = async () => {
    if (!user) {
      toast.error("Please sign in to post stories");
      return;
    }

    setIsPublishing(true);
    try {
      // Upload media file
      const fileExt = mediaFile.name.split(".").pop() || (mediaType === "image" ? "jpg" : "mp4");
      const filePath = `${user.id}/story-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await (supabase as any).storage
        .from("videos")
        .upload(filePath, mediaFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = (supabase as any).storage
        .from("videos")
        .getPublicUrl(filePath);

      // Create story record
      await createStory.mutateAsync({
        media_url: urlData.publicUrl,
        media_type: mediaType,
        caption: caption || null,
        audience,
        duration: mediaType === "video" ? 15 : 5,
      });

      toast.success("Story posted!");
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to post story");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 pt-safe">
        <button onClick={onClose} className="rounded-full bg-black/40 p-2 text-white">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            className="rounded-full bg-black/40 p-2 text-white"
            disabled={textOverlays.length === 0 && stickerOverlays.length === 0 && drawingPaths.length === 0}
          >
            <Undo className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Media canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 mx-4 mb-4 rounded-2xl overflow-hidden touch-none"
        onPointerDown={handleDrawStart}
        onPointerMove={handleDrawMove}
        onPointerUp={handleDrawEnd}
        onPointerLeave={handleDrawEnd}
      >
        {mediaType === "image" ? (
          <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <video
            src={mediaUrl}
            className="h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        {/* Drawing SVG overlay */}
        <svg className="absolute inset-0 h-full w-full pointer-events-none">
          {[...drawingPaths, currentPath].filter(Boolean).map((path) => (
            <polyline
              key={path!.id}
              points={path!.points.map((p) => `${p.x}%,${p.y}%`).join(" ")}
              fill="none"
              stroke={path!.color}
              strokeWidth={path!.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Text overlays */}
        {textOverlays.map((text) => (
          <div
            key={text.id}
            className="absolute cursor-move select-none"
            style={{
              left: `${text.x}%`,
              top: `${text.y}%`,
              transform: `translate(-50%, -50%) rotate(${text.rotation}deg)`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              handleOverlayDrag("text", text.id, e);
            }}
          >
            {selectedTextId === text.id ? (
              <input
                type="text"
                value={text.text}
                onChange={(e) => updateTextContent(text.id, e.target.value)}
                onBlur={() => setSelectedTextId(null)}
                autoFocus
                className="bg-transparent text-center outline-none"
                style={{
                  fontSize: text.fontSize,
                  color: text.color,
                  fontFamily: text.fontFamily,
                  backgroundColor: text.backgroundColor,
                  padding: text.backgroundColor ? "4px 12px" : 0,
                  borderRadius: text.backgroundColor ? "8px" : 0,
                  textShadow: !text.backgroundColor ? "0 2px 4px rgba(0,0,0,0.5)" : "none",
                }}
              />
            ) : (
              <span
                onClick={() => setSelectedTextId(text.id)}
                className="whitespace-nowrap"
                style={{
                  fontSize: text.fontSize,
                  color: text.color,
                  fontFamily: text.fontFamily,
                  backgroundColor: text.backgroundColor,
                  padding: text.backgroundColor ? "4px 12px" : 0,
                  borderRadius: text.backgroundColor ? "8px" : 0,
                  textShadow: !text.backgroundColor ? "0 2px 4px rgba(0,0,0,0.5)" : "none",
                }}
              >
                {text.text}
              </span>
            )}
          </div>
        ))}

        {/* Sticker overlays */}
        {stickerOverlays.map((sticker) => (
          <div
            key={sticker.id}
            className="absolute cursor-move select-none"
            style={{
              left: `${sticker.x}%`,
              top: `${sticker.y}%`,
              transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
              fontSize: sticker.size,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              handleOverlayDrag("sticker", sticker.id, e);
            }}
          >
            {sticker.emoji}
          </div>
        ))}
      </div>

      {/* Caption input */}
      {showCaptionInput && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/70 p-4 pb-safe">
          <div className="w-full space-y-3">
            <input
              type="text"
              placeholder="Add a caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-white placeholder:text-white/50 outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setAudience("followers")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  audience === "followers" ? "bg-white text-black" : "bg-white/20 text-white"
                }`}
              >
                Followers
              </button>
              <button
                onClick={() => setAudience("close_friends")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  audience === "close_friends" ? "bg-green-500 text-white" : "bg-white/20 text-white"
                }`}
              >
                Close Friends
              </button>
            </div>
            <button
              onClick={() => setShowCaptionInput(false)}
              className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Tool panels */}
      {activeTool === "text" && (
        <div className="absolute bottom-24 left-0 right-0 px-4 animate-fade-in">
          <div className="rounded-2xl bg-black/80 p-4 backdrop-blur-xl">
            <p className="mb-3 text-xs font-medium text-white/60">Text Style</p>
            <div className="flex gap-2 mb-3">
              {FONT_FAMILIES.map((font, i) => (
                <button
                  key={font.id}
                  onClick={() => setTextFontIndex(i)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                    textFontIndex === i ? "bg-white text-black" : "bg-white/20 text-white"
                  }`}
                  style={{ fontFamily: font.value }}
                >
                  {font.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              {COLORS.slice(0, 6).map((color) => (
                <button
                  key={color}
                  onClick={() => setTextColor(color)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    textColor === color ? "border-white" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {BACKGROUND_COLORS.map((bg) => (
                <button
                  key={bg}
                  onClick={() => setTextBgColor(bg)}
                  className={`h-8 flex-1 rounded-lg border-2 ${
                    textBgColor === bg ? "border-white" : "border-white/20"
                  }`}
                  style={{ backgroundColor: bg === "transparent" ? "transparent" : bg }}
                >
                  {bg === "transparent" && <span className="text-xs text-white/60">None</span>}
                </button>
              ))}
            </div>
            <button
              onClick={addTextOverlay}
              className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black"
            >
              Add Text
            </button>
          </div>
        </div>
      )}

      {activeTool === "sticker" && (
        <div className="absolute bottom-24 left-0 right-0 px-4 animate-fade-in">
          <div className="rounded-2xl bg-black/80 p-4 backdrop-blur-xl">
            <p className="mb-3 text-xs font-medium text-white/60">Stickers</p>
            <div className="grid grid-cols-8 gap-2">
              {STICKERS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addStickerOverlay(emoji)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-2xl hover:bg-white/20"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTool === "draw" && (
        <div className="absolute bottom-24 left-0 right-0 px-4 animate-fade-in">
          <div className="rounded-2xl bg-black/80 p-4 backdrop-blur-xl">
            <p className="mb-3 text-xs font-medium text-white/60">Brush</p>
            <div className="flex gap-2 mb-3">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setDrawColor(color)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    drawColor === color ? "border-white scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Minus className="h-4 w-4 text-white/60" />
              <input
                type="range"
                min="2"
                max="20"
                value={drawWidth}
                onChange={(e) => setDrawWidth(Number(e.target.value))}
                className="flex-1"
              />
              <Circle className="h-4 w-4 text-white/60" />
            </div>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between gap-4 px-4 pb-safe py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTool(activeTool === "text" ? "none" : "text")}
            className={`rounded-full p-3 ${activeTool === "text" ? "bg-white text-black" : "bg-white/20 text-white"}`}
          >
            <Type className="h-5 w-5" />
          </button>
          <button
            onClick={() => setActiveTool(activeTool === "sticker" ? "none" : "sticker")}
            className={`rounded-full p-3 ${activeTool === "sticker" ? "bg-white text-black" : "bg-white/20 text-white"}`}
          >
            <Smile className="h-5 w-5" />
          </button>
          <button
            onClick={() => setActiveTool(activeTool === "draw" ? "none" : "draw")}
            className={`rounded-full p-3 ${activeTool === "draw" ? "bg-white text-black" : "bg-white/20 text-white"}`}
          >
            <Pencil className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCaptionInput(true)}
            className="rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white"
          >
            {caption || "Add caption..."}
          </button>
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {isPublishing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
