import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  type StorySticker,
  useVotePoll,
  usePollResults,
  useAnswerQuiz,
  useQuizResults,
  useRespondToQuestion,
  useQuestionResponses,
  useVoteEmojiSlider,
  useEmojiSliderAverage,
} from "@/hooks/useStoryStickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, BarChart3, Check, X } from "lucide-react";

interface InteractiveStickerProps {
  sticker: StorySticker;
  isOwner: boolean;
  onPause: () => void;
  onResume: () => void;
}

export function InteractiveSticker({ sticker, isOwner, onPause, onResume }: InteractiveStickerProps) {
  switch (sticker.sticker_type) {
    case "poll":
      return <PollSticker sticker={sticker} isOwner={isOwner} />;
    case "quiz":
      return <QuizSticker sticker={sticker} isOwner={isOwner} />;
    case "question":
      return (
        <QuestionSticker
          sticker={sticker}
          isOwner={isOwner}
          onPause={onPause}
          onResume={onResume}
        />
      );
    case "countdown":
      return <CountdownSticker sticker={sticker} />;
    case "emoji_slider":
      return <EmojiSliderSticker sticker={sticker} isOwner={isOwner} />;
    case "link":
      return <LinkSticker sticker={sticker} />;
    case "mention":
      return <MentionSticker sticker={sticker} />;
    case "location":
      return <LocationSticker sticker={sticker} />;
    case "music":
      return <MusicSticker sticker={sticker} />;
    default:
      return null;
  }
}

// ── Poll ────────────────────────────────────────────────────────────────

function PollSticker({ sticker, isOwner }: { sticker: StorySticker; isOwner: boolean }) {
  const [voted, setVoted] = useState(false);
  const votePoll = useVotePoll();
  const { data: results } = usePollResults(sticker.id);

  const question = sticker.data.question as string;
  const options = (sticker.data.options ?? []) as string[];

  const handleVote = (index: number) => {
    if (voted || isOwner) return;
    setVoted(true);
    votePoll.mutate({ sticker_id: sticker.id, option_index: index });
  };

  return (
    <div className="bg-white rounded-xl p-3 w-64 shadow-lg">
      <p className="font-bold text-black text-center text-sm mb-2">{question}</p>
      {options.map((opt: string, i: number) => {
        const count = results?.counts[i] ?? 0;
        const pct = results?.total ? Math.round((count / results.total) * 100) : 0;

        return (
          <button
            key={i}
            onClick={() => handleVote(i)}
            className={cn(
              "w-full mb-1 py-2 px-3 rounded-lg text-sm text-left transition-all relative overflow-hidden",
              voted || isOwner
                ? "bg-gray-100 text-black"
                : "bg-gray-50 hover:bg-gray-100 text-black cursor-pointer"
            )}
          >
            {(voted || isOwner) && (
              <div
                className="absolute inset-0 bg-purple-200/50 transition-all"
                style={{ width: `${pct}%` }}
              />
            )}
            <span className="relative z-10 flex justify-between">
              <span>{opt}</span>
              {(voted || isOwner) && <span className="font-semibold">{pct}%</span>}
            </span>
          </button>
        );
      })}
      {results && (
        <p className="text-xs text-center text-gray-400 mt-1">
          {results.total} vote{results.total !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ── Quiz ────────────────────────────────────────────────────────────────

function QuizSticker({ sticker, isOwner }: { sticker: StorySticker; isOwner: boolean }) {
  const [answered, setAnswered] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const answerQuiz = useAnswerQuiz();
  const { data: results } = useQuizResults(sticker.id);

  const question = sticker.data.question as string;
  const options = (sticker.data.options ?? []) as string[];
  const correctIndex = sticker.data.correct_index as number;

  const handleAnswer = (index: number) => {
    if (answered || isOwner) return;
    setSelectedIdx(index);
    setAnswered(true);
    answerQuiz.mutate({ stickerId: sticker.id, selectedIndex: index });
  };

  return (
    <div className="bg-purple-600 rounded-xl p-3 w-64 shadow-lg">
      <p className="font-bold text-white text-center text-sm mb-2">{question}</p>
      {options.map((opt: string, i: number) => {
        const isCorrect = i === correctIndex;
        const isSelected = i === selectedIdx;
        const showResult = answered || isOwner;

        return (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            className={cn(
              "w-full mb-1 py-2 px-3 rounded-lg text-sm text-left transition-all text-white",
              showResult && isCorrect && "bg-green-500",
              showResult && isSelected && !isCorrect && "bg-red-500",
              !showResult && "bg-white/20 hover:bg-white/30 cursor-pointer",
              showResult && !isCorrect && !isSelected && "bg-white/10"
            )}
          >
            <span className="flex items-center gap-2">
              {showResult && isCorrect && <Check className="w-4 h-4" />}
              {showResult && isSelected && !isCorrect && <X className="w-4 h-4" />}
              {opt}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Question / Q&A ──────────────────────────────────────────────────────

function QuestionSticker({
  sticker,
  isOwner,
  onPause,
  onResume,
}: {
  sticker: StorySticker;
  isOwner: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  const [response, setResponse] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submitResponse = useRespondToQuestion();
  const { data: responses } = useQuestionResponses(sticker.id);

  const prompt = (sticker.data.prompt as string) || "Ask me anything";

  const handleSubmit = () => {
    if (!response.trim()) return;
    setSubmitted(true);
    submitResponse.mutate({ stickerId: sticker.id, responseText: response.trim() });
    onResume();
  };

  if (isOwner && responses) {
    return (
      <div className="bg-white rounded-xl p-3 w-64 shadow-lg max-h-48 overflow-y-auto">
        <p className="font-bold text-black text-sm mb-2">{prompt}</p>
        <p className="text-xs text-gray-400 mb-2">{responses.length} responses</p>
        {responses.slice(0, 5).map((r, i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
              {r.user.username[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600">{r.user.username}</p>
              <p className="text-sm text-black">{r.response_text}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-3 w-64 shadow-lg">
      <p className="font-bold text-black text-center text-base mb-2">{prompt}</p>
      {submitted ? (
        <p className="text-center text-green-600 text-sm">Thanks for your response! ✨</p>
      ) : (
        <div className="flex gap-1">
          <Input
            placeholder="Type your answer..."
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onFocus={onPause}
            onBlur={onResume}
            className="text-black text-sm"
          />
          <Button size="sm" onClick={handleSubmit} disabled={!response.trim()}>
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Countdown ──────────────────────────────────────────────────────────

function CountdownSticker({ sticker }: { sticker: StorySticker }) {
  const name = (sticker.data.name as string) || "Countdown";
  const endsAt = sticker.data.ends_at ? new Date(sticker.data.ends_at as string) : null;

  const [timeLeft, setTimeLeft] = useState(() => {
    if (!endsAt) return null;
    const diff = endsAt.getTime() - Date.now();
    return diff > 0 ? diff : 0;
  });

  // Simple countdown effect
  const hours = timeLeft ? Math.floor(timeLeft / 3600000) : 0;
  const mins = timeLeft ? Math.floor((timeLeft % 3600000) / 60000) : 0;
  const secs = timeLeft ? Math.floor((timeLeft % 60000) / 1000) : 0;

  return (
    <div className="bg-red-500 rounded-xl px-4 py-3 shadow-lg text-center min-w-[160px]">
      <p className="text-white font-bold text-sm">{name}</p>
      <p className="text-white text-2xl font-mono font-bold mt-1">
        {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}:
        {String(secs).padStart(2, "0")}
      </p>
    </div>
  );
}

// ── Emoji Slider ───────────────────────────────────────────────────────

function EmojiSliderSticker({ sticker, isOwner }: { sticker: StorySticker; isOwner: boolean }) {
  const [voted, setVoted] = useState(false);
  const [localValue, setLocalValue] = useState(0.5);
  const voteSlider = useVoteEmojiSlider();
  const { data: avg } = useEmojiSliderAverage(sticker.id);

  const prompt = (sticker.data.prompt as string) || "";
  const emoji = (sticker.data.emoji as string) || "🔥";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalValue(val);
  };

  const handleCommit = () => {
    if (voted || isOwner) return;
    setVoted(true);
    voteSlider.mutate({ stickerId: sticker.id, value: localValue });
  };

  const displayValue = voted || isOwner ? (avg?.average ?? 0.5) : localValue;

  return (
    <div className="bg-white rounded-2xl p-3 w-64 shadow-lg">
      {prompt && <p className="font-bold text-black text-center text-sm mb-2">{prompt}</p>}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={displayValue}
          onChange={handleChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          disabled={voted || isOwner}
          className="flex-1 accent-purple-500"
        />
        <span className="text-2xl">{emoji}</span>
      </div>
      {avg && (
        <p className="text-xs text-center text-gray-400 mt-1">
          {avg.total} response{avg.total !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ── Link ───────────────────────────────────────────────────────────────

function LinkSticker({ sticker }: { sticker: StorySticker }) {
  const url = sticker.data.url as string;
  const label = (sticker.data.label as string) || "See More";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-full px-5 py-2.5 shadow-lg flex items-center gap-2 hover:bg-gray-50 transition"
    >
      <ExternalLink className="w-4 h-4 text-black" />
      <span className="text-black font-semibold text-sm">{label}</span>
    </a>
  );
}

// ── Mention ────────────────────────────────────────────────────────────

function MentionSticker({ sticker }: { sticker: StorySticker }) {
  const username = sticker.data.username as string;

  return (
    <div className="bg-black/30 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
      <span className="text-white font-bold text-sm">@{username}</span>
    </div>
  );
}

// ── Location ───────────────────────────────────────────────────────────

function LocationSticker({ sticker }: { sticker: StorySticker }) {
  const locationName = (sticker.data.name as string) || "Location";

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-1">
      <span className="text-lg">📍</span>
      <span className="text-black font-semibold text-sm">{locationName}</span>
    </div>
  );
}

// ── Music ──────────────────────────────────────────────────────────────

function MusicSticker({ sticker }: { sticker: StorySticker }) {
  const title = (sticker.data.title as string) || "Music";
  const artist = (sticker.data.artist as string) || "";

  return (
    <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2 min-w-[140px]">
      <div className="w-8 h-8 rounded bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
        <span className="text-white text-sm">♪</span>
      </div>
      <div>
        <p className="text-white font-semibold text-xs leading-tight">{title}</p>
        {artist && <p className="text-white/60 text-xs">{artist}</p>}
      </div>
    </div>
  );
}
