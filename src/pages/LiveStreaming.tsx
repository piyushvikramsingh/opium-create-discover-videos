import { useMemo, useState } from "react";
import { CalendarClock, Radio, Send, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateLiveStream, useLiveComments, useLiveStreams, useSendLiveComment, useUpdateStreamStatus } from "@/hooks/useLive";

type LiveStreamItem = {
  id: string;
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
  const { data: streamsData = [] } = useLiveStreams();
  const createStream = useCreateLiveStream();
  const updateStreamStatus = useUpdateStreamStatus();
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const { data: commentsData = [] } = useLiveComments(selectedStreamId);
  const sendComment = useSendLiveComment();
  const streams = streamsData as LiveStreamItem[];
  const comments = commentsData as LiveCommentItem[];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [commentText, setCommentText] = useState("");

  const liveStreams = useMemo(() => streams.filter((stream) => stream.status === "live"), [streams]);
  const scheduledStreams = useMemo(
    () => streams.filter((stream) => stream.status === "scheduled"),
    [streams],
  );

  return (
    <div className="ig-screen-spring ig-modern-page min-h-screen bg-background p-4 pb-20 pt-safe fade-in">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="ig-type-h1 text-foreground">Live Streaming</h1>
          <p className="ig-type-sub mt-1">Go live now or schedule a live session.</p>
        </div>

        <Card className="ig-modern-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Video className="h-4 w-4" /> Create Stream</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input className="ig-control-md" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Stream title" />
            <Input className="ig-control-md" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
            <Input
              className="ig-control-md"
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
              placeholder="Optional schedule"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                className="ig-control-md"
                onClick={() => {
                  if (!title.trim()) return;
                  createStream.mutate({ title: title.trim(), description: description || null });
                  setTitle("");
                  setDescription("");
                }}
                disabled={createStream.isPending}
              >
                Go Live Now
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
          </CardContent>
        </Card>

        <Tabs defaultValue="live" className="w-full">
          <TabsList className="flex w-full max-w-md gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0">
            <TabsTrigger className="ig-tab-trigger shrink-0" value="live">Live ({liveStreams.length})</TabsTrigger>
            <TabsTrigger className="ig-tab-trigger shrink-0" value="scheduled">Scheduled ({scheduledStreams.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="grid gap-4 md:grid-cols-2 mt-4">
            {liveStreams.map((stream) => (
              <Card key={stream.id} className="ig-modern-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Radio className="h-4 w-4 text-red-500" /> {stream.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{stream.description || "No description"}</p>
                  <p className="text-sm">Viewers: {stream.viewer_count ?? 0}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button className="ig-control-md" variant="outline" onClick={() => setSelectedStreamId(stream.id)}>Open Chat</Button>
                    <Button className="ig-control-md" variant="destructive" onClick={() => updateStreamStatus.mutate({ streamId: stream.id, status: "ended" })}>
                      End Stream
                    </Button>
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
                  <p className="text-sm text-muted-foreground">Starts: {stream.scheduled_start ? new Date(stream.scheduled_start).toLocaleString() : "TBD"}</p>
                  <Button className="ig-control-md" onClick={() => updateStreamStatus.mutate({ streamId: stream.id, status: "live" })}>Start Now</Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        {selectedStreamId && (
          <Card className="ig-modern-card">
            <CardHeader>
              <CardTitle className="text-base">Live Chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
                {comments.map((comment) => (
                  <p key={comment.id} className="text-sm">
                    <span className="text-muted-foreground">{new Date(comment.created_at).toLocaleTimeString()} · </span>
                    {comment.content}
                  </p>
                ))}
              </div>
              <div className="flex gap-2">
                <Input className="ig-control-md" value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Send message" />
                <Button
                  className="ig-control-md"
                  onClick={() => {
                    if (!commentText.trim()) return;
                    sendComment.mutate({ streamId: selectedStreamId, content: commentText.trim() });
                    setCommentText("");
                  }}
                  disabled={sendComment.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default LiveStreaming;
