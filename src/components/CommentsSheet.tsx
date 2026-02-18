import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useAddComment, useDeleteComment, useVideoComments } from "@/hooks/useData";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CommentsSheetProps {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatTimeAgo(dateString: string) {
  const createdAt = new Date(dateString).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - createdAt);

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h`;
  return `${Math.floor(diffMs / day)}d`;
}

const CommentsSheet = ({ videoId, open, onOpenChange }: CommentsSheetProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { data: comments, isLoading } = useVideoComments(videoId, open);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();

  const totalComments = useMemo(() => comments?.length ?? 0, [comments]);

  useEffect(() => {
    if (!open) return;

    const channel = supabase
      .channel(`video-comments-${videoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `video_id=eq.${videoId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["video-comments", videoId] });
          queryClient.invalidateQueries({ queryKey: ["videos"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, videoId, queryClient]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) {
      onOpenChange(false);
      navigate("/auth");
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    try {
      await addComment.mutateAsync({ videoId, content: trimmedContent });
      setContent("");
    } catch (error) {
      toast({
        title: "Could not post comment",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!user) return;

    try {
      await deleteComment.mutateAsync({ videoId, commentId });
    } catch (error) {
      toast({
        title: "Could not delete comment",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    await handleDelete(pendingDeleteId);
    setPendingDeleteId(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[68dvh] rounded-t-2xl border-border bg-background p-0">
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-4 py-3 text-center">
            <SheetTitle className="text-sm font-semibold">Comments ({totalComments})</SheetTitle>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {isLoading ? (
              <p className="text-center text-sm text-muted-foreground">Loading comments...</p>
            ) : comments && comments.length > 0 ? (
              <div className="space-y-4">
                {comments.map((comment) => {
                  const username = comment.profile?.username || "user";
                  const displayName = comment.profile?.display_name || username;
                  const avatarUrl = comment.profile?.avatar_url || `https://i.pravatar.cc/80?u=${comment.user_id}`;
                  const isOwnComment = user?.id === comment.user_id;

                  return (
                    <div key={comment.id} className="flex items-start gap-3">
                      <img src={avatarUrl} alt={displayName} className="h-9 w-9 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-semibold text-foreground">@{username}</p>
                          <span className="text-xs text-muted-foreground">{formatTimeAgo(comment.created_at)}</span>
                        </div>
                        <div className="mt-0.5 flex items-start justify-between gap-3">
                          <p className="text-sm text-foreground/90 break-words">{comment.content}</p>
                          {isOwnComment && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => setPendingDeleteId(comment.id)}
                              disabled={deleteComment.isPending}
                              aria-label="Delete comment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <div className="flex items-center gap-2">
              <Input
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={user ? "Add a comment..." : "Sign in to comment"}
                disabled={addComment.isPending}
                maxLength={280}
                aria-label="Add comment"
              />
              <Button type="submit" size="icon" disabled={!content.trim() || addComment.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(nextOpen) => !nextOpen && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteComment.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteComment.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
};

export default CommentsSheet;
