import { Settings, Grid3X3, Bookmark, Heart, LogOut, Camera, X, Loader2, Play } from "lucide-react";
import { useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useFollowCounts, useUserVideos, useLikedVideos, useBookmarkedVideos, useUpdateProfile } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useProfile(user?.id);
  const { data: counts } = useFollowCounts(user?.id);
  const { data: videos } = useUserVideos(user?.id);
  const { data: likedVideos } = useLikedVideos(user?.id);
  const { data: bookmarkedVideos } = useBookmarkedVideos(user?.id);
  const updateProfile = useUpdateProfile();
  const [activeTab, setActiveTab] = useState<"videos" | "liked" | "saved">("videos");
  const [showEditModal, setShowEditModal] = useState(false);

  if (!user) {
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

  const tabs = [
    { id: "videos" as const, icon: Grid3X3, label: "Videos" },
    { id: "liked" as const, icon: Heart, label: "Liked" },
    { id: "saved" as const, icon: Bookmark, label: "Saved" },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const currentVideos =
    activeTab === "videos"
      ? videos || []
      : activeTab === "liked"
      ? likedVideos || []
      : bookmarkedVideos || [];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="text-lg font-bold text-foreground">@{profile?.username || "you"}</span>
        <button onClick={handleSignOut} className="rounded-lg bg-secondary p-2">
          <LogOut className="h-4 w-4 text-foreground" />
        </button>
      </div>

      {/* Profile Info */}
      <div className="flex flex-col items-center py-6">
        <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold text-muted-foreground overflow-hidden">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            (profile?.display_name?.[0] || "U").toUpperCase()
          )}
        </div>
        <p className="mt-2 text-base font-bold text-foreground">{profile?.display_name || "User"}</p>

        {/* Stats */}
        <div className="mt-4 flex gap-8">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{counts?.following ?? 0}</p>
            <p className="text-xs text-muted-foreground">Following</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{counts?.followers ?? 0}</p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{(videos || []).length}</p>
            <p className="text-xs text-muted-foreground">Videos</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setShowEditModal(true)}
            className="rounded-lg bg-secondary px-8 py-2 text-sm font-semibold text-secondary-foreground"
          >
            Edit profile
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.origin + "/profile");
              toast.success("Profile link copied!");
            }}
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
          >
            Share
          </button>
        </div>

        <p className="mt-3 px-8 text-center text-sm text-muted-foreground">{profile?.bio || "No bio yet."}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
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

      {/* Video Grid */}
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {currentVideos.map((video: any) => (
          <div key={video.id} className="relative aspect-[9/16] overflow-hidden bg-secondary">
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : video.video_url ? (
              <video
                src={video.video_url}
                className="h-full w-full object-cover"
                muted
                preload="metadata"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Play className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="absolute bottom-1 left-1 flex items-center gap-1">
              <Play className="h-3 w-3 text-white" fill="white" />
              <span className="text-[10px] font-medium text-white">{video.likes_count || 0}</span>
            </div>
          </div>
        ))}
        {currentVideos.length === 0 && (
          <div className="col-span-3 py-16 text-center text-sm text-muted-foreground">
            {activeTab === "videos" ? "No videos yet" : activeTab === "liked" ? "No liked videos" : "No saved videos"}
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {showEditModal && (
        <EditProfileModal
          profile={profile}
          userId={user.id}
          onClose={() => setShowEditModal(false)}
          onUpdate={updateProfile}
        />
      )}
    </div>
  );
};

function EditProfileModal({
  profile,
  userId,
  onClose,
  onUpdate,
}: {
  profile: any;
  userId: string;
  onClose: () => void;
  onUpdate: any;
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      });
      toast.success("Profile updated!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
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
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative h-24 w-24 rounded-full bg-secondary overflow-hidden"
            disabled={uploadingAvatar}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground">
                {(displayName?.[0] || "U").toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              {uploadingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
          </button>
          <p className="text-xs text-muted-foreground">Change photo</p>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              maxLength={30}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bio</label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={150}
              rows={3}
              className="resize-none"
              placeholder="Tell the world about yourself..."
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{bio.length}/150</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;
