import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Radio, Send, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateLiveStream,
  useLiveComments,
  useLiveStreams,
  useSendLiveComment,
  useUpdateStreamStatus,
} from "@/hooks/useLive";
import { useAuth } from "@/hooks/useAuth";
import LiveBroadcaster from "@/components/live/LiveBroadcaster";
import LiveViewer from "@/components/live/LiveViewer";
import { toast } from "sonner";

type LiveStreamItem = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  status: "live" | "scheduled" | "ended" | string;
  viewer_count?: number | null;
  scheduled_start?: string | null;
};

type LiveCommentItem = {
  id: string;
  content: string;
  created_at: string;
};

const LiveStreaming = () => {
  const { user } = useAuth();
  const { data: streamsData = [] } = useLiveStreams();
  const createStream = useCreateLiveStream();
  const updateStreamStatus = useUpdateStreamStatus();
  const [activeStream, setActiveStream] = useState<{
    id: string;
    broadcasterId: string;
    mode: "broadcast" | "view";
  } | null>(null);
  const { data: commentsData = [] } = useLiveComments(activeStream?.id ?? null);
  const sendComment = useSendLiveComment();
  const streams = streamsData as LiveStreamItem[];
  const comments = commentsData as LiveCommentItem[];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [commentText, setCommentText] = useState("");

  const liveStreams = useMemo(() => streams.filter((s) => s.status === "live"), [streams]);
  const scheduledStreams = useMemo(
    () => streams.filter((s) => s.status === "scheduled"),
    [streams],
  );

  // Auto-clear the active stream view when it ends.
  useEffect(() => {
    if (!activeStream) return;
    const current = streams.find((s) => s.id === activeStream.id);
    if (current && current.status === "ended") {
      setActiveStream(null);
    }
  }, [streams, activeStream]);

  const handleGoLive = async () => {
    if (!title.trim() || !user) return;
    try {
      const created = await createStream.mutateAsync({
        title: title.trim(),
        description: description || null,
      });
      setTitle("");
      setDescription("");
      setActiveStream({ id: created.id, broadcasterId: user.id, mode: "broadcast" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start stream");
    }
  };

  const handleOpenViewer = (stream: LiveStreamItem) => {
    if (!user) return;
    setActiveStream({ id: stream.id, broadcasterId: stream.user_id, mode: "view" });
  };

  const handleClose = async () => {
    if (activeStream?.mode === "broadcast") {
      await updateStreamStatus.mutateAsync({ streamId: activeStream.id, status: "ended" });
    }
    setActiveStream(null);
  };

  return (
    <div className="ig-screen-spring ig-modern-page min-h-screen bg-background p-4 pb-20 pt-safe fade-in">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="ig-type-h1 text-foreground">Live Streaming</h1>
          <p className="ig-type-sub mt-1">Go live now or schedule a live session.</p>
        </div>

        {activeStream && user ? (
          <Card className="ig-modern-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className="h-4 w-4 text-red-500" />
                {activeStream.mode === "broadcast" ? "You are live" : "Watching live"}
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={handleClose} aria-label="Close live view">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeStream.mode === "broadcast" ? (
                <LiveBroadcaster
                  streamId={activeStream.id}
                  userId={user.id}
                  onError={(m) => toast.error(m)}
                />
              ) : (
                <LiveViewer
                  streamId={activeStream.id}
                  viewerId={user.id}
                  broadcasterId={activeStream.broadcasterId}
                  onError={(m) => toast.error(m)}
                />
              )}

              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground">Be the first to comment.</p>
                )}
                {comments.map((comment) => (
                  <p key={comment.id} className="text-sm">
                    <span className="text-muted-foreground">
                      {new Date(comment.created_at).toLocaleTimeString()} ·{" "}
                    </span>
                    {comment.content}
                  </p>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  className="ig-control-md"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Send message"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentText.trim()) {
                      sendComment.mutate({
                        streamId: activeStream.id,
                        content: commentText.trim(),
                      });
                      setCommentText("");
                    }
                  }}
                />
                <Button
                  className="ig-control-md"
                  onClick={() => {
                    if (!commentText.trim()) return;
                    sendComment.mutate({
                      streamId: activeStream.id,
                      content: commentText.trim(),
                    });
                    setCommentText("");
                  }}
                  disabled={sendComment.isPending}
                  aria-label="Send comment"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="ig-modern-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="h-4 w-4" /> Create Stream
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                className="ig-control-md"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Stream title"
              />
              <Input
                className="ig-control-md"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
              />
              <Input
                className="ig-control-md"
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                placeholder="Optional schedule"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  className="ig-control-md"
                  onClick={handleGoLive}
                  disabled={createStream.isPending || !user}
                >
                  <Radio className="mr-2 h-4 w-4" /> Go Live Now
                </Button>
                <Button
                  variant="outline"
                  className="ig-control-md"
                  onClick={() => {
                    if (!title.trim() || !scheduledStart) return;
                    createStream.mutate({
                      title: title.trim(),
                      description: description || null,
                      scheduled_start: new Date(scheduledStart).toISOString(),
                    });
                    setTitle("");
                    setDescription("");
                    setScheduledStart("");
                  }}
                  disabled={createStream.isPending}
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Schedule
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Live uses WebRTC peer-to-peer — great for small audiences. For thousands of
                viewers, hook in an SFU/HLS provider (LiveKit, Mux) later.
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="live" className="w-full">
          <TabsList className="flex w-full max-w-md gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0">
            <TabsTrigger className="ig-tab-trigger shrink-0" value="live">
              Live ({liveStreams.length})
            </TabsTrigger>
            <TabsTrigger className="ig-tab-trigger shrink-0" value="scheduled">
              Scheduled ({scheduledStreams.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="grid gap-4 md:grid-cols-2 mt-4">
            {liveStreams.length === 0 && (
              <p className="text-sm text-muted-foreground">No one is live right now.</p>
            )}
            {liveStreams.map((stream) => (
              <Card key={stream.id} className="ig-modern-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Radio className="h-4 w-4 text-red-500" /> {stream.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {stream.description || "No description"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stream.user_id === user?.id ? (
                      <Button
                        className="ig-control-md"
                        onClick={() =>
                          setActiveStream({
                            id: stream.id,
                            broadcasterId: stream.user_id,
                            mode: "broadcast",
                          })
                        }
                      >
                        Resume Broadcast
                      </Button>
                    ) : (
                      <Button className="ig-control-md" onClick={() => handleOpenViewer(stream)}>
                        Watch
                      </Button>
                    )}
                    {stream.user_id === user?.id && (
                      <Button
                        className="ig-control-md"
                        variant="destructive"
                        onClick={() =>
                          updateStreamStatus.mutate({ streamId: stream.id, status: "ended" })
                        }
                      >
                        End Stream
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="scheduled" className="grid gap-4 md:grid-cols-2 mt-4">
            {scheduledStreams.map((stream) => (
              <Card key={stream.id} className="ig-modern-card">
                <CardHeader>
                  <CardTitle className="text-base">{stream.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Starts:{" "}
                    {stream.scheduled_start
                      ? new Date(stream.scheduled_start).toLocaleString()
                      : "TBD"}
                  </p>
                  {stream.user_id === user?.id && (
                    <Button
                      className="ig-control-md"
                      onClick={() =>
                        updateStreamStatus.mutate({ streamId: stream.id, status: "live" })
                      }
                    >
                      Start Now
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default LiveStreaming;
