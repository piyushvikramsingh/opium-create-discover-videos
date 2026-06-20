import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

interface Props {
  streamId: string;
  viewerId: string;
  broadcasterId: string;
  onError?: (message: string) => void;
}

/**
 * Viewer side: announces itself on the per-stream Realtime channel, accepts
 * the broadcaster's offer, replies with an answer, and renders the incoming
 * media stream.
 */
export default function LiveViewer({ streamId, viewerId, broadcasterId, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [state, setState] = useState<"connecting" | "live" | "ended">("connecting");

  useEffect(() => {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;

    const remote = new MediaStream();
    if (videoRef.current) {
      videoRef.current.srcObject = remote;
    }
    peer.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => remote.addTrack(t));
      setState("live");
    };

    const channel = supabase.channel(`live:${streamId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        channel.send({
          type: "broadcast",
          event: "ice",
          payload: { to: broadcasterId, from: viewerId, candidate: e.candidate.toJSON() },
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        setState("ended");
      }
    };

    channel.on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (payload?.to !== viewerId) return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      channel.send({
        type: "broadcast",
        event: "answer",
        payload: { to: broadcasterId, from: viewerId, sdp: answer },
      });
    });

    channel.on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (payload?.to !== viewerId) return;
      try {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        /* ignore */
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: "viewer-join",
          payload: { viewerId, broadcasterId },
        });
      } else if (status === "CHANNEL_ERROR") {
        onError?.("Could not connect to live stream");
      }
    });

    return () => {
      try {
        channel.send({
          type: "broadcast",
          event: "viewer-leave",
          payload: { viewerId },
        });
      } catch {
        /* ignore */
      }
      peer.close();
      peerRef.current = null;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, viewerId, broadcasterId]);

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="aspect-video w-full rounded-xl bg-black object-cover"
      />
      <p className="text-xs text-muted-foreground">
        {state === "connecting" && "Connecting…"}
        {state === "live" && "● Live"}
        {state === "ended" && "Stream ended"}
      </p>
    </div>
  );
}
