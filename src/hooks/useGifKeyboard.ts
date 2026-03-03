import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

export interface StickerPack {
  id: string;
  name: string;
  cover_url: string | null;
  sticker_count?: number;
}

export interface Sticker {
  id: string;
  pack_id: string;
  image_url: string;
  emoji_shortcode?: string | null;
}

export type GifResult = {
  id: string;
  url: string;
  preview_url: string;
  title: string;
  width: number;
  height: number;
};

// ── Sticker Packs ──────────────────────────────────────────────────────

export function useStickerPacks() {
  return useQuery({
    queryKey: ["sticker-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sticker_packs")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        cover_url: row.cover_url,
        sticker_count: 0,
      })) as StickerPack[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useStickersInPack(packId: string) {
  return useQuery({
    queryKey: ["stickers", packId],
    enabled: !!packId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stickers")
        .select("*")
        .eq("pack_id", packId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        pack_id: row.pack_id,
        image_url: row.url,
        emoji_shortcode: null,
      })) as Sticker[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── GIF Search (using Supabase as proxy — in production connect Giphy/Tenor) ──

/**
 * Local GIF keyboard state management.
 * In production, replace with Giphy/Tenor API calls.
 */
export function useGifKeyboard() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["gifs", query],
    enabled: query.length >= 2 && isOpen,
    queryFn: async () => {
      // Placeholder: in production, call Giphy/Tenor API
      // For now, return emoji-based placeholder results
      const placeholders: GifResult[] = [
        { id: "1", url: "", preview_url: "", title: "👋 Wave", width: 200, height: 200 },
        { id: "2", url: "", preview_url: "", title: "😂 Laugh", width: 200, height: 200 },
        { id: "3", url: "", preview_url: "", title: "🔥 Fire", width: 200, height: 200 },
        { id: "4", url: "", preview_url: "", title: "💯 100", width: 200, height: 200 },
        { id: "5", url: "", preview_url: "", title: "❤️ Heart", width: 200, height: 200 },
        { id: "6", url: "", preview_url: "", title: "👏 Clap", width: 200, height: 200 },
        { id: "7", url: "", preview_url: "", title: "🥳 Party", width: 200, height: 200 },
        { id: "8", url: "", preview_url: "", title: "🤣 ROFL", width: 200, height: 200 },
      ].filter((g) =>
        g.title.toLowerCase().includes(query.toLowerCase())
      );
      return placeholders;
    },
    staleTime: 60 * 1000,
  });

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    isOpen,
    open,
    close,
  };
}

// ── Send sticker/GIF as message ────────────────────────────────────────

export function useSendSticker() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      stickerUrl,
    }: {
      conversationId: string;
      stickerUrl: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        media_url: stickerUrl,
        media_type: "sticker",
      });
      if (error) throw error;
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSendGif() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      gifUrl,
    }: {
      conversationId: string;
      gifUrl: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        media_url: gifUrl,
        media_type: "gif",
      });
      if (error) throw error;
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
