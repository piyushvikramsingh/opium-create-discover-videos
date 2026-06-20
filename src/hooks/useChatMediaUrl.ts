import { useEffect, useState } from "react";
import { getChatMediaSignedUrl } from "@/lib/chatMedia";

/**
 * Resolve a chat-media path or legacy public URL into a fresh signed URL.
 * Returns null while loading or if resolution fails.
 */
export function useChatMediaUrl(input: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!input) {
      setUrl(null);
      return;
    }
    getChatMediaSignedUrl(input).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [input]);

  return url;
}
