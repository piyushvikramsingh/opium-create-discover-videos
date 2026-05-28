import {
  Settings,
  Grid3X3,
  Bookmark,
  Heart,
  Camera,
  X,
  Loader2,
  Play,
  ArrowLeft,
  Pin,
  Link as LinkIcon,
  BadgeCheck,
  Lock,
  UserRound,
  Users,
  Plus,
  Mail,
  Phone,
  TrendingUp,
  Eye,
  EyeOff,
  BarChart3,
  UserPlus,
  SlidersHorizontal,
  MessageCircle,
  Share2,
  Download,
  Trash2,
  List,
  LayoutGrid,
  Clock,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useProfile,
  useFollowCounts,
  useUserVideos,
  useLikedVideos,
  useBookmarkedVideos,
  useUpdateProfile,
  useIsFollowing,
  useToggleFollow,
  useTaggedVideos,
  useFollowersList,
  useFollowingList,
  useFollowRequestStatus,
  useIncomingFollowRequests,
  useRespondFollowRequest,
  useProfileHighlights,
  useCreateHighlight,
  useDeleteHighlight,
  useHighlightItems,
  useAddStoryToHighlight,
  useRemoveStoryFromHighlight,
  useProfileLinks,
  useUpsertProfileLink,
  useDeleteProfileLink,
  useMutualFollowers,
  useSuggestedUsers,
  useCreatorMetrics,
  useTogglePinVideo,
  useCreateReferral,
  useReferrals,
  useHiddenVideos,
  useHideVideo,
  useUnhideVideo,
  useUpdateVideo,
} from "@/hooks/useData";
import { useNavigate, useParams } from "react-router-dom";
import { YourInterests } from "@/components/YourInterests";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import HighlightViewer from "@/components/HighlightViewer";
import StoryArchive from "@/components/StoryArchive";
import { useCreateConversation } from "@/hooks/useMessages";
import { useQueryClient } from "@tanstack/react-query";

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams<{ userId: string }>();

  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "tagged" | "saved">("posts");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showHiddenVideosModal, setShowHiddenVideosModal] = useState(false);
  const [showStoryArchive, setShowStoryArchive] = useState(false);
  const [newHighlightTitle, setNewHighlightTitle] = useState("");
  const [viewingHighlightId, setViewingHighlightId] = useState<string | null>(null);
  const [gridLayout, setGridLayout] = useState<"grid-3" | "grid-2" | "list">("grid-3");
  const [sortBy, setSortBy] = useState<"recent" | "popular" | "pinned">("recent");
  const [showFilters, setShowFilters] = useState(false);
  const [tabSearch, setTabSearch] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [longPressVideoId, setLongPressVideoId] = useState<string | null>(null);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [pullStartY, setPullStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [excludedVideoIds, setExcludedVideoIds] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const viewingUserId = paramUserId || user?.id;
  const isOwnProfile = !paramUserId || paramUserId === user?.id;

  const { data: profile } = useProfile(viewingUserId);
  const { data: counts } = useFollowCounts(viewingUserId);
  const { data: videos } = useUserVideos(viewingUserId);
  const { data: likedVideos } = useLikedVideos(isOwnProfile ? user?.id : undefined, isOwnProfile && activeTab === "reels");
  const { data: bookmarkedVideos } = useBookmarkedVideos(isOwnProfile ? user?.id : undefined, isOwnProfile && activeTab === "saved");
  const { data: taggedVideos } = useTaggedVideos(viewingUserId);
  const { data: highlights } = useProfileHighlights(viewingUserId);
  const { data: profileLinks } = useProfileLinks(viewingUserId);
  const { data: followersList } = useFollowersList(viewingUserId, showFollowersModal);
  const { data: followingList } = useFollowingList(viewingUserId, showFollowingModal);
  const { data: isFollowing } = useIsFollowing(paramUserId);
  const { data: followRequest } = useFollowRequestStatus(paramUserId);
  const { data: incomingFollowRequests } = useIncomingFollowRequests();
  const { data: mutualFollowers } = useMutualFollowers(paramUserId);
  const { data: suggestedUsers } = useSuggestedUsers();
  const { data: creatorMetrics } = useCreatorMetrics(viewingUserId);
  const { data: referrals } = useReferrals();
  const { data: hiddenVideos } = useHiddenVideos(100, showHiddenVideosModal);

  const toggleFollow = useToggleFollow();
  const respondFollowRequest = useRespondFollowRequest();
  const createHighlight = useCreateHighlight();
  const deleteHighlight = useDeleteHighlight();
  const upsertProfileLink = useUpsertProfileLink();
  const deleteProfileLink = useDeleteProfileLink();
  const createConversation = useCreateConversation();
  const updateProfile = useUpdateProfile();
  const togglePinVideo = useTogglePinVideo();
  const createReferral = useCreateReferral();
  const hideVideo = useHideVideo();
  const unhideVideo = useUnhideVideo();
  const updateVideo = useUpdateVideo();
  const [editVideoId, setEditVideoId] = useState<string | null>(null);

  const hasPendingRequest = followRequest?.status === "pending";
  const canViewPrivateContent = isOwnProfile || !profile?.is_private || !!isFollowing;

  const tabCounts = useMemo(
    () => ({
      posts: videos?.length ?? 0,
      reels: videos?.length ?? 0,
      tagged: taggedVideos?.length ?? 0,
      saved: bookmarkedVideos?.length ?? 0,
    }),
    [videos, taggedVideos, bookmarkedVideos],
  );

  const tabs = useMemo(
    () => [
      { id: "posts" as const, icon: Grid3X3, label: "Posts", count: tabCounts.posts },
      { id: "reels" as const, icon: Play, label: "Clippy", count: tabCounts.reels },
      { id: "tagged" as const, icon: UserRound, label: "Tagged", count: tabCounts.tagged },
      ...(isOwnProfile ? [{ id: "saved" as const, icon: Bookmark, label: "Saved", count: tabCounts.saved }] : []),
    ],
    [isOwnProfile, tabCounts],
  );

  const currentVideos = useMemo(() => {
    if (!canViewPrivateContent) return [];
    let result: any[] = [];
    
    if (activeTab === "posts" || activeTab === "reels") {
      result = [...(videos || [])];
    } else if (activeTab === "tagged") {
      result = [...(taggedVideos || [])];
    } else {
      result = [...(bookmarkedVideos || [])];
    }

    // Apply sorting
    if (sortBy === "pinned" && (activeTab === "posts" || activeTab === "reels")) {
      result.sort((a: any, b: any) => Number(!!b.is_pinned) - Number(!!a.is_pinned));
    } else if (sortBy === "popular") {
      result.sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0));
    } else {
      result.sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
    }

    if (pinnedOnly && (activeTab === "posts" || activeTab === "reels")) {
      result = result.filter((video: any) => !!video.is_pinned);
    }

    const query = tabSearch.trim().toLowerCase();
    if (query) {
      result = result.filter((video: any) => {
        const description = String(video.description || "").toLowerCase();
        const music = String(video.music || "").toLowerCase();
        const hashtags = Array.isArray(video.hashtags) ? video.hashtags.join(" ").toLowerCase() : "";
        return description.includes(query) || music.includes(query) || hashtags.includes(query);
      });
    }

    if (excludedVideoIds.size > 0) {
      result = result.filter((video: any) => !excludedVideoIds.has(video.id));
    }

    return result;
  }, [activeTab, videos, taggedVideos, bookmarkedVideos, canViewPrivateContent, sortBy, pinnedOnly, tabSearch, excludedVideoIds]);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);

  const handlePullRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const targets = [
        ["profile", viewingUserId],
        ["follow-counts", viewingUserId],
        ["user-videos", viewingUserId],
        ["tagged-videos", viewingUserId],
        ["profile-highlights", viewingUserId],
        ["profile-links", viewingUserId],
        ["creator-metrics", viewingUserId],
        ["hidden-videos", user?.id, 100],
      ];

      if (isOwnProfile) {
        targets.push(["liked-videos", user?.id], ["bookmarked-videos", user?.id], ["referrals", user?.id]);
      }

      await Promise.all(
        targets.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );

      await new Promise((resolve) => setTimeout(resolve, 250));
      toast.success("Profile refreshed");
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      setPullStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStartY > 0 && containerRef.current && containerRef.current.scrollTop === 0) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, Math.min(currentY - pullStartY, 80));
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60) {
      handlePullRefresh();
    } else {
      setPullDistance(0);
    }
    setPullStartY(0);
  };

  const pinnedVideoIds = useMemo(
    () => new Set((videos || []).filter((video: any) => video.is_pinned).map((video: any) => video.id)),
    [videos],
  );

  const activityText = useMemo(() => {
    if (!profile?.show_last_active || !profile?.last_active_at) return null;
    const lastActive = new Date(profile.last_active_at);
    const diffMs = Date.now() - lastActive.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Active now";
    if (mins < 60) return `Active ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Active ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `Active ${days}d ago`;
  }, [profile]);

  const handleFollow = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!paramUserId) return;

    try {
      const result = await toggleFollow.mutateAsync({
        targetUserId: paramUserId,
        isFollowing: !!isFollowing,
        targetIsPrivate: !!profile?.is_private,
        hasPendingRequest,
      });

      if (result === "requested") toast.success("Follow request sent");
      if (result === "request-cancelled") toast.success("Follow request cancelled");
      if (result === "followed") toast.success("Following");
      if (result === "unfollowed") toast.success("Unfollowed");
    } catch (err: any) {
      toast.error(err.message || "Unable to update follow status");
    }
  };

  const handleMessageUser = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!paramUserId) return;

    try {
      const conversationId = await createConversation.mutateAsync(paramUserId);
      navigate("/inbox", {
        state: {
          openConversationId: conversationId,
          openUser: {
            user_id: paramUserId,
            username: profile?.username || "user",
            display_name: profile?.display_name || "User",
            avatar_url: profile?.avatar_url || null,
          },
        },
      });
    } catch {
      toast.error("Could not open chat");
    }
  };

  const handleCreateHighlight = async () => {
    if (!newHighlightTitle.trim()) return;
    try {
      await createHighlight.mutateAsync({
        title: newHighlightTitle.trim(),
        cover_url: (videos || [])[0]?.thumbnail_url || profile?.avatar_url || null,
      });
      setNewHighlightTitle("");
      toast.success("Highlight created");
    } catch {
      toast.error("Unable to create highlight");
    }
  };

  const handleRespondRequest = async (requestId: string, followerId: string, accept: boolean) => {
    try {
      await respondFollowRequest.mutateAsync({ requestId, followerId, accept });
      toast.success(accept ? "Request accepted" : "Request rejected");
    } catch {
      toast.error("Unable to update request");
    }
  };

  const displayStats = {
    posts: videos?.length ?? 0,
    followers: counts?.followers ?? 0,
    following: counts?.following ?? 0,
  };

  const professionalDashboard = useMemo(() => {
    if (!creatorMetrics) return null;

    const views = creatorMetrics.totalViews ?? 0;
    const reach = creatorMetrics.reach ?? 0;
    const posts = creatorMetrics.posts ?? 0;
    const engagement = creatorMetrics.engagement ?? 0;
    const likes = creatorMetrics.likes ?? 0;
    const comments = creatorMetrics.comments ?? 0;
    const shares = creatorMetrics.shares ?? 0;
    const avgWatch = Math.max(0, Math.min(100, creatorMetrics.avgWatchPercent ?? 0));
    const completion = Math.max(0, Math.min(100, creatorMetrics.completionRate ?? 0));
    const followerGrowth = creatorMetrics.followerGrowth7d ?? 0;
    const followersTotal = counts?.followers ?? 0;
    const invites = (referrals || []).length;
    const topContent = creatorMetrics.topVideos || [];

    const consistencyScore = Math.round((avgWatch * 0.45) + (completion * 0.45) + (Math.min(engagement, 100) * 0.1));
    const momentum = followerGrowth >= 0 ? `+${followerGrowth}` : String(followerGrowth);
    const engagementRate = posts > 0 ? Math.round(engagement / posts) : 0;

    return {
      views,
      reach,
      posts,
      engagement,
      likes,
      comments,
      shares,
      avgWatch,
      completion,
      followerGrowth,
      followersTotal,
      invites,
      consistencyScore,
      momentum,
      engagementRate,
      topContent,
    };
  }, [creatorMetrics, referrals, counts?.followers]);

  if (!viewingUserId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background pb-20 gap-4">
        <p className="text-muted-foreground">Sign in to see your profile</p>
        <button
          onClick={() => navigate("/auth")}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="ig-screen ig-modern-page min-h-screen bg-background pb-20 overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullDistance > 0 && (
        <div 
          className="flex items-center justify-center py-2 transition-all"
          style={{ height: `${pullDistance}px` }}
        >
          <div className={`transition-transform ${pullDistance > 60 ? 'scale-100' : 'scale-75'}`}>
            <Loader2 className={`h-5 w-5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
          </div>
        </div>
      )}
      <div className="ig-header ig-modern-header sticky top-0 z-20 flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          {!isOwnProfile && (
            <button onClick={() => navigate(-1)} className="ig-tap ig-icon-btn rounded-full p-1.5 hover:bg-secondary/70">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
          )}
          <div className="ig-type-h2 truncate text-foreground">@{profile?.username || "user"}</div>
          {profile?.is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
        </div>
        {isOwnProfile ? (
          <button onClick={() => navigate("/settings")} className="ig-tap ig-icon-btn rounded-full p-2 hover:bg-secondary/70">
            <Settings className="h-4 w-4 text-foreground" />
          </button>
        ) : (
          <button onClick={() => navigate("/discover")} className="ig-tap ig-icon-btn rounded-full p-2 hover:bg-secondary/70">
            <Users className="h-4 w-4 text-foreground" />
          </button>
        )}
      </div>

      <div className="px-4 pt-5">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-border/70 text-2xl font-bold text-muted-foreground">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (profile?.display_name?.[0] || "U").toUpperCase()
            )}
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-3 gap-3 text-center">
              <button onClick={() => setActiveTab("posts")} className="ig-tap p-1">
                <p className="text-lg font-bold text-foreground">{displayStats.posts}</p>
                <p className="text-xs text-muted-foreground">Posts</p>
              </button>
              <button onClick={() => setShowFollowersModal(true)} className="ig-tap p-1">
                <p className="text-lg font-bold text-foreground">{displayStats.followers}</p>
                <p className="text-xs text-muted-foreground">Followers</p>
              </button>
              <button onClick={() => setShowFollowingModal(true)} className="ig-tap p-1">
                <p className="text-lg font-bold text-foreground">{displayStats.following}</p>
                <p className="text-xs text-muted-foreground">Following</p>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <p className="ig-type-h2 text-foreground">{profile?.display_name || "User"}</p>
            {profile?.is_private && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          {profile?.category && <p className="mt-0.5 text-xs text-muted-foreground">{profile.category}</p>}
          <p className="mt-1 text-sm text-foreground/90 whitespace-pre-line">{profile?.bio || "No bio yet."}</p>
          {!!profile?.website_url && (
            <a href={profile.website_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
              <LinkIcon className="h-3.5 w-3.5" />
              {profile.website_url}
            </a>
          )}
          {activityText && <p className="mt-1 text-[11px] text-muted-foreground">{activityText}</p>}
        </div>

        {!isOwnProfile && !!mutualFollowers?.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            Followed by {mutualFollowers.map((profile: any) => profile.username).join(", ")}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {isOwnProfile ? (
            <>
              <button
                onClick={() => setShowEditModal(true)}
                className="ig-tap ig-icon-btn ig-modern-chip flex-1 px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                Edit profile
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + `/profile/${viewingUserId}`);
                  toast.success("Profile link copied");
                }}
                className="ig-tap ig-icon-btn ig-modern-chip px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                Share
              </button>
              <button
                onClick={async () => {
                  if (createReferral.isPending) return;
                  try {
                    const referral = await createReferral.mutateAsync();
                    if (!referral?.code) {
                      toast.error("Invites are unavailable right now");
                      return;
                    }
                    const link = `${window.location.origin}/auth?ref=${referral?.code}`;
                    await navigator.clipboard.writeText(link);
                    toast.success("Invite link copied");
                  } catch {
                    toast.error("Could not create invite");
                  }
                }}
                disabled={createReferral.isPending}
                className="ig-tap ig-icon-btn ig-modern-chip px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                {createReferral.isPending ? "Creating..." : "Invite"}
              </button>
              <button
                onClick={() => setShowHiddenVideosModal(true)}
                className="ig-tap ig-icon-btn ig-modern-chip px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                Hidden {hiddenVideos?.length ? `(${hiddenVideos.length})` : ""}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFollow}
                disabled={toggleFollow.isPending}
                className={`ig-tap ig-icon-btn flex-1 rounded-xl border px-4 py-2 text-sm font-semibold ${
                  isFollowing || hasPendingRequest
                    ? "border-border/70 bg-background text-secondary-foreground"
                    : "border-primary bg-primary text-primary-foreground"
                }`}
              >
                {isFollowing ? "Following" : hasPendingRequest ? "Requested" : "Follow"}
              </button>
              <button
                onClick={handleMessageUser}
                className="ig-tap ig-icon-btn ig-modern-chip flex-1 px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                Message
              </button>
            </>
          )}
        </div>

        {isOwnProfile && !!incomingFollowRequests?.length && (
          <div className="ig-list-item-enter ig-modern-card mt-4 p-3">
            <p className="ig-section-label">Follow Requests</p>
            <div className="mt-2 space-y-2">
              {incomingFollowRequests.slice(0, 3).map((request: any) => (
                <div key={request.id} className="flex items-center gap-2">
                  <img
                    src={request.profile?.avatar_url || `https://i.pravatar.cc/100?u=${request.follower_id}`}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{request.profile?.display_name || "User"}</p>
                    <p className="truncate text-xs text-muted-foreground">@{request.profile?.username || "user"}</p>
                  </div>
                  <button onClick={() => handleRespondRequest(request.id, request.follower_id, true)} className="ig-tap ig-icon-btn rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Accept</button>
                  <button onClick={() => handleRespondRequest(request.id, request.follower_id, false)} className="ig-tap ig-icon-btn rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-semibold text-secondary-foreground">Decline</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
            {isOwnProfile && (
              <div className="shrink-0">
                <button
                  onClick={handleCreateHighlight}
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border bg-secondary/40"
                  title="Create highlight"
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </button>
                <Input
                  value={newHighlightTitle}
                  onChange={(event) => setNewHighlightTitle(event.target.value)}
                  placeholder="New"
                  className="mt-1 h-6 w-16 px-1 text-center text-[10px]"
                />
              </div>
            )}

            {isOwnProfile && (
              <div className="shrink-0 text-center">
                <button
                  onClick={() => setShowStoryArchive(true)}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border/60 bg-secondary"
                  title="Story Archive"
                >
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </button>
                <p className="mt-1 text-[10px] text-muted-foreground">Archive</p>
              </div>
            )}

            {(highlights || []).map((highlight: any) => (
              <div key={highlight.id} className="shrink-0 text-center">
                <button
                  onClick={() => setViewingHighlightId(highlight.id)}
                  className="h-16 w-16 overflow-hidden rounded-full border-2 border-border/60 bg-secondary p-[2px]"
                >
                  <div className="h-full w-full rounded-full overflow-hidden">
                    {highlight.cover_url ? (
                      <img src={highlight.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground bg-secondary">
                        {highlight.title[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                </button>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <p className="max-w-[62px] truncate text-[10px] text-muted-foreground">{highlight.title}</p>
                  {isOwnProfile && (
                    <button onClick={() => deleteHighlight.mutate({ highlightId: highlight.id })}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isOwnProfile && user?.id && <YourInterests userId={user.id} />}

        {(profile?.professional_account || isOwnProfile) && !!professionalDashboard && (
          <div className="ig-list-item-enter ig-modern-card mt-5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Professional Dashboard</p>
              </div>
              <button
                onClick={() => navigate("/analytics")}
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                See insights
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-secondary/45 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Accounts reached</p>
                <p className="mt-1 text-sm font-bold text-foreground">{professionalDashboard.reach.toLocaleString()}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">From {professionalDashboard.posts} posts</p>
              </div>
              <div className="rounded-lg bg-secondary/45 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Accounts engaged</p>
                <p className="mt-1 text-sm font-bold text-foreground">{professionalDashboard.engagement.toLocaleString()}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Avg {professionalDashboard.engagementRate} per post</p>
              </div>
              <div className="rounded-lg bg-secondary/45 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total followers</p>
                <p className="mt-1 text-sm font-bold text-foreground">{professionalDashboard.followersTotal.toLocaleString()}</p>
                <p className={`mt-1 text-[10px] font-semibold ${professionalDashboard.followerGrowth >= 0 ? "text-primary" : "text-destructive"}`}>
                  {professionalDashboard.momentum} in last 7d
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 rounded-lg bg-secondary/35 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Average watch</span>
                <span className="font-semibold text-foreground">{professionalDashboard.avgWatch}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${professionalDashboard.avgWatch}%` }} />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Completion</span>
                <span className="font-semibold text-foreground">{professionalDashboard.completion}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary">
                <div className="h-1.5 rounded-full bg-foreground/80" style={{ width: `${professionalDashboard.completion}%` }} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-secondary/45 p-2">
                <p className="text-xs font-bold text-foreground">{professionalDashboard.consistencyScore}/100</p>
                <p className="text-[10px] text-muted-foreground">Content quality score</p>
              </div>
              <div className="rounded-lg bg-secondary/45 p-2">
                <p className="text-xs font-bold text-foreground">{professionalDashboard.invites}</p>
                <p className="text-[10px] text-muted-foreground">Invites sent</p>
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-secondary/35 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="ig-section-label">Content interactions</p>
                <p className="text-[10px] text-muted-foreground">Last 7 days</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-secondary/50 p-2">
                  <p className="text-xs font-bold text-foreground">{professionalDashboard.likes.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Likes</p>
                </div>
                <div className="rounded-md bg-secondary/50 p-2">
                  <p className="text-xs font-bold text-foreground">{professionalDashboard.comments.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Comments</p>
                </div>
                <div className="rounded-md bg-secondary/50 p-2">
                  <p className="text-xs font-bold text-foreground">{professionalDashboard.shares.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Shares</p>
                </div>
              </div>
            </div>

            {!!professionalDashboard.topContent.length && (
              <div className="mt-3 rounded-lg bg-secondary/35 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="ig-section-label">Top content</p>
                  <button
                    onClick={() => navigate("/clipy")}
                    className="text-[10px] font-semibold text-primary"
                  >
                    View all
                  </button>
                </div>
                <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                  {professionalDashboard.topContent.slice(0, 4).map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => navigate("/clipy", { state: { focusVideoId: item.id, focusSource: "profile-dashboard" } })}
                      className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-secondary"
                    >
                      {item.thumbnail_url ? (
                        <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No cover</div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white">
                        {item.score || 0}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!!profile?.contact_email && (
            <a href={`mailto:${profile.contact_email}`} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              <Mail className="h-3.5 w-3.5" />
              Email
            </a>
          )}
          {!!profile?.contact_phone && (
            <a href={`tel:${profile.contact_phone}`} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              <Phone className="h-3.5 w-3.5" />
              Call
            </a>
          )}
          {!!profile?.affiliate_url && (
            <a href={profile.affiliate_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              <LinkIcon className="h-3.5 w-3.5" />
              Affiliate
            </a>
          )}
          {!!profile?.shop_url && (
            <a href={profile.shop_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              <LinkIcon className="h-3.5 w-3.5" />
              Shop
            </a>
          )}
          {(profileLinks || []).map((link: any) => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              <LinkIcon className="h-3.5 w-3.5" />
              {link.label}
            </a>
          ))}
        </div>

        {!isOwnProfile && !!suggestedUsers?.length && (
          <div className="mt-5">
            <p className="mb-2 ig-section-label">Suggested Accounts</p>
            <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
              {suggestedUsers.map((suggested: any) => (
                <button
                  key={suggested.user_id}
                  onClick={() => navigate(`/profile/${suggested.user_id}`)}
                  className="shrink-0 rounded-xl border border-border px-3 py-2 text-left"
                >
                  <img src={suggested.avatar_url || `https://i.pravatar.cc/100?u=${suggested.user_id}`} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <p className="mt-1 max-w-20 truncate text-xs font-semibold text-foreground">{suggested.display_name}</p>
                  <p className="max-w-20 truncate text-[10px] text-muted-foreground">@{suggested.username}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ig-header mt-4 border-t border-border/60 px-3 py-2">
        <div className="scrollbar-hide flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-active={activeTab === tab.id}
              className={`ig-tab-pill ig-icon-btn flex shrink-0 items-center gap-2 px-3 py-1.5 transition-colors ${
                activeTab === tab.id
                  ? "text-foreground"
                  : "text-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">{tab.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === tab.id ? "bg-secondary text-foreground" : "bg-secondary text-muted-foreground"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!canViewPrivateContent ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Lock className="mb-2 h-8 w-8" />
          <p className="text-sm font-semibold text-foreground">This account is private</p>
          <p className="mt-1 text-xs">Follow this user to see their content</p>
        </div>
      ) : (
        <div>
          <div className="px-2 pt-2">
            <Input
              value={tabSearch}
              onChange={(event) => setTabSearch(event.target.value)}
              placeholder={`Search in ${activeTabMeta?.label?.toLowerCase() || "posts"}`}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{activeTabMeta?.label || "Posts"}</p>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{currentVideos.length}</span>
              {tabSearch.trim() && (
                <button
                  onClick={() => setTabSearch("")}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                >
                  Clear search
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`rounded-lg p-1.5 transition-colors ${showFilters ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
                title="Filters"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setGridLayout(gridLayout === "grid-3" ? "grid-2" : gridLayout === "grid-2" ? "list" : "grid-3")}
                className="rounded-lg bg-secondary p-1.5 text-foreground"
                title="Layout"
              >
                {gridLayout === "list" ? <List className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="mx-2 mb-2 flex gap-2 rounded-lg border border-border bg-secondary/40 p-2">
              <button
                onClick={() => setSortBy("recent")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${sortBy === "recent" ? "bg-foreground text-background" : "bg-background/60 text-foreground"}`}
              >
                Recent
              </button>
              <button
                onClick={() => setSortBy("popular")}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${sortBy === "popular" ? "bg-foreground text-background" : "bg-background/60 text-foreground"}`}
              >
                Popular
              </button>
              {(activeTab === "posts" || activeTab === "reels") && (
                <button
                  onClick={() => setSortBy("pinned")}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${sortBy === "pinned" ? "bg-foreground text-background" : "bg-background/60 text-foreground"}`}
                >
                  Pinned
                </button>
              )}
              {(activeTab === "posts" || activeTab === "reels") && (
                <button
                  onClick={() => setPinnedOnly((prev) => !prev)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${pinnedOnly ? "bg-primary text-primary-foreground" : "bg-background/60 text-foreground"}`}
                >
                  Pinned only
                </button>
              )}
            </div>
          )}

        <div className={`gap-px bg-border ${
          gridLayout === "grid-3" ? "grid grid-cols-3" : gridLayout === "grid-2" ? "grid grid-cols-2" : "flex flex-col gap-2 bg-transparent px-2"
        }`}>
          {currentVideos.map((video: any) => (
            <div 
              key={video.id} 
              className={`group relative cursor-pointer overflow-hidden bg-background ${
                gridLayout === "list" ? "rounded-lg" : "aspect-[9/16]"
              }`}
              onClick={() => navigate("/clipy", { state: { focusVideoId: video.id, focusSource: "profile" } })}
              onContextMenu={(e) => {
                if (isOwnProfile) {
                  e.preventDefault();
                  setLongPressVideoId(video.id);
                }
              }}
              onMouseEnter={() => setHoveredVideoId(video.id)}
              onMouseLeave={() => setHoveredVideoId(null)}
            >
              <div className={gridLayout === "list" ? "flex gap-3 p-2" : "relative h-full w-full"}>
                <div className={gridLayout === "list" ? "h-24 w-16 shrink-0 overflow-hidden rounded bg-secondary" : "h-full w-full"}>
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : video.video_url ? (
                    hoveredVideoId === video.id && gridLayout !== "list" ? (
                      <video 
                        src={video.video_url} 
                        className="h-full w-full object-cover" 
                        autoPlay 
                        muted 
                        loop
                        playsInline
                      />
                    ) : (
                      <video src={video.video_url} className="h-full w-full object-cover" muted preload="metadata" />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Play className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {hoveredVideoId === video.id && gridLayout !== "list" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="rounded-full bg-white/90 p-3">
                        <Play className="h-6 w-6 text-black" fill="black" />
                      </div>
                    </div>
                  )}
                </div>

                {gridLayout === "list" && (
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <p className="line-clamp-2 text-xs text-foreground">{video.description || "No caption"}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Eye className="h-3 w-3" />
                          {video.views_count || 0}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Heart className="h-3 w-3" />
                          {video.likes_count || 0}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageCircle className="h-3 w-3" />
                          {video.comments_count || 0}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(video.created_at).toLocaleDateString()}
                    </div>
                  </div>
                )}

                {gridLayout !== "list" && (
                  <>
                    {pinnedVideoIds.has(video.id) && (
                      <div className="absolute right-1 top-1 rounded-full bg-black/60 p-1">
                        <Pin className="h-3 w-3 text-white" />
                      </div>
                    )}
                    
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-8">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white">
                          <span className="flex items-center gap-0.5 text-[10px] font-medium">
                            <Heart className="h-3 w-3" fill="white" />
                            {video.likes_count || 0}
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px] font-medium">
                            <MessageCircle className="h-3 w-3" />
                            {video.comments_count || 0}
                          </span>
                          {video.views_count > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-medium">
                              <Eye className="h-3 w-3" />
                              {video.views_count}
                            </span>
                          )}
                        </div>
                        {isOwnProfile && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLongPressVideoId(video.id);
                            }}
                            className="rounded-full bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3 w-3 text-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {gridLayout === "list" && isOwnProfile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLongPressVideoId(video.id);
                  }}
                  className="absolute right-2 top-2 rounded-lg bg-secondary p-1.5"
                >
                  <MoreHorizontal className="h-3.5 w-3.5 text-foreground" />
                </button>
              )}
            </div>
          ))}
          {currentVideos.length === 0 && !isRefreshing && (
            <div className="col-span-3 px-4 py-16 text-center animate-in fade-in duration-500">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                {activeTab === "saved" ? <Bookmark className="h-6 w-6 text-muted-foreground" /> : <Play className="h-6 w-6 text-muted-foreground" />}
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {activeTab === "posts"
                  ? "No posts yet"
                  : activeTab === "reels"
                  ? "No Clippy yet"
                  : activeTab === "tagged"
                  ? "No tagged posts"
                  : "No saved posts"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === "tagged"
                  ? "Posts where this account is tagged will show up here."
                  : activeTab === "saved"
                  ? "Saved videos will appear here for quick access."
                  : "Your published videos will appear in this tab."}
              </p>
              {isOwnProfile && (activeTab === "posts" || activeTab === "reels") && (
                <button
                  onClick={() => navigate("/create")}
                  className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Create now
                </button>
              )}
            </div>
          )}
          {isRefreshing && currentVideos.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">Loading...</p>
            </div>
          )}
        </div>
        </div>
      )}

      {showEditModal && isOwnProfile && (
        <EditProfileModal
          profile={profile}
          userId={user!.id}
          links={profileLinks || []}
          onClose={() => setShowEditModal(false)}
          onUpdate={updateProfile}
          onUpsertLink={upsertProfileLink}
          onDeleteLink={deleteProfileLink}
        />
      )}

      {showFollowersModal && (
        <PeopleModal title="Followers" people={followersList || []} onClose={() => setShowFollowersModal(false)} onOpenProfile={(id) => navigate(`/profile/${id}`)} />
      )}
      {viewingHighlightId && (
        <HighlightViewer
          highlightId={viewingHighlightId}
          highlightTitle={(highlights || []).find((h: any) => h.id === viewingHighlightId)?.title || "Highlight"}
          onClose={() => setViewingHighlightId(null)}
        />
      )}
      {showStoryArchive && (
        <StoryArchive onClose={() => setShowStoryArchive(false)} />
      )}
      {showFollowingModal && (
        <PeopleModal title="Following" people={followingList || []} onClose={() => setShowFollowingModal(false)} onOpenProfile={(id) => navigate(`/profile/${id}`)} />
      )}
      {showHiddenVideosModal && (
        <HiddenVideosModal
          videos={hiddenVideos || []}
          onClose={() => setShowHiddenVideosModal(false)}
          onRestore={async (videoId) => {
            try {
              await unhideVideo.mutateAsync({ videoId });
              toast.success("Video restored");
            } catch {
              toast.error("Could not restore video");
            }
          }}
        />
      )}

      {longPressVideoId && isOwnProfile && (
        <VideoContextMenu
          videoId={longPressVideoId}
          video={currentVideos.find((v: any) => v.id === longPressVideoId)}
          onClose={() => setLongPressVideoId(null)}
          onPin={async (videoId, isPinned) => {
            try {
              await togglePinVideo.mutateAsync({ videoId, isPinned });
              toast.success(isPinned ? "Post pinned" : "Post unpinned");
            } catch (error: any) {
              toast.error(error.message || "Unable to change pin status");
            }
          }}
          onShare={(videoId) => {
            navigator.clipboard.writeText(`${window.location.origin}/clipy?focus=${videoId}`);
            toast.success("Video link copied");
            setLongPressVideoId(null);
          }}
          onDownload={(video) => {
            const mediaUrl = video?.video_url || video?.thumbnail_url;
            if (!mediaUrl) {
              toast.error("No media available to download");
              return;
            }

            try {
              const link = document.createElement("a");
              link.href = mediaUrl;
              link.download = `opium-${video?.id || "video"}.${video?.video_url ? "mp4" : "jpg"}`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              toast.success("Download started");
            } catch {
              toast.error("Could not start download");
            }
          }}
          onHide={async (videoId) => {
            try {
              await hideVideo.mutateAsync({ videoId });
              setExcludedVideoIds((prev) => new Set(prev).add(videoId));
              toast.success("Video hidden from profile view");
            } catch {
              toast.error("Could not hide video");
            }
          }}
          onDelete={async (videoId) => {
            if (!user) {
              toast.error("Sign in required");
              return;
            }

            try {
              const { error } = await supabase
                .from("videos")
                .delete()
                .eq("id", videoId)
                .eq("user_id", user.id);
              if (error) throw error;

              setExcludedVideoIds((prev) => new Set(prev).add(videoId));
              toast.success("Video deleted");
            } catch {
              toast.error("Could not delete video");
            }
          }}
          onEdit={(videoId) => {
            setLongPressVideoId(null);
            setEditVideoId(videoId);
          }}
        />
      )}

      {editVideoId && isOwnProfile && (
        <EditVideoModal
          video={currentVideos.find((v: any) => v.id === editVideoId) || { id: editVideoId }}
          onClose={() => setEditVideoId(null)}
          onSave={async (videoId, description) => {
            try {
              await updateVideo.mutateAsync({ videoId, description });
              toast.success("Post updated");
              setEditVideoId(null);
            } catch (err: any) {
              toast.error(err.message || "Could not update post");
            }
          }}
        />
      )}
    </div>
  );
};

function VideoContextMenu({
  videoId,
  video,
  onClose,
  onPin,
  onShare,
  onDownload,
  onHide,
  onDelete,
  onEdit,
}: {
  videoId: string;
  video: any;
  onClose: () => void;
  onPin: (videoId: string, isPinned: boolean) => Promise<void>;
  onShare: (videoId: string) => void;
  onDownload: (video: any) => void;
  onHide: (videoId: string) => Promise<void>;
  onDelete: (videoId: string) => Promise<void>;
  onEdit: (videoId: string) => void;
}) {
  const [pendingAction, setPendingAction] = useState<"pin" | "download" | "hide" | "delete" | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-border" />
        <div className="space-y-1">
          <button
            onClick={async () => {
              if (pendingAction) return;
              setPendingAction("pin");
              try {
                await onPin(videoId, !video?.is_pinned);
                onClose();
              } finally {
                setPendingAction(null);
              }
            }}
            disabled={!!pendingAction}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-secondary"
          >
            <Pin className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">{video?.is_pinned ? "Unpin from profile" : "Pin to profile"}</span>
          </button>
          <button
            onClick={() => onEdit(videoId)}
            disabled={!!pendingAction}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-secondary"
          >
            <Pencil className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">Edit post</span>
          </button>
          <button
            onClick={() => onShare(videoId)}
            disabled={!!pendingAction}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-secondary"
          >
            <Share2 className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">Share video</span>
          </button>
          <button
            onClick={async () => {
              if (pendingAction) return;
              setPendingAction("download");
              try {
                onDownload(video);
                onClose();
              } finally {
                setPendingAction(null);
              }
            }}
            disabled={!!pendingAction}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-secondary"
          >
            <Download className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">Download video</span>
          </button>
          <button
            onClick={async () => {
              if (pendingAction) return;
              setPendingAction("hide");
              try {
                await onHide(videoId);
                onClose();
              } finally {
                setPendingAction(null);
              }
            }}
            disabled={!!pendingAction}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-secondary"
          >
            <EyeOff className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">Hide from profile</span>
          </button>
          <button
            onClick={async () => {
              if (pendingAction) return;
              if (window.confirm("Delete this video? This action cannot be undone.")) {
                setPendingAction("delete");
                try {
                  await onDelete(videoId);
                } finally {
                  setPendingAction(null);
                }
              }
              onClose();
            }}
            disabled={!!pendingAction}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Delete video</span>
          </button>
        </div>
        <button
          onClick={onClose}
          disabled={!!pendingAction}
          className="mt-3 w-full rounded-lg border border-border bg-secondary py-3 text-sm font-semibold text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function HiddenVideosModal({
  videos,
  onClose,
  onRestore,
}: {
  videos: any[];
  onClose: () => void;
  onRestore: (videoId: string) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={onClose}>
          <X className="h-5 w-5 text-foreground" />
        </button>
        <h2 className="text-base font-semibold text-foreground">Hidden Videos</h2>
        <div className="w-5" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {videos.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No hidden videos</div>
        ) : (
          <div className="space-y-2">
            {videos.map((video: any) => (
              <div key={video.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
                <div className="h-16 w-12 overflow-hidden rounded bg-secondary shrink-0">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs text-foreground/90">{video.description || "No caption"}</p>
                </div>

                <button
                  onClick={() => onRestore(video.id)}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PeopleModal({
  title,
  people,
  onClose,
  onOpenProfile,
}: {
  title: string;
  people: any[];
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={onClose}>
          <X className="h-5 w-5 text-foreground" />
        </button>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <div className="w-5" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {people.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No users found</p>
        ) : (
          people.map((person: any) => (
            <button key={person.user_id} onClick={() => onOpenProfile(person.user_id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary/50">
              <img src={person.avatar_url || `https://i.pravatar.cc/100?u=${person.user_id}`} alt="" className="h-10 w-10 rounded-full object-cover" />
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-semibold text-foreground">{person.display_name || "User"}</p>
                <p className="truncate text-xs text-muted-foreground">@{person.username || "user"}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function EditProfileModal({
  profile,
  userId,
  links,
  onClose,
  onUpdate,
  onUpsertLink,
  onDeleteLink,
}: {
  profile: any;
  userId: string;
  links: any[];
  onClose: () => void;
  onUpdate: any;
  onUpsertLink: any;
  onDeleteLink: any;
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || "");
  const [websiteUrl, setWebsiteUrl] = useState(profile?.website_url || "");
  const [category, setCategory] = useState(profile?.category || "");
  const [contactEmail, setContactEmail] = useState(profile?.contact_email || "");
  const [contactPhone, setContactPhone] = useState(profile?.contact_phone || "");
  const [affiliateUrl, setAffiliateUrl] = useState(profile?.affiliate_url || "");
  const [shopUrl, setShopUrl] = useState(profile?.shop_url || "");
  const [isPrivate, setIsPrivate] = useState(!!profile?.is_private);
  const [showLastActive, setShowLastActive] = useState(profile?.show_last_active !== false);
  const [professionalAccount, setProfessionalAccount] = useState(!!profile?.professional_account);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarPreview(data.publicUrl);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim() || !username.trim()) {
      toast.error("Name and username are required");
      return;
    }

    setSaving(true);
    try {
      await onUpdate.mutateAsync({
        display_name: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        avatar_url: avatarPreview || null,
        website_url: websiteUrl.trim() || null,
        category: category.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        affiliate_url: affiliateUrl.trim() || null,
        shop_url: shopUrl.trim() || null,
        is_private: isPrivate,
        show_last_active: showLastActive,
        professional_account: professionalAccount,
      });
      toast.success("Profile updated");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    try {
      await onUpsertLink.mutateAsync({
        label: newLinkLabel.trim(),
        url: newLinkUrl.trim(),
        link_type: "custom",
      });
      setNewLinkLabel("");
      setNewLinkUrl("");
      toast.success("Link added");
    } catch {
      toast.error("Unable to add link");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={onClose}>
          <X className="h-5 w-5 text-foreground" />
        </button>
        <h2 className="text-base font-semibold text-foreground">Edit Profile</h2>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <button onClick={() => fileInputRef.current?.click()} className="relative h-24 w-24 rounded-full bg-secondary overflow-hidden" disabled={uploadingAvatar}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground">
                {(displayName?.[0] || "U").toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
            </div>
          </button>
          <p className="text-xs text-muted-foreground">Change photo</p>
        </div>

        <div className="space-y-3">
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" maxLength={50} />
          <Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="Username" maxLength={30} />
          <Textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={150} rows={3} className="resize-none" placeholder="Bio" />
          <Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="Website link" />
          <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" />
          <Input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="Contact email" />
          <Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Contact phone" />
          <Input value={affiliateUrl} onChange={(event) => setAffiliateUrl(event.target.value)} placeholder="Affiliate link" />
          <Input value={shopUrl} onChange={(event) => setShopUrl(event.target.value)} placeholder="Shop link" />

          <div className="rounded-xl bg-secondary/40 p-3 space-y-2 text-sm">
            <label className="flex items-center justify-between">
              <span>Private account</span>
              <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between">
              <span>Show last active</span>
              <input type="checkbox" checked={showLastActive} onChange={(event) => setShowLastActive(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between">
              <span>Professional account</span>
              <input type="checkbox" checked={professionalAccount} onChange={(event) => setProfessionalAccount(event.target.checked)} />
            </label>
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 ig-section-label">Custom Links</p>
            <div className="space-y-2">
              {links.map((link: any) => (
                <div key={link.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{link.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                  </div>
                  <button onClick={() => onDeleteLink.mutate({ linkId: link.id })} className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                    Delete
                  </button>
                </div>
              ))}

              <Input value={newLinkLabel} onChange={(event) => setNewLinkLabel(event.target.value)} placeholder="Link label" />
              <Input value={newLinkUrl} onChange={(event) => setNewLinkUrl(event.target.value)} placeholder="https://..." />
              <button onClick={handleAddLink} className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
                <Plus className="h-3.5 w-3.5" />
                Add link
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditVideoModal({
  video,
  onClose,
  onSave,
}: {
  video: any;
  onClose: () => void;
  onSave: (videoId: string, description: string) => Promise<void>;
}) {
  const [description, setDescription] = useState(video?.description || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(video.id, description.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={onClose}>
          <X className="h-5 w-5 text-foreground" />
        </button>
        <h2 className="text-base font-semibold text-foreground">Edit Post</h2>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {(video?.thumbnail_url || video?.video_url) && (
          <div className="mx-auto h-48 w-32 overflow-hidden rounded-lg bg-secondary">
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <video src={video.video_url} className="h-full w-full object-cover" muted preload="metadata" />
            )}
          </div>
        )}
        <div>
          <label className="mb-1 block ig-section-label">
            Caption
          </label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2200}
            rows={5}
            className="resize-none"
            placeholder="Write a caption..."
          />
          <p className="mt-1 text-right text-[10px] text-muted-foreground">{description.length}/2200</p>
        </div>
      </div>
    </div>
  );
}

export default Profile;

