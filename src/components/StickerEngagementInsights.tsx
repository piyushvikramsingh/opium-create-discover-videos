import { usePollResults, useQuizResults, useEmojiSliderAverage, useQuestionResponses, StorySticker } from "@/hooks/useStoryStickers";
import { BarChart3, HelpCircle, MessageSquare, Smile } from "lucide-react";

interface StickerInsightsProps {
  stickers: StorySticker[];
}

export default function StickerEngagementInsights({ stickers }: StickerInsightsProps) {
  const interactiveStickers = stickers.filter(s =>
    ["poll", "quiz", "emoji_slider", "question"].includes(s.sticker_type)
  );

  if (interactiveStickers.length === 0) return null;

  return (
    <div className="space-y-3 mt-3">
      <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Sticker Engagement</p>
      {interactiveStickers.map(sticker => (
        <StickerInsightCard key={sticker.id} sticker={sticker} />
      ))}
    </div>
  );
}

function StickerInsightCard({ sticker }: { sticker: StorySticker }) {
  switch (sticker.sticker_type) {
    case "poll": return <PollInsight sticker={sticker} />;
    case "quiz": return <QuizInsight sticker={sticker} />;
    case "emoji_slider": return <SliderInsight sticker={sticker} />;
    case "question": return <QuestionInsight sticker={sticker} />;
    default: return null;
  }
}

function PollInsight({ sticker }: { sticker: StorySticker }) {
  const { data } = usePollResults(sticker.id);
  const options = sticker.data?.options || [];

  return (
    <div className="rounded-lg bg-white/5 p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 className="w-3.5 h-3.5 text-orange-400" />
        <span className="text-[11px] font-semibold text-white">Poll: {sticker.data?.question}</span>
        <span className="text-[10px] text-white/40 ml-auto">{data?.total || 0} votes</span>
      </div>
      {options.map((opt: string, i: number) => {
        const count = data?.counts?.[i] || 0;
        const pct = data?.total ? Math.round((count / data.total) * 100) : 0;
        return (
          <div key={i} className="mb-1">
            <div className="flex items-center justify-between text-[10px] text-white/70 mb-0.5">
              <span>{opt}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-orange-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizInsight({ sticker }: { sticker: StorySticker }) {
  const { data } = useQuizResults(sticker.id);
  const options = (sticker.data?.options || []).filter(Boolean);
  const correctIdx = sticker.data?.correct ?? 0;

  return (
    <div className="rounded-lg bg-white/5 p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[11px] font-semibold text-white">Quiz: {sticker.data?.question}</span>
        <span className="text-[10px] text-white/40 ml-auto">{data?.total || 0} answers</span>
      </div>
      {options.map((opt: string, i: number) => {
        const count = data?.counts?.[i] || 0;
        const pct = data?.total ? Math.round((count / data.total) * 100) : 0;
        const isCorrect = i === correctIdx;
        return (
          <div key={i} className="mb-1">
            <div className="flex items-center justify-between text-[10px] text-white/70 mb-0.5">
              <span className={isCorrect ? "text-green-400 font-semibold" : ""}>{isCorrect ? "✓ " : ""}{opt}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isCorrect ? "bg-green-400" : "bg-purple-400"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SliderInsight({ sticker }: { sticker: StorySticker }) {
  const { data } = useEmojiSliderAverage(sticker.id);

  return (
    <div className="rounded-lg bg-white/5 p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Smile className="w-3.5 h-3.5 text-pink-400" />
        <span className="text-[11px] font-semibold text-white">Slider: {sticker.data?.question}</span>
        <span className="text-[10px] text-white/40 ml-auto">{data?.total || 0} votes</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden relative">
          <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-red-400 transition-all" style={{ width: `${(data?.average ?? 0) * 100}%` }} />
        </div>
        <span className="text-lg">{sticker.data?.emoji}</span>
        <span className="text-xs text-white/60 font-medium">{Math.round((data?.average ?? 0) * 100)}%</span>
      </div>
    </div>
  );
}

function QuestionInsight({ sticker }: { sticker: StorySticker }) {
  const { data: responses = [] } = useQuestionResponses(sticker.id);

  return (
    <div className="rounded-lg bg-white/5 p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="w-3.5 h-3.5 text-green-400" />
        <span className="text-[11px] font-semibold text-white">Q&A: {sticker.data?.prompt}</span>
        <span className="text-[10px] text-white/40 ml-auto">{responses.length} responses</span>
      </div>
      {responses.length === 0 ? (
        <p className="text-[10px] text-white/40">No responses yet</p>
      ) : (
        <div className="space-y-1.5 max-h-24 overflow-y-auto">
          {responses.slice(0, 5).map((r, i) => (
            <div key={i} className="text-[10px] text-white/70">
              <span className="text-white/40">{r.user.username}:</span> {r.response_text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
