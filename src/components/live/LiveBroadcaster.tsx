import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

interface Props {
  streamId: string;
  userId: string;
  onLocalStream?: (stream: MediaStream | null) => void;
  onError?: (message: string) => void;
}

/**
 * Broadcaster side: captures camera/mic and serves a fresh WebRTC offer to
 * every viewer that announces itself on the per-stream Realtime channel.
 *
 * NOTE: This is a WebRTC mesh and is suitable for small audiences only.
 * For >50 concurrent viewers, route through an SFU/HLS service (LiveKit, Mux).
 */
export default function LiveBroadcaster({ streamId, userId, onLocalStream, onError }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = media;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = media;
        }
        onLocalStream?.(media);

        const channel = supabase.channel(`live:${streamId}`, {
          config: { broadcast: { self: false } },
        });
        channelRef.current = channel;

        channel.on("broadcast", { event: "viewer-join" }, async ({ payload }) => {
          const viewerId = payload?.viewerId as string;
          if (!viewerId || peersRef.current.has(viewerId)) return;

          const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          peersRef.current.set(viewerId, peer);
          setViewerCount(peersRef.current.size);

          media.getTracks().forEach((track) => peer.addTrack(track, media));

          peer.onicecandidate = (e) => {
            if (e.candidate) {
              channel.send({
                type: "broadcast",
                event: "ice",
                payload: { to: viewerId, from: userId, candidate: e.candidate.toJSON() },
              });
            }
          };

          peer.onconnectionstatechange = () => {
            if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
              peer.close();
              peersRef.current.delete(viewerId);
              setViewerCount(peersRef.current.size);
            }
          };

          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          channel.send({
            type: "broadcast",
            event: "offer",
            payload: { to: viewerId, from: userId, sdp: offer },
          });
        });

        channel.on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (payload?.to !== userId) return;
          const peer = peersRef.current.get(payload.from);
          if (!peer) return;
          await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        });

        channel.on("broadcast", { event: "ice" }, async ({ payload }) => {
          if (payload?.to !== userId) return;
          const peer = peersRef.current.get(payload.from);
          if (!peer || !payload.candidate) return;
          try {
            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            /* ignore */
          }
        });

        channel.on("broadcast", { event: "viewer-leave" }, ({ payload }) => {
          const viewerId = payload?.viewerId as string;
          const peer = peersRef.current.get(viewerId);
          if (peer) {
            peer.close();
            peersRef.current.delete(viewerId);
            setViewerCount(peersRef.current.size);
          }
        });

        await channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.send({
              type: "broadcast",
              event: "broadcaster-ready",
              payload: { broadcasterId: userId },
            });
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not start camera";
        onError?.(msg);
      }
    }

    void start();

    return () => {
      cancelled = true;
      peersRef.current.forEach((p) => p.close());
      peersRef.current.clear();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      onLocalStream?.(null);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, userId]);

  return (
    <div className="space-y-2">
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="aspect-video w-full rounded-xl bg-black object-cover"
      />
      <p className="text-xs text-muted-foreground">
        Live · {viewerCount} viewer{viewerCount === 1 ? "" : "s"} connected
      </p>
    </div>
  );
}
