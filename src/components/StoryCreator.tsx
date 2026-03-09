import { useState, useRef, useCallback } from "react";
import {
  X, Type, Pencil, Undo, Send, Smile, Music, MapPin, Hash,
  BarChart3, HelpCircle, Timer, AtSign, Minus, Circle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCreateStory } from "@/hooks/useStories";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface StoryCreatorProps {
  mediaFile: File;
  mediaUrl: string;
  mediaType: "image" | "video";
  onClose: () => void;
  onSuccess?: () => void;
}

interface TextOverlay {
  id: string; text: string; x: number; y: number;
  fontSize: number; color: string; fontFamily: string;
  rotation: number; backgroundColor?: string;
  alignment: "left" | "center" | "right";
}

interface StickerOverlay {
  id: string; emoji: string; x: number; y: number; size: number; rotation: number;
}

interface InteractiveStickerOverlay {
  id: string; type: "poll" | "quiz" | "emoji_slider" | "question" | "countdown" | "mention" | "location";
  x: number; y: number; data: any;
}

interface DrawingPath {
  id: string; points: { x: number; y: number }[]; color: string; width: number;
}

type Tool = "none" | "text" | "sticker" | "draw" | "interactive";

const COLORS = [
  "#FFFFFF", "#000000", "#FF3B30", "#FF9500", "#FFCC00",
  "#34C759", "#00C7BE", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55",
];

const FONT_FAMILIES = [
  { id: "classic", label: "Classic", value: "system-ui, sans-serif" },
  { id: "modern", label: "Modern", value: "'Inter', sans-serif" },
  { id: "neon", label: "Neon", value: "cursive" },
  { id: "typewriter", label: "Typewriter", value: "ui-monospace, monospace" },
  { id: "strong", label: "Strong", value: "Impact, sans-serif" },
];

const STICKERS = [
  "❤️", "🔥", "😂", "😍", "🎉", "✨", "💯", "🙌",
  "👏", "🥳", "😎", "🤩", "💪", "🌟", "💫", "⭐",
  "🎵", "📍", "🏷️", "💬", "❓", "‼️", "⏰", "📸",
  "🦋", "🌈", "💀", "🤡", "🥺", "😤", "🫶", "💅",
];

const BACKGROUND_COLORS = [
  "transparent", "rgba(0,0,0,0.7)", "rgba(255,255,255,0.95)",
  "rgba(255,59,48,0.85)", "rgba(0,122,255,0.85)", "rgba(52,199,89,0.85)",
  "rgba(175,82,222,0.85)",
];

const INTERACTIVE_STICKERS = [
  { type: "poll", label: "Poll", icon: BarChart3, color: "#FF9500" },
  { type: "quiz", label: "Quiz", icon: HelpCircle, color: "#AF52DE" },
  { type: "emoji_slider", label: "Slider", icon: Smile, color: "#FF2D55" },
  { type: "question", label: "Questions", icon: Hash, color: "#34C759" },
  { type: "countdown", label: "Countdown", icon: Timer, color: "#007AFF" },
  { type: "mention", label: "Mention", icon: AtSign, color: "#FF3B30" },
  { type: "location", label: "Location", icon: MapPin, color: "#00C7BE" },
] as const;

export default function StoryCreator({ mediaFile, mediaUrl, mediaType, onClose, onSuccess }: StoryCreatorProps) {
  const { user } = useAuth();
  const createStory = useCreateStory();
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeTool, setActiveTool] = useState<Tool>("none");
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [stickerOverlays, setStickerOverlays] = useState<StickerOverlay[]>([]);
  const [interactiveStickers, setInteractiveStickers] = useState<InteractiveStickerOverlay[]>([]);
  const [drawingPaths, setDrawingPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawingPath | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState("#FFFFFF");
  const [drawWidth, setDrawWidth] = useState(4);
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [textBgColor, setTextBgColor] = useState("transparent");
  const [textFontIndex, setTextFontIndex] = useState(0);
  const [textAlignment, setTextAlignment] = useState<"left" | "center" | "right">("center");
  const [isPublishing, setIsPublishing] = useState(false);
  const [caption, setCaption] = useState("");
  const [showCaptionInput, setShowCaptionInput] = useState(false);
  const [audience, setAudience] = useState<"followers" | "close_friends">("followers");
  const [interactiveSetup, setInteractiveSetup] = useState<{ type: string } | null>(null);

  // Interactive sticker setup state
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["Yes", "No"]);
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizOptions, setQuizOptions] = useState(["", "", "", ""]);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [sliderEmoji, setSliderEmoji] = useState("😍");
  const [sliderQuestion, setSliderQuestion] = useState("");
  const [questionPrompt, setQuestionPrompt] = useState("Ask me anything");
  const [countdownTitle, setCountdownTitle] = useState("");
  const [countdownDate, setCountdownDate] = useState("");
  const [mentionUser, setMentionUser] = useState("");
  const [locationText, setLocationText] = useState("");

  const isDrawing = useRef(false);

  const addTextOverlay = useCallback(() => {
    const t: TextOverlay = {
      id: `text-${Date.now()}`, text: "Tap to edit", x: 50, y: 50,
      fontSize: 26, color: textColor, fontFamily: FONT_FAMILIES[textFontIndex].value,
      rotation: 0, backgroundColor: textBgColor !== "transparent" ? textBgColor : undefined,
      alignment: textAlignment,
    };
    setTextOverlays((prev) => [...prev, t]);
    setSelectedTextId(t.id);
    setActiveTool("none");
  }, [textColor, textFontIndex, textBgColor, textAlignment]);

  const addStickerOverlay = useCallback((emoji: string) => {
    setStickerOverlays((prev) => [...prev, {
      id: `sticker-${Date.now()}`, emoji, x: 50, y: 50, size: 52, rotation: 0,
    }]);
    setActiveTool("none");
  }, []);

  const addInteractiveSticker = useCallback((type: string, data: any) => {
    setInteractiveStickers((prev) => [...prev, {
      id: `interactive-${Date.now()}`, type: type as any, x: 50, y: 45, data,
    }]);
    setInteractiveSetup(null);
    setActiveTool("none");
  }, []);

  // Drawing
  const handleDrawStart = useCallback((e: React.PointerEvent) => {
    if (activeTool !== "draw") return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    isDrawing.current = true;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCurrentPath({ id: `path-${Date.now()}`, points: [{ x, y }], color: drawColor, width: drawWidth });
  }, [activeTool, drawColor, drawWidth]);

  const handleDrawMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current || !currentPath) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCurrentPath((prev) => prev ? { ...prev, points: [...prev.points, { x, y }] } : null);
  }, [currentPath]);

  const handleDrawEnd = useCallback(() => {
    if (currentPath && currentPath.points.length > 1) setDrawingPaths((prev) => [...prev, currentPath]);
    setCurrentPath(null);
    isDrawing.current = false;
  }, [currentPath]);

  const handleUndo = useCallback(() => {
    if (drawingPaths.length > 0) setDrawingPaths((p) => p.slice(0, -1));
    else if (interactiveStickers.length > 0) setInteractiveStickers((p) => p.slice(0, -1));
    else if (stickerOverlays.length > 0) setStickerOverlays((p) => p.slice(0, -1));
    else if (textOverlays.length > 0) setTextOverlays((p) => p.slice(0, -1));
  }, [drawingPaths.length, interactiveStickers.length, stickerOverlays.length, textOverlays.length]);

  const updateTextContent = useCallback((id: string, text: string) => {
    setTextOverlays((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
  }, []);

  const handleOverlayDrag = useCallback((type: "text" | "sticker" | "interactive", id: string, e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX, startY = e.clientY;
    let items: any[];
    let setter: any;
    if (type === "text") { items = textOverlays; setter = setTextOverlays; }
    else if (type === "sticker") { items = stickerOverlays; setter = setStickerOverlays; }
    else { items = interactiveStickers; setter = setInteractiveStickers; }
    const item = items.find((i: any) => i.id === id);
    if (!item) return;
    const startItemX = item.x, startItemY = item.y;
    const onMove = (me: PointerEvent) => {
      const dx = ((me.clientX - startX) / rect.width) * 100;
      const dy = ((me.clientY - startY) / rect.height) * 100;
      setter((prev: any[]) => prev.map((i: any) =>
        i.id === id ? { ...i, x: Math.max(5, Math.min(95, startItemX + dx)), y: Math.max(5, Math.min(95, startItemY + dy)) } : i
      ));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [textOverlays, stickerOverlays, interactiveStickers]);

  const handlePublish = async () => {
    if (!user) { toast.error("Please sign in"); return; }
    setIsPublishing(true);
    try {
      const fileExt = mediaFile.name.split(".").pop() || (mediaType === "image" ? "jpg" : "mp4");
      const filePath = `${user.id}/story-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await (supabase as any).storage.from("videos").upload(filePath, mediaFile);
      if (uploadError) throw uploadError;
      const { data: urlData } = (supabase as any).storage.from("videos").getPublicUrl(filePath);
      await createStory.mutateAsync({
        media_url: urlData.publicUrl, media_type: mediaType,
        caption: caption || undefined, audience, duration: mediaType === "video" ? 15 : 5,
      });
      toast.success("Story posted!");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to post story");
    } finally {
      setIsPublishing(false);
    }
  };

  const confirmInteractiveSticker = () => {
    if (!interactiveSetup) return;
    const { type } = interactiveSetup;
    switch (type) {
      case "poll":
        if (!pollQuestion.trim()) { toast.error("Enter a question"); return; }
        addInteractiveSticker("poll", { question: pollQuestion, options: pollOptions.filter(Boolean) });
        setPollQuestion(""); setPollOptions(["Yes", "No"]);
        break;
      case "quiz":
        if (!quizQuestion.trim()) { toast.error("Enter a question"); return; }
        addInteractiveSticker("quiz", { question: quizQuestion, options: quizOptions.filter(Boolean), correct: quizCorrect });
        setQuizQuestion(""); setQuizOptions(["", "", "", ""]); setQuizCorrect(0);
        break;
      case "emoji_slider":
        addInteractiveSticker("emoji_slider", { emoji: sliderEmoji, question: sliderQuestion || "How much?" });
        setSliderEmoji("😍"); setSliderQuestion("");
        break;
      case "question":
        addInteractiveSticker("question", { prompt: questionPrompt });
        setQuestionPrompt("Ask me anything");
        break;
      case "countdown":
        if (!countdownTitle.trim()) { toast.error("Enter a title"); return; }
        addInteractiveSticker("countdown", { title: countdownTitle, date: countdownDate || new Date(Date.now() + 86400000).toISOString() });
        setCountdownTitle(""); setCountdownDate("");
        break;
      case "mention":
        addInteractiveSticker("mention", { username: mentionUser || "someone" });
        setMentionUser("");
        break;
      case "location":
        addInteractiveSticker("location", { name: locationText || "Add location" });
        setLocationText("");
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 pt-safe z-20">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm">
          <X className="h-5 w-5" />
        </motion.button>
        <div className="flex items-center gap-2">
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleUndo}
            className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm disabled:opacity-30"
            disabled={textOverlays.length === 0 && stickerOverlays.length === 0 && drawingPaths.length === 0 && interactiveStickers.length === 0}>
            <Undo className="h-5 w-5" />
          </motion.button>
        </div>
      </div>

      {/* Right side tools (Instagram style vertical strip) */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-3">
        {[
          { tool: "text" as Tool, Icon: Type },
          { tool: "sticker" as Tool, Icon: Smile },
          { tool: "draw" as Tool, Icon: Pencil },
          { tool: "interactive" as Tool, Icon: BarChart3 },
          { tool: "none" as Tool, Icon: Music, label: "music" },
        ].map(({ tool, Icon, label }) => (
          <motion.button
            key={label || tool}
            whileTap={{ scale: 0.85 }}
            onClick={() => {
              if (label === "music") { toast("Music coming soon!"); return; }
              setActiveTool(activeTool === tool ? "none" : tool);
            }}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              activeTool === tool ? "bg-white text-black" : "bg-black/50 text-white backdrop-blur-sm"
            }`}
          >
            <Icon className="h-5 w-5" />
          </motion.button>
        ))}
      </div>

      {/* Media canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 mx-3 mb-3 rounded-2xl overflow-hidden touch-none"
        onPointerDown={handleDrawStart}
        onPointerMove={handleDrawMove}
        onPointerUp={handleDrawEnd}
        onPointerLeave={handleDrawEnd}
      >
        {mediaType === "image" ? (
          <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <video src={mediaUrl} className="h-full w-full object-cover" autoPlay loop muted playsInline />
        )}

        {/* Drawing SVG */}
        <svg className="absolute inset-0 h-full w-full pointer-events-none">
          {[...drawingPaths, currentPath].filter(Boolean).map((p) => (
            <polyline key={p!.id} points={p!.points.map((pt) => `${pt.x}%,${pt.y}%`).join(" ")}
              fill="none" stroke={p!.color} strokeWidth={p!.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>

        {/* Text overlays */}
        {textOverlays.map((t) => (
          <div key={t.id} className="absolute cursor-move select-none z-10"
            style={{ left: `${t.x}%`, top: `${t.y}%`, transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`, textAlign: t.alignment }}
            onPointerDown={(e) => { e.stopPropagation(); handleOverlayDrag("text", t.id, e); }}>
            {selectedTextId === t.id ? (
              <input type="text" value={t.text}
                onChange={(e) => updateTextContent(t.id, e.target.value)}
                onBlur={() => setSelectedTextId(null)} autoFocus
                className="bg-transparent outline-none min-w-[60px]"
                style={{
                  fontSize: t.fontSize, color: t.color, fontFamily: t.fontFamily,
                  backgroundColor: t.backgroundColor, padding: t.backgroundColor ? "6px 14px" : 0,
                  borderRadius: t.backgroundColor ? "10px" : 0,
                  textShadow: !t.backgroundColor ? "0 2px 8px rgba(0,0,0,0.6)" : "none",
                  textAlign: t.alignment,
                }} />
            ) : (
              <span onClick={() => setSelectedTextId(t.id)} className="whitespace-nowrap"
                style={{
                  fontSize: t.fontSize, color: t.color, fontFamily: t.fontFamily,
                  backgroundColor: t.backgroundColor, padding: t.backgroundColor ? "6px 14px" : 0,
                  borderRadius: t.backgroundColor ? "10px" : 0,
                  textShadow: !t.backgroundColor ? "0 2px 8px rgba(0,0,0,0.6)" : "none",
                }}>
                {t.text}
              </span>
            )}
          </div>
        ))}

        {/* Emoji stickers */}
        {stickerOverlays.map((s) => (
          <div key={s.id} className="absolute cursor-move select-none z-10"
            style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`, fontSize: s.size }}
            onPointerDown={(e) => { e.stopPropagation(); handleOverlayDrag("sticker", s.id, e); }}>
            {s.emoji}
          </div>
        ))}

        {/* Interactive stickers preview */}
        {interactiveStickers.map((is) => (
          <div key={is.id} className="absolute cursor-move select-none z-10"
            style={{ left: `${is.x}%`, top: `${is.y}%`, transform: "translate(-50%, -50%)" }}
            onPointerDown={(e) => { e.stopPropagation(); handleOverlayDrag("interactive", is.id, e); }}>
            <InteractiveStickerPreview type={is.type} data={is.data} />
          </div>
        ))}
      </div>

      {/* Caption input overlay */}
      <AnimatePresence>
        {showCaptionInput && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-end bg-black/80 backdrop-blur-sm p-4 pb-safe">
            <div className="w-full space-y-3">
              <input type="text" placeholder="Add a caption..." value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full rounded-2xl bg-white/10 px-5 py-3.5 text-white placeholder:text-white/40 outline-none text-sm" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setAudience("followers")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${audience === "followers" ? "bg-white text-black" : "bg-white/15 text-white"}`}>
                  Followers
                </button>
                <button onClick={() => setAudience("close_friends")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${audience === "close_friends" ? "bg-green-500 text-white" : "bg-white/15 text-white"}`}>
                  ★ Close Friends
                </button>
              </div>
              <button onClick={() => setShowCaptionInput(false)}
                className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-black">Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool panels */}
      <AnimatePresence>
        {activeTool === "text" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-0 right-0 px-4 z-30">
            <div className="rounded-2xl bg-[#1c1c1e]/95 p-4 backdrop-blur-xl border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Text Style</p>
                <div className="flex gap-1">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button key={a} onClick={() => setTextAlignment(a)}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${textAlignment === a ? "bg-white text-black" : "text-white/50"}`}>
                      {a[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
                {FONT_FAMILIES.map((f, i) => (
                  <button key={f.id} onClick={() => setTextFontIndex(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${textFontIndex === i ? "bg-white text-black" : "bg-white/10 text-white"}`}
                    style={{ fontFamily: f.value }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 mb-3">
                {COLORS.slice(0, 8).map((c) => (
                  <button key={c} onClick={() => setTextColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${textColor === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex gap-1.5 mb-3">
                {BACKGROUND_COLORS.map((bg) => (
                  <button key={bg} onClick={() => setTextBgColor(bg)}
                    className={`h-7 flex-1 rounded-lg border transition-colors ${textBgColor === bg ? "border-white" : "border-white/15"}`}
                    style={{ backgroundColor: bg === "transparent" ? "transparent" : bg }}>
                    {bg === "transparent" && <span className="text-[10px] text-white/50">None</span>}
                  </button>
                ))}
              </div>
              <button onClick={addTextOverlay}
                className="w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black">Add Text</button>
            </div>
          </motion.div>
        )}

        {activeTool === "sticker" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-0 right-0 px-4 z-30">
            <div className="rounded-2xl bg-[#1c1c1e]/95 p-4 backdrop-blur-xl border border-white/10 max-h-[35vh] overflow-y-auto">
              <p className="mb-3 text-xs font-semibold text-white/50 uppercase tracking-wider">Stickers</p>
              <div className="grid grid-cols-8 gap-2">
                {STICKERS.map((e) => (
                  <motion.button key={e} whileTap={{ scale: 1.3 }} onClick={() => addStickerOverlay(e)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-2xl hover:bg-white/15 transition-colors">
                    {e}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTool === "draw" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-0 right-0 px-4 z-30">
            <div className="rounded-2xl bg-[#1c1c1e]/95 p-4 backdrop-blur-xl border border-white/10">
              <p className="mb-3 text-xs font-semibold text-white/50 uppercase tracking-wider">Brush</p>
              <div className="flex gap-1.5 mb-3">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setDrawColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${drawColor === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Minus className="h-3 w-3 text-white/40" />
                <input type="range" min="2" max="20" value={drawWidth}
                  onChange={(e) => setDrawWidth(Number(e.target.value))} className="flex-1 accent-white" />
                <Circle className="h-5 w-5 text-white/40" />
              </div>
            </div>
          </motion.div>
        )}

        {activeTool === "interactive" && !interactiveSetup && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-0 right-0 px-4 z-30">
            <div className="rounded-2xl bg-[#1c1c1e]/95 p-4 backdrop-blur-xl border border-white/10">
              <p className="mb-3 text-xs font-semibold text-white/50 uppercase tracking-wider">Interactive Stickers</p>
              <div className="grid grid-cols-4 gap-2">
                {INTERACTIVE_STICKERS.map(({ type, label, icon: Icon, color }) => (
                  <motion.button key={type} whileTap={{ scale: 0.95 }}
                    onClick={() => setInteractiveSetup({ type })}
                    className="flex flex-col items-center gap-1.5 rounded-xl p-3 bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
                      <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    <span className="text-[10px] text-white/70 font-medium">{label}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Interactive sticker setup forms */}
        {interactiveSetup && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-0 right-0 px-4 z-30">
            <div className="rounded-2xl bg-[#1c1c1e]/95 p-4 backdrop-blur-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                  {interactiveSetup.type.replace("_", " ")}
                </p>
                <button onClick={() => setInteractiveSetup(null)} className="text-white/40"><X className="w-4 h-4" /></button>
              </div>

              {interactiveSetup.type === "poll" && (
                <>
                  <input placeholder="Ask a question..." value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)}
                    className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none" />
                  {pollOptions.map((opt, i) => (
                    <input key={i} placeholder={`Option ${i + 1}`} value={opt}
                      onChange={(e) => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o); }}
                      className="w-full rounded-xl bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none" />
                  ))}
                  {pollOptions.length < 4 && (
                    <button onClick={() => setPollOptions([...pollOptions, ""])} className="text-xs text-primary">+ Add option</button>
                  )}
                </>
              )}

              {interactiveSetup.type === "quiz" && (
                <>
                  <input placeholder="Quiz question..." value={quizQuestion} onChange={(e) => setQuizQuestion(e.target.value)}
                    className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none" />
                  {quizOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input placeholder={`Answer ${i + 1}`} value={opt}
                        onChange={(e) => { const o = [...quizOptions]; o[i] = e.target.value; setQuizOptions(o); }}
                        className="flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none" />
                      <button onClick={() => setQuizCorrect(i)}
                        className={`w-8 h-8 rounded-full text-xs font-bold ${quizCorrect === i ? "bg-green-500 text-white" : "bg-white/10 text-white/40"}`}>
                        ✓
                      </button>
                    </div>
                  ))}
                </>
              )}

              {interactiveSetup.type === "emoji_slider" && (
                <>
                  <input placeholder="How much do you...?" value={sliderQuestion} onChange={(e) => setSliderQuestion(e.target.value)}
                    className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none" />
                  <div className="flex gap-2">
                    {["😍", "🔥", "😂", "😢", "🤮", "💯"].map((e) => (
                      <button key={e} onClick={() => setSliderEmoji(e)}
                        className={`text-2xl p-1 rounded ${sliderEmoji === e ? "bg-white/20" : ""}`}>{e}</button>
                    ))}
                  </div>
                </>
              )}

              {interactiveSetup.type === "question" && (
                <input placeholder="Ask me anything..." value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)}
                  className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none" />
              )}

              {interactiveSetup.type === "countdown" && (
                <>
                  <input placeholder="Countdown title..." value={countdownTitle} onChange={(e) => setCountdownTitle(e.target.value)}
                    className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none" />
                  <input type="datetime-local" value={countdownDate} onChange={(e) => setCountdownDate(e.target.value)}
                    className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white outline-none" />
                </>
              )}

              {interactiveSetup.type === "mention" && (
                <input placeholder="@username" value={mentionUser} onChange={(e) => setMentionUser(e.target.value)}
                  className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none" />
              )}

              {interactiveSetup.type === "location" && (
                <input placeholder="Location name..." value={locationText} onChange={(e) => setLocationText(e.target.value)}
                  className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none" />
              )}

              <button onClick={confirmInteractiveSticker}
                className="w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black">Add to Story</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 pb-safe py-3 z-20">
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowCaptionInput(true)}
          className="flex-1 truncate rounded-full bg-white/10 px-4 py-2.5 text-sm text-white/60 text-left backdrop-blur-sm">
          {caption || "Add caption..."}
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} onClick={handlePublish} disabled={isPublishing}
          className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black disabled:opacity-40 shadow-lg">
          {isPublishing ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Share
        </motion.button>
      </div>
    </div>
  );
}

/* Preview component for interactive stickers in editor */
function InteractiveStickerPreview({ type, data }: { type: string; data: any }) {
  const base = "rounded-2xl p-3 backdrop-blur-xl min-w-[180px] text-center border border-white/20 shadow-xl";
  switch (type) {
    case "poll":
      return (
        <div className={`${base} bg-white/95`}>
          <p className="text-xs font-bold text-black mb-2">{data.question}</p>
          {data.options?.map((opt: string, i: number) => (
            <div key={i} className="mb-1 rounded-lg bg-gray-100 py-1.5 px-3 text-xs font-semibold text-black">{opt}</div>
          ))}
        </div>
      );
    case "quiz":
      return (
        <div className={`${base} bg-purple-600/95`}>
          <p className="text-xs font-bold text-white mb-2">{data.question}</p>
          {data.options?.filter(Boolean).map((opt: string, i: number) => (
            <div key={i} className={`mb-1 rounded-lg py-1.5 px-3 text-xs font-semibold ${
              i === data.correct ? "bg-green-400 text-black" : "bg-white/20 text-white"
            }`}>{opt}</div>
          ))}
        </div>
      );
    case "emoji_slider":
      return (
        <div className={`${base} bg-white/95`}>
          <p className="text-xs font-semibold text-black mb-2">{data.question}</p>
          <div className="h-2 rounded-full bg-gradient-to-r from-gray-200 to-primary relative">
            <span className="absolute -top-3 left-1/2 text-xl">{data.emoji}</span>
          </div>
        </div>
      );
    case "question":
      return (
        <div className={`${base} bg-white/95`}>
          <p className="text-[10px] font-semibold text-gray-500 mb-1">{data.prompt}</p>
          <div className="rounded-lg border border-gray-200 py-2 px-3 text-xs text-gray-400">Type something...</div>
        </div>
      );
    case "countdown":
      return (
        <div className={`${base} bg-gradient-to-br from-purple-500 to-pink-500`}>
          <p className="text-xs font-bold text-white">{data.title}</p>
          <p className="text-2xl font-black text-white mt-1">00:00:00</p>
        </div>
      );
    case "mention":
      return (
        <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-black shadow-lg">
          @{data.username}
        </div>
      );
    case "location":
      return (
        <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black shadow-lg">
          <MapPin className="w-3.5 h-3.5" /> {data.name}
        </div>
      );
    default:
      return null;
  }
}
