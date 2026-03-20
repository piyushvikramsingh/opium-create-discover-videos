import { useState, useRef } from "react";
import { Search, X, Music, Play, Pause, TrendingUp } from "lucide-react";
import { useMusicTracks, MusicTrack } from "@/hooks/useMusicTracks";
import { motion, AnimatePresence } from "framer-motion";

interface MusicSelectorProps {
  onSelect: (track: MusicTrack) => void;
  onClose: () => void;
  selectedTrack?: MusicTrack | null;
}

export default function MusicSelector({ onSelect, onClose, selectedTrack }: MusicSelectorProps) {
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { data: tracks = [], isLoading } = useMusicTracks(search);

  const togglePlay = (track: MusicTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      // No real preview URL, just simulate
      setPlayingId(track.id);
      setTimeout(() => setPlayingId(null), 3000);
    }
  };

  return (
    <motion.div
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="absolute inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={onClose} className="text-white/60">
          <X className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-white">Music</span>
        <div className="w-5" />
      </div>

      <div className="px-4 py-2">
        <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search songs or artists..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
            autoFocus
          />
        </div>
      </div>

      {selectedTrack && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-white/10 p-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Music className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{selectedTrack.title}</p>
            <p className="text-xs text-white/50 truncate">{selectedTrack.artist}</p>
          </div>
          <span className="text-[10px] font-bold text-green-400 bg-green-400/20 px-2 py-0.5 rounded-full">Selected</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-safe">
        {!search && (
          <div className="flex items-center gap-1.5 py-2 text-white/50">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">Trending</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : tracks.length === 0 ? (
          <p className="text-center text-white/40 text-sm py-8">No tracks found</p>
        ) : (
          <div className="space-y-1">
            {tracks.map((track) => (
              <button
                key={track.id}
                onClick={() => onSelect(track)}
                className={`w-full flex items-center gap-3 rounded-xl p-2.5 transition-colors text-left ${
                  selectedTrack?.id === track.id ? "bg-white/15" : "hover:bg-white/5 active:bg-white/10"
                }`}
              >
                <div className="relative w-11 h-11 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
                  <Music className="w-5 h-5 text-white" />
                  {playingId === track.id && (
                    <motion.div
                      className="absolute inset-0 rounded-lg border-2 border-white/60"
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{track.title}</p>
                  <p className="text-xs text-white/50 truncate">{track.artist}</p>
                </div>
                <div className="flex items-center gap-2">
                  {track.is_trending && (
                    <span className="text-[9px] font-bold text-orange-400 bg-orange-400/20 px-1.5 py-0.5 rounded">🔥</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePlay(track); }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                  >
                    {playingId === track.id ? (
                      <Pause className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                    )}
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
