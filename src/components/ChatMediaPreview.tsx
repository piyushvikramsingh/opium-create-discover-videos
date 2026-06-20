import { useChatMediaUrl } from "@/hooks/useChatMediaUrl";

interface Props {
  src: string | null | undefined;
  mediaType?: string | null;
  className?: string;
}

/**
 * Renders chat media (image/video/audio) from a stored path or legacy public URL,
 * resolving a signed URL on demand so the chat-media bucket can remain private.
 */
export default function ChatMediaPreview({ src, mediaType, className }: Props) {
  const url = useChatMediaUrl(src);
  if (!src) return null;
  if (!url) {
    return (
      <div className={`flex h-40 w-full items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground ${className ?? ""}`}>
        Loading…
      </div>
    );
  }
  if (mediaType === "video") {
    return (
      <video
        src={url}
        className={`max-h-56 w-full rounded-xl object-cover ${className ?? ""}`}
        controls
        playsInline
      />
    );
  }
  if (mediaType === "audio") {
    return <audio src={url} controls className={`w-full rounded-xl ${className ?? ""}`} />;
  }
  return <img src={url} alt="" className={`max-h-56 w-full rounded-xl object-cover ${className ?? ""}`} />;
}
