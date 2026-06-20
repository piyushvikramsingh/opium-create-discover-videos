import { supabase } from "@/integrations/supabase/client";

const CHAT_BUCKET = "chat-media";
const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_BEFORE_MS = 60 * 1000; // refresh when <60s left

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/**
 * Extract the storage path from either a bare path or a full public/signed URL.
 * Returns null if the input is not a chat-media reference.
 */
export function extractChatMediaPath(input: string | null | undefined): string | null {
  if (!input) return null;
  if (!input.includes("://") && !input.startsWith("/")) {
    // Already a path
    return input;
  }
  // Match .../storage/v1/object/(public|sign)/chat-media/<path>?...
  const match = input.match(/\/storage\/v1\/object\/(?:public|sign)\/chat-media\/([^?]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

/**
 * Return a signed URL for a chat-media object. Accepts either a storage path
 * or a legacy full public URL. Cached per-path until shortly before expiry.
 */
export async function getChatMediaSignedUrl(input: string | null | undefined): Promise<string | null> {
  const path = extractChatMediaPath(input);
  if (!path) return null;

  const now = Date.now();
  const cached = cache.get(path);
  if (cached && cached.expiresAt - now > REFRESH_BEFORE_MS) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  cache.set(path, {
    url: data.signedUrl,
    expiresAt: now + SIGNED_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/**
 * Upload a file to chat-media and return the storage path (NOT a URL).
 * Store the returned path in messages.media_url.
 */
export async function uploadChatMedia(
  userId: string,
  file: Blob,
  filename: string,
  contentType: string,
): Promise<string> {
  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, file, { contentType });
  if (error) throw error;
  return path;
}
