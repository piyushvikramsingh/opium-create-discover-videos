import { Settings, Grid3X3, Bookmark, Heart, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useFollowCounts, useUserVideos } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useProfile(user?.id);
  const { data: counts } = useFollowCounts(user?.id);
  const { data: videos } = useUserVideos(user?.id);
  const [activeTab, setActiveTab] = useState<"videos" | "liked" | "saved">("videos");

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
    { id: "videos" as const, icon: Grid3X3 },
    { id: "liked" as const, icon: Heart },
    { id: "saved" as const, icon: Bookmark },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="text-lg font-bold text-foreground">@{profile?.username || "you"}</span>
        <button onClick={handleSignOut}>
          <LogOut className="h-5 w-5 text-foreground" />
        </button>
      </div>

      <div className="flex flex-col items-center py-6">
        <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold text-muted-foreground overflow-hidden">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            (profile?.display_name?.[0] || "U").toUpperCase()
          )}
        </div>
        <p className="mt-3 text-base font-bold text-foreground">@{profile?.username || "you"}</p>

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
            <p className="text-lg font-bold text-foreground">{videos?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Videos</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="rounded-lg bg-secondary px-8 py-2 text-sm font-semibold text-secondary-foreground">
            Edit profile
          </button>
          <button className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            Share
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{profile?.bio || "No bio yet."}</p>
      </div>

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

      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {(videos || []).map((video: any) => (
          <div key={video.id} className="relative aspect-[9/16] overflow-hidden">
            <img src={video.thumbnail_url || video.video_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
        ))}
        {(!videos || videos.length === 0) && (
          <div className="col-span-3 py-12 text-center text-sm text-muted-foreground">
            No videos yet
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
