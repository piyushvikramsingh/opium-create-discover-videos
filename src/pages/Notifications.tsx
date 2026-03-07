import { useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Loader2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useDeleteNotification,
  useDeleteNotificationsBatch,
  useIncomingFollowRequests,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationsReadBatch,
  useNotifications,
  useRespondFollowRequest,
} from "@/hooks/useData";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

type InboxUser = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  is_read?: boolean;
  created_at?: string;
  type?: string;
  entity_id?: string | null;
  actor_id?: string | null;
  bundle_count?: number;
  bundled_ids?: string[];
};

type IncomingFollowRequest = {
  id: string;
  follower_id: string;
  profile?: InboxUser | null;
};

type TabType = "all" | "follow_requests";
type NotificationFilter = "all" | "social" | "activity" | "messages";

// ── Main Notifications Page ────────────────────────────────────────────

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const { data: notifications = [], isLoading } = useNotifications(50);
  const { data: incomingFollowRequests = [] } = useIncomingFollowRequests();
  const markAllNotificationsRead = useMarkAllNotificationsRead();
  const markNotificationRead = useMarkNotificationRead();
  const markNotificationsReadBatch = useMarkNotificationsReadBatch();
  const deleteNotification = useDeleteNotification();
  const deleteNotificationsBatch = useDeleteNotificationsBatch();
  const respondFollowRequest = useRespondFollowRequest();
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  // Group notifications by time
  const groupedNotifications = useMemo(() => {
    const grouped: Record<"today" | "week" | "older", NotificationItem[]> = {
      today: [],
      week: [],
      older: [],
    };
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

    (notifications as NotificationItem[]).forEach((notification) => {
      const createdAt = notification.created_at ? new Date(notification.created_at).getTime() : NaN;
      if (Number.isNaN(createdAt)) {
        grouped.older.push(notification);
        return;
      }
      if (createdAt >= todayStart) {
        grouped.today.push(notification);
        return;
      }
      if (createdAt >= weekStart) {
        grouped.week.push(notification);
        return;
      }
      grouped.older.push(notification);
    });
    return grouped;
  }, [notifications]);

  const filterCounts = useMemo(() => {
    const values = notifications as NotificationItem[];
    const counts: Record<NotificationFilter, number> = {
      all: values.length,
      social: 0,
      activity: 0,
      messages: 0,
    };

    values.forEach((notification) => {
      const bucket = getNotificationBucket(notification.type);
      if (bucket !== "all") counts[bucket] += 1;
    });

    return counts;
  }, [notifications]);

  const filteredGroupedNotifications = useMemo(() => {
    if (activeFilter === "all") return groupedNotifications;

    const filterByBucket = (list: NotificationItem[]) =>
      list.filter((notification) => getNotificationBucket(notification.type) === activeFilter);

    return {
      today: filterByBucket(groupedNotifications.today),
      week: filterByBucket(groupedNotifications.week),
      older: filterByBucket(groupedNotifications.older),
    };
  }, [activeFilter, groupedNotifications]);

  const unreadCount = (notifications as NotificationItem[]).filter((n) => !n.is_read).length;

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleNotificationClick = (notification: NotificationItem) => {
    const ids =
      notification.bundled_ids && notification.bundled_ids.length > 0
        ? notification.bundled_ids
        : [notification.id];

    if (!notification.is_read) {
      if (ids.length > 1) {
        markNotificationsReadBatch.mutate({ notificationIds: ids });
      } else {
        markNotificationRead.mutate({ notificationId: notification.id });
      }
    }

    const type = notification.type || "";
    if (type === "follow" && notification.actor_id) {
      navigate(`/profile/${notification.actor_id}`);
      return;
    }
    if (["comment", "reply", "like", "save"].includes(type) && notification.entity_id) {
      navigate("/clipy", {
        state: { focusVideoId: notification.entity_id, focusSource: "notifications" },
      });
      return;
    }
    if (type === "message_request" || type === "message" || type === "story_reply") {
      navigate("/inbox");
      return;
    }
  };

  const handleNotificationMarkRead = (event: MouseEvent, notification: NotificationItem) => {
    event.stopPropagation();
    if (notification.is_read) return;
    const ids =
      notification.bundled_ids && notification.bundled_ids.length > 0
        ? notification.bundled_ids
        : [notification.id];
    if (ids.length > 1) {
      markNotificationsReadBatch.mutate({ notificationIds: ids });
      return;
    }
    markNotificationRead.mutate({ notificationId: notification.id });
  };

  const handleNotificationDelete = (event: MouseEvent, notification: NotificationItem) => {
    event.stopPropagation();
    const ids =
      notification.bundled_ids && notification.bundled_ids.length > 0
        ? notification.bundled_ids
        : [notification.id];
    if (ids.length > 1) {
      deleteNotificationsBatch.mutate({ notificationIds: ids });
      return;
    }
    deleteNotification.mutate({ notificationId: notification.id });
  };

  const handleFollowRequest = async (request: IncomingFollowRequest, accept: boolean) => {
    try {
      setActingRequestId(request.id);
      await respondFollowRequest.mutateAsync({
        requestId: request.id,
        followerId: request.follower_id,
        accept,
      });
      toast.success(accept ? "Follow request accepted" : "Follow request rejected");
    } catch {
      toast.error("Failed to update follow request");
    } finally {
      setActingRequestId(null);
    }
  };

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Sign in to see notifications</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="ig-screen flex h-full flex-col bg-background">
      {/* Top bar */}
      <div className="ig-header sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="ig-tap ig-icon-btn rounded-full p-1.5 hover:bg-secondary/70">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <h1 className="text-lg font-bold text-foreground">Notifications</h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllNotificationsRead.mutate()}
              className="ig-tap text-xs font-semibold text-primary"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-6 border-t border-border/60 px-4 py-2 text-sm font-semibold">
          {(
            [
              { key: "all", label: "All", count: (notifications as NotificationItem[]).length },
              { key: "follow_requests", label: "Follow Requests", count: incomingFollowRequests.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative py-1 text-center text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold">
                  {tab.count > 99 ? "99+" : tab.count}
                </span>
              )}
              {activeTab === tab.key && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div key={activeTab} className="ig-tab-content-enter flex-1 overflow-y-auto pb-20">
        {activeTab === "all" && (
          <>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto px-4 py-3">
              {(
                [
                  { key: "all", label: "All" },
                  { key: "social", label: "Social" },
                  { key: "activity", label: "Activity" },
                  { key: "messages", label: "Messages" },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setActiveFilter(filter.key)}
                  className="ig-tap ig-icon-btn ig-modern-chip shrink-0 px-4 py-1.5 text-xs font-medium"
                  data-active={activeFilter === filter.key}
                >
                  {filter.label}
                  {filterCounts[filter.key] > 0 ? (
                    <span className="ml-1.5 text-[10px] font-bold opacity-80">
                      {filterCounts[filter.key] > 99 ? "99+" : filterCounts[filter.key]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (notifications as NotificationItem[]).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We'll notify you when something happens
                </p>
              </div>
            ) : (
              <div ref={notificationsRef} className="px-4 py-3">
                <div className="space-y-4">
                  {(
                    [
                      { key: "today", label: "Today" },
                      { key: "week", label: "This Week" },
                      { key: "older", label: "Older" },
                    ] as const
                  ).map((group) => {
                    const list = filteredGroupedNotifications[group.key];
                    if (!list.length) return null;
                    return (
                      <div key={group.key}>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {list.map((notification) => (
                            <button
                              key={notification.id}
                              onClick={() => handleNotificationClick(notification)}
                              className={`ig-list-item-enter ig-modern-card flex w-full items-start justify-between gap-3 border-b px-3 py-3 text-left transition-colors ${
                                notification.is_read
                                  ? "border-border/60 bg-background"
                                  : "border-primary/30 bg-primary/5"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-foreground">
                                  {notification.title}
                                </p>
                                {!!notification.body && (
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {notification.body}
                                  </p>
                                )}
                                {(notification.bundle_count || 1) > 1 && (
                                  <p className="mt-0.5 text-[10px] font-semibold text-primary">
                                    {notification.bundle_count} similar updates
                                  </p>
                                )}
                                {notification.created_at && (
                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                    {formatTimeAgo(notification.created_at)}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {!notification.is_read && (
                                  <button
                                    onClick={(event) => handleNotificationMarkRead(event, notification)}
                                    className="ig-tap ig-icon-btn ig-control-sm rounded-md px-2 text-muted-foreground hover:bg-secondary"
                                    aria-label="Mark read"
                                  >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={(event) => handleNotificationDelete(event, notification)}
                                  className="ig-tap ig-icon-btn ig-control-sm rounded-md px-2 text-muted-foreground hover:bg-secondary"
                                  aria-label="Delete notification"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "follow_requests" && (
          <>
            {incomingFollowRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <UserPlus className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No follow requests</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  When someone requests to follow you, it'll show up here
                </p>
              </div>
            ) : (
              <div className="space-y-0 px-4 py-3">
                {(incomingFollowRequests as IncomingFollowRequest[]).map((request) => {
                  const profile = request.profile;
                  if (!profile) return null;
                  const isActing = actingRequestId === request.id;
                  return (
                    <div
                      key={request.id}
                      className="ig-list-item-enter ig-modern-card flex items-center gap-3 border-b border-border/60 bg-background px-3 py-3"
                    >
                      <button onClick={() => navigate(`/profile/${profile.user_id}`)} className="shrink-0">
                        <img
                          src={profile.avatar_url || `https://i.pravatar.cc/100?u=${profile.user_id}`}
                          alt={profile.display_name}
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => navigate(`/profile/${profile.user_id}`)}
                          className="truncate text-left text-sm font-semibold text-foreground"
                        >
                          {profile.display_name}
                        </button>
                        <p className="truncate text-xs text-muted-foreground">
                          @{profile.username} wants to follow you
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleFollowRequest(request, false)}
                          disabled={isActing}
                          className="ig-tap ig-icon-btn ig-control-sm rounded-lg border border-border px-3 text-[11px] font-semibold text-muted-foreground disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleFollowRequest(request, true)}
                          disabled={isActing}
                          className="ig-tap ig-icon-btn ig-control-sm inline-flex items-center gap-1 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Accept
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getNotificationBucket(type?: string): NotificationFilter {
  const value = (type || "").toLowerCase();
  if (["message_request", "message", "story_reply"].includes(value)) return "messages";
  if (["follow", "follow_request", "follow_accepted"].includes(value)) return "social";
  if (["comment", "reply", "like", "save", "mention", "tag"].includes(value)) return "activity";
  return "all";
}

export default Notifications;
