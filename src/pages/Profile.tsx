import {
  Settings,
  Grid3X3,
  Bookmark,
  Heart,
  LogOut,
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
  BarChart3,
  UserPlus,
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
  useProfileLinks,
  useUpsertProfileLink,
  useDeleteProfileLink,
  useMutualFollowers,
  useSuggestedUsers,
  useCreatorMetrics,
  useTogglePinVideo,
} from "@/hooks/useData";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateConversation } from "@/hooks/useMessages";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams<{ userId: string }>();

  const viewingUserId = paramUserId || user?.id;
  const isOwnProfile = !paramUserId || paramUserId === user?.id;

  const { data: profile } = useProfile(viewingUserId);
  const { data: counts } = useFollowCounts(viewingUserId);
  const { data: videos } = useUserVideos(viewingUserId);
  const { data: likedVideos } = useLikedVideos(isOwnProfile ? user?.id : undefined);
  const { data: bookmarkedVideos } = useBookmarkedVideos(isOwnProfile ? user?.id : undefined);
  const { data: taggedVideos } = useTaggedVideos(viewingUserId);
  const { data: highlights } = useProfileHighlights(viewingUserId);
  const { data: profileLinks } = useProfileLinks(viewingUserId);
  const { data: followersList } = useFollowersList(viewingUserId);
  const { data: followingList } = useFollowingList(viewingUserId);
  const { data: isFollowing } = useIsFollowing(paramUserId);
  const { data: followRequest } = useFollowRequestStatus(paramUserId);
  const { data: incomingFollowRequests } = useIncomingFollowRequests();
  const { data: mutualFollowers } = useMutualFollowers(paramUserId);
  const { data: suggestedUsers } = useSuggestedUsers();
  const { data: creatorMetrics } = useCreatorMetrics(viewingUserId);

  const toggleFollow = useToggleFollow();
  const respondFollowRequest = useRespondFollowRequest();
  const createHighlight = useCreateHighlight();
  const deleteHighlight = useDeleteHighlight();
  const upsertProfileLink = useUpsertProfileLink();
  const deleteProfileLink = useDeleteProfileLink();
  const createConversation = useCreateConversation();
  const updateProfile = useUpdateProfile();
  const togglePinVideo = useTogglePinVideo();

  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "tagged" | "saved">("posts");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [newHighlightTitle, setNewHighlightTitle] = useState("");

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

  const hasPendingRequest = followRequest?.status === "pending";
  const canViewPrivateContent = isOwnProfile || !profile?.is_private || !!isFollowing;

  const tabs = [
    { id: "posts" as const, icon: Grid3X3, label: "Posts" },
    { id: "reels" as const, icon: Play, label: "Reels" },
    { id: "tagged" as const, icon: UserRound, label: "Tagged" },
    ...(isOwnProfile ? [{ id: "saved" as const, icon: Bookmark, label: "Saved" }] : []),
  ];

  const currentVideos = useMemo(() => {
    if (!canViewPrivateContent) return [];
    if (activeTab === "posts") return videos || [];
    if (activeTab === "reels") return videos || [];
    if (activeTab === "tagged") return taggedVideos || [];
    return bookmarkedVideos || [];
  }, [activeTab, videos, taggedVideos, bookmarkedVideos, canViewPrivateContent]);

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

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

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

  return (
    <div className="fade-in min-h-screen bg-background pb-20">
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-3 min-w-0">
          {!isOwnProfile && (
            <button onClick={() => navigate(-1)} className="lift-on-tap rounded-lg p-1">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
          )}
          <div className="truncate text-lg font-bold text-foreground">@{profile?.username || "user"}</div>
          {profile?.is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
        </div>
        {isOwnProfile ? (
          <button onClick={handleSignOut} className="lift-on-tap rounded-lg bg-secondary p-2">
            <LogOut className="h-4 w-4 text-foreground" />
          </button>
        ) : (
          <button onClick={() => navigate("/discover")} className="lift-on-tap rounded-lg bg-secondary p-2">
            <Users className="h-4 w-4 text-foreground" />
          </button>
        )}
      </div>

      <div className="px-4 pt-5">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold text-muted-foreground overflow-hidden shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (profile?.display_name?.[0] || "U").toUpperCase()
            )}
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-3 gap-3 text-center">
              <button onClick={() => setActiveTab("posts")} className="rounded-lg p-1 hover:bg-secondary/60">
                <p className="text-lg font-bold text-foreground">{displayStats.posts}</p>
                <p className="text-xs text-muted-foreground">Posts</p>
              </button>
              <button onClick={() => setShowFollowersModal(true)} className="rounded-lg p-1 hover:bg-secondary/60">
                <p className="text-lg font-bold text-foreground">{displayStats.followers}</p>
                <p className="text-xs text-muted-foreground">Followers</p>
              </button>
              <button onClick={() => setShowFollowingModal(true)} className="rounded-lg p-1 hover:bg-secondary/60">
                <p className="text-lg font-bold text-foreground">{displayStats.following}</p>
                <p className="text-xs text-muted-foreground">Following</p>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-foreground">{profile?.display_name || "User"}</p>
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
                className="lift-on-tap flex-1 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                Edit profile
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + `/profile/${viewingUserId}`);
                  toast.success("Profile link copied");
                }}
                className="lift-on-tap rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                Share
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFollow}
                disabled={toggleFollow.isPending}
                className={`lift-on-tap flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${
                  isFollowing || hasPendingRequest
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {isFollowing ? "Following" : hasPendingRequest ? "Requested" : "Follow"}
              </button>
              <button
                onClick={handleMessageUser}
                className="lift-on-tap flex-1 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
              >
                Message
              </button>
            </>
          )}
        </div>

        {isOwnProfile && !!incomingFollowRequests?.length && (
          <div className="mt-4 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow Requests</p>
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
                  <button onClick={() => handleRespondRequest(request.id, request.follower_id, true)} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Accept</button>
                  <button onClick={() => handleRespondRequest(request.id, request.follower_id, false)} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">Decline</button>
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

            {(highlights || []).map((highlight: any) => (
              <div key={highlight.id} className="shrink-0 text-center">
                <button
                  onClick={() => toast.message(`${highlight.title} highlight opened`) }
                  className="h-16 w-16 overflow-hidden rounded-full border border-border bg-secondary"
                >
                  {highlight.cover_url ? (
                    <img src={highlight.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{highlight.title[0]}</div>
                  )}
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

        {(profile?.professional_account || isOwnProfile) && !!creatorMetrics && (
          <div className="mt-5 rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Professional Dashboard</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary/50 p-2">
                <Eye className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-bold text-foreground">{creatorMetrics.reach}</p>
                <p className="text-[10px] text-muted-foreground">Reach</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <TrendingUp className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-bold text-foreground">{creatorMetrics.engagement}</p>
                <p className="text-[10px] text-muted-foreground">Engagement</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <Play className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-bold text-foreground">{creatorMetrics.posts}</p>
                <p className="text-[10px] text-muted-foreground">Posts</p>
              </div>
            </div>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested for you</p>
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

      <div className="mt-4 flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex justify-center py-3 transition-colors ${
              activeTab === tab.id ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground"
            }`}
          >
            <tab.icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {!canViewPrivateContent ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Lock className="mb-2 h-8 w-8" />
          <p className="text-sm font-semibold text-foreground">This account is private</p>
          <p className="mt-1 text-xs">Follow this user to see their content</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {currentVideos.map((video: any) => (
            <div key={video.id} className="relative aspect-[9/16] overflow-hidden bg-secondary">
              {video.thumbnail_url ? (
                <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : video.video_url ? (
                <video src={video.video_url} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Play className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              {pinnedVideoIds.has(video.id) && (
                <div className="absolute right-1 top-1 rounded-full bg-black/60 p-1">
                  <Pin className="h-3 w-3 text-white" />
                </div>
              )}
              {isOwnProfile && (activeTab === "posts" || activeTab === "reels") && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await togglePinVideo.mutateAsync({ videoId: video.id, isPinned: !!video.is_pinned });
                      toast.success(video.is_pinned ? "Post unpinned" : "Post pinned");
                    } catch (error: any) {
                      toast.error(error.message || "Unable to change pin status");
                    }
                  }}
                  className="absolute left-1 top-1 rounded-full bg-black/60 p-1"
                  title={video.is_pinned ? "Unpin post" : "Pin post"}
                >
                  <Pin className="h-3 w-3 text-white" />
                </button>
              )}
              <div className="absolute bottom-1 left-1 flex items-center gap-1">
                <Play className="h-3 w-3 text-white" fill="white" />
                <span className="text-[10px] font-medium text-white">{video.likes_count || 0}</span>
              </div>
            </div>
          ))}
          {currentVideos.length === 0 && (
            <div className="col-span-3 py-16 text-center text-sm text-muted-foreground">
              {activeTab === "posts"
                ? "No posts yet"
                : activeTab === "reels"
                ? "No reels yet"
                : activeTab === "tagged"
                ? "No tagged posts"
                : "No saved posts"}
            </div>
          )}
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
      {showFollowingModal && (
        <PeopleModal title="Following" people={followingList || []} onClose={() => setShowFollowingModal(false)} onOpenProfile={(id) => navigate(`/profile/${id}`)} />
      )}
    </div>
  );
};

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
  const [isVerified, setIsVerified] = useState(!!profile?.is_verified);
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
        is_verified: isVerified,
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
              <span>Verified badge (admin)</span>
              <input type="checkbox" checked={isVerified} onChange={(event) => setIsVerified(event.target.checked)} />
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Links</p>
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

export default Profile;

