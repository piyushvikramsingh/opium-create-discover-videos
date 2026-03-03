import { useState } from "react";
import { Search, X, Smile, Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useGifKeyboard,
  useStickerPacks,
  useStickersInPack,
  type Sticker,
  type GifResult,
} from "@/hooks/useGifKeyboard";
import { cn } from "@/lib/utils";

interface GifStickerKeyboardProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (gif: GifResult) => void;
  onSelectSticker: (sticker: Sticker) => void;
}

/**
 * Inline GIF & Sticker keyboard for the chat input area.
 * Appears as a sheet when opened, with tabs for GIFs and Stickers.
 */
export function GifStickerKeyboard({
  isOpen,
  onClose,
  onSelectGif,
  onSelectSticker,
}: GifStickerKeyboardProps) {
  if (!isOpen) return null;

  return (
    <div className="border-t border-border bg-card animate-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between px-3 py-2">
        <Tabs defaultValue="gif" className="w-full">
          <div className="flex items-center justify-between">
            <TabsList className="h-8">
              <TabsTrigger value="gif" className="text-xs px-3 h-7">
                <ImageIcon className="w-3 h-3 mr-1" />
                GIFs
              </TabsTrigger>
              <TabsTrigger value="sticker" className="text-xs px-3 h-7">
                <Smile className="w-3 h-3 mr-1" />
                Stickers
              </TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <TabsContent value="gif" className="mt-2">
            <GifTab onSelect={onSelectGif} />
          </TabsContent>

          <TabsContent value="sticker" className="mt-2">
            <StickerTab onSelect={onSelectSticker} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── GIF Tab ────────────────────────────────────────────────────────────

function GifTab({ onSelect }: { onSelect: (gif: GifResult) => void }) {
  const { query, setQuery, results, isLoading } = useGifKeyboard();

  return (
    <div className="space-y-2">
      <div className="relative px-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search GIFs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <div className="h-48 overflow-y-auto px-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {query.length >= 2 ? "No GIFs found" : "Search for GIFs"}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {results.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif)}
                className="aspect-square bg-secondary rounded-lg overflow-hidden hover:opacity-80 transition flex items-center justify-center"
              >
                {gif.preview_url ? (
                  <img
                    src={gif.preview_url}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-2xl">{gif.title.split(" ")[0]}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sticker Tab ────────────────────────────────────────────────────────

function StickerTab({ onSelect }: { onSelect: (sticker: Sticker) => void }) {
  const { data: packs = [], isLoading: packsLoading } = useStickerPacks();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const currentPackId = selectedPackId ?? packs[0]?.id ?? "";
  const { data: stickers = [], isLoading: stickersLoading } = useStickersInPack(currentPackId);

  if (packsLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Pack selector */}
      {packs.length > 0 && (
        <div className="flex gap-1 overflow-x-auto px-1 pb-1">
          {packs.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setSelectedPackId(pack.id)}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-lg bg-secondary overflow-hidden border-2 transition",
                currentPackId === pack.id ? "border-primary" : "border-transparent"
              )}
            >
              {pack.cover_url ? (
                <img src={pack.cover_url} alt={pack.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs">
                  {pack.name[0]}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Sticker grid */}
      <div className="h-44 overflow-y-auto px-1">
        {stickersLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : stickers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No stickers in this pack
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {stickers.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => onSelect(sticker)}
                className="aspect-square bg-secondary/50 rounded-lg overflow-hidden hover:bg-secondary transition flex items-center justify-center p-1"
              >
                {sticker.image_url ? (
                  <img
                    src={sticker.image_url}
                    alt={sticker.emoji_shortcode ?? ""}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-2xl">{sticker.emoji_shortcode ?? "😀"}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
