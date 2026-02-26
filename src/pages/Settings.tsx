import { ArrowLeft, BadgeCheck, Bell, Loader2, Lock, LogOut, Shield, UserRound, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import {
  useAdminUpdateProfileStatus,
  useProfile,
  useReferrals,
  useUnreadNotificationsCount,
  useUpdateProfile,
  useUpsertUserSettings,
  useUserSettings,
} from "@/hooks/useData";
import { useCloseFriendCandidates, useCloseFriends, useToggleCloseFriend } from "@/hooks/useStories";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Settings = () => {
  const navigate = useNavigate();
  const { user, session, signOut } = useAuth();

  const { data: profile } = useProfile(user?.id);
  const { data: closeFriends = [] } = useCloseFriends();
  const [closeFriendsQuery, setCloseFriendsQuery] = useState("");
  const { data: closeFriendCandidates = [] } = useCloseFriendCandidates(closeFriendsQuery, 100);
  const { data: userSettings } = useUserSettings();
  const { data: referrals = [] } = useReferrals();
  const { data: unreadNotifications = 0 } = useUnreadNotificationsCount();
  const updateProfile = useUpdateProfile();
  const upsertUserSettings = useUpsertUserSettings();
  const adminUpdateProfileStatus = useAdminUpdateProfileStatus();
  const toggleCloseFriend = useToggleCloseFriend();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [showLastActive, setShowLastActive] = useState(true);
  const [professionalAccount, setProfessionalAccount] = useState(false);
  const [allowComments, setAllowComments] = useState(true);
  const [allowMentions, setAllowMentions] = useState(true);
  const [allowMessagesFrom, setAllowMessagesFrom] = useState<"everyone" | "following" | "none">("everyone");
  const [pushLikes, setPushLikes] = useState(true);
  const [pushComments, setPushComments] = useState(true);
  const [pushMessages, setPushMessages] = useState(true);
  const [pushMessageRequests, setPushMessageRequests] = useState(true);
  const [pushSaves, setPushSaves] = useState(true);
  const [pushFollows, setPushFollows] = useState(true);
  const [dailyRecap, setDailyRecap] = useState(true);
  const [reengagementNudges, setReengagementNudges] = useState(true);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [quietModeEnabled, setQuietModeEnabled] = useState(false);
  const [quietModeStart, setQuietModeStart] = useState("22:00");
  const [quietModeEnd, setQuietModeEnd] = useState("08:00");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [sensitiveContentLevel, setSensitiveContentLevel] = useState<"more" | "standard" | "less">("standard");
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [hideViewCount, setHideViewCount] = useState(false);
  const [storyReplies, setStoryReplies] = useState<"everyone" | "following" | "off">("everyone");
  const [tagsAllowedFrom, setTagsAllowedFrom] = useState<"everyone" | "following" | "none">("everyone");
  const [mentionRequests, setMentionRequests] = useState(true);
  // closeFriendsQuery declared above with hooks
  const [adPersonalization, setAdPersonalization] = useState(true);
  const [adsPartnerData, setAdsPartnerData] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [language, setLanguage] = useState("English");
  const [accountEmail, setAccountEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [adminTargetUserId, setAdminTargetUserId] = useState("");
  const [adminSetVerified, setAdminSetVerified] = useState(false);
  const [adminSetMonetized, setAdminSetMonetized] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name || "");
    setUsername(profile?.username || "");
    setBio(profile?.bio || "");
    setWebsiteUrl(profile?.website_url || "");
    setIsPrivate(!!profile?.is_private);
    setShowLastActive(profile?.show_last_active !== false);
    setProfessionalAccount(!!profile?.professional_account);
    setAllowComments(profile?.allow_comments !== false);
    setAllowMentions(profile?.allow_mentions !== false);
    setAllowMessagesFrom(
      profile?.allow_messages_from === "following" || profile?.allow_messages_from === "none"
        ? profile.allow_messages_from
        : "everyone",
    );
    setPushLikes(profile?.push_likes !== false);
    setPushComments(profile?.push_comments !== false);
    setPushMessages(profile?.push_messages !== false);
    setTwoFactorEnabled(!!profile?.two_factor_enabled);
    setLoginAlerts(profile?.login_alerts !== false);
    setAccountEmail(session?.user?.email || "");
  }, [profile, session?.user?.email]);

  useEffect(() => {
    if (!userSettings) return;
    const asRecord = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {});
    const notifications = asRecord(userSettings.notifications);
    const content = asRecord(userSettings.content);
    const interactions = asRecord(userSettings.interactions);
    const ads = asRecord(userSettings.ads);
    const accessibility = asRecord(userSettings.accessibility);
    const app = asRecord(userSettings.app);

    setPushLikes(notifications.push_likes ?? (profile?.push_likes !== false));
    setPushComments(notifications.push_comments ?? (profile?.push_comments !== false));
    setPushMessages(notifications.push_messages ?? (profile?.push_messages !== false));
    setPushMessageRequests(notifications.push_message_requests !== false);
    setPushSaves(notifications.push_saves !== false);
    setPushFollows(notifications.push_follows !== false);
    setDailyRecap(notifications.daily_recap !== false);
    setReengagementNudges(notifications.reengagement_nudges !== false);
    setEmailMarketing(!!notifications.email_marketing);
    setQuietModeEnabled(!!notifications.quiet_mode_enabled);
    setQuietModeStart(typeof notifications.quiet_mode_start === "string" ? notifications.quiet_mode_start : "22:00");
    setQuietModeEnd(typeof notifications.quiet_mode_end === "string" ? notifications.quiet_mode_end : "08:00");

    setSensitiveContentLevel(
      content.sensitive_content_level === "more" || content.sensitive_content_level === "less"
        ? content.sensitive_content_level
        : "standard",
    );
    setHideLikeCount(!!content.hide_like_count);
    setHideViewCount(!!content.hide_view_count);

    setStoryReplies(
      interactions.story_replies === "following" || interactions.story_replies === "off"
        ? interactions.story_replies
        : "everyone",
    );
    setTagsAllowedFrom(
      interactions.tags_allowed_from === "following" || interactions.tags_allowed_from === "none"
        ? interactions.tags_allowed_from
        : "everyone",
    );
    setMentionRequests(interactions.mention_requests !== false);

    setAdPersonalization(ads.personalization !== false);
    setAdsPartnerData(ads.partner_data !== false);

    setCaptionsEnabled(!!accessibility.captions_enabled);
    setHighContrast(!!accessibility.high_contrast);
    setReduceMotion(!!accessibility.reduce_motion);

    setDarkMode(!!app.dark_mode);
    setDataSaver(!!app.data_saver);
    setLanguage(typeof app.language === "string" && app.language ? app.language : "English");
  }, [userSettings, profile?.push_likes, profile?.push_comments, profile?.push_messages]);

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background pb-20">
        <p className="text-muted-foreground">Sign in to manage settings</p>
        <Button onClick={() => navigate("/auth")}>Sign In</Button>
      </div>
    );
  }

  const handleSave = async () => {
    if (!displayName.trim() || !username.trim()) {
      toast.error("Display name and username are required");
      return;
    }

    try {
      await updateProfile.mutateAsync({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
        bio: bio.trim(),
        website_url: websiteUrl.trim() || null,
        is_private: isPrivate,
        show_last_active: showLastActive,
        professional_account: professionalAccount,
        allow_comments: allowComments,
        allow_mentions: allowMentions,
        allow_messages_from: allowMessagesFrom,
        push_likes: pushLikes,
        push_comments: pushComments,
        push_messages: pushMessages,
        two_factor_enabled: twoFactorEnabled,
        login_alerts: loginAlerts,
      });
      toast.success("Settings updated");
    } catch (error: any) {
      toast.error(error.message || "Could not save settings");
    }
  };

  const saveSettingsSection = async (updates: {
    privacy?: Record<string, any>;
    notifications?: Record<string, any>;
    content?: Record<string, any>;
    interactions?: Record<string, any>;
    ads?: Record<string, any>;
    accessibility?: Record<string, any>;
    app?: Record<string, any>;
  }, successMessage: string) => {
    try {
      await upsertUserSettings.mutateAsync(updates);
      toast.success(successMessage);
    } catch (error: any) {
      toast.error(error.message || "Could not save settings");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleUpdateEmail = async () => {
    if (!accountEmail.trim()) {
      toast.error("Email is required");
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: accountEmail.trim() });
    if (error) {
      toast.error(error.message || "Could not update email");
      return;
    }

    toast.success("Verification email sent to update your login email");
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message || "Could not update password");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated");
  };

  const handleAdminApply = async () => {
    if (!adminTargetUserId.trim()) {
      toast.error("User ID is required");
      return;
    }

    try {
      await adminUpdateProfileStatus.mutateAsync({
        targetUserId: adminTargetUserId.trim(),
        isVerified: adminSetVerified,
        isMonetized: adminSetMonetized,
      });
      toast.success("Admin update applied");
    } catch (error: any) {
      toast.error(error.message || "Admin update failed");
    }
  };

  const closeFriendIds = new Set((closeFriends as any[]).map((row: any) => row.friend_id));
  const filteredFollowing = closeFriendCandidates as any[];

  const handleToggleCloseFriend = async (targetUserId: string) => {
    try {
      await toggleCloseFriend.mutateAsync({
        targetUserId,
        isCloseFriend: closeFriendIds.has(targetUserId),
      });
      toast.success(closeFriendIds.has(targetUserId) ? "Removed from close friends" : "Added to close friends");
    } catch (error: any) {
      toast.error(error?.message || "Could not update close friends");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={() => navigate(-1)} className="rounded-lg p-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Settings and activity</h1>
        <div className="w-6" />
      </div>

      <div className="px-4 py-4">
        <section className="mb-4 rounded-2xl border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick access</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate("/engagement")}>Engagement</Button>
            <Button variant="secondary" size="sm" onClick={() => navigate("/live")}>Live</Button>
            <Button variant="secondary" size="sm" onClick={() => navigate("/monetization")}>
              <Wallet className="mr-1.5 h-3.5 w-3.5" /> Monetize
            </Button>
          </div>
        </section>

        <Tabs defaultValue="account">
          <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-border bg-background px-4 pb-2 pt-1">
            <TabsList className="flex w-full justify-start gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0">
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="account">Account</TabsTrigger>
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="privacy">Privacy</TabsTrigger>
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="notifications">Notifications</TabsTrigger>
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="content">Content</TabsTrigger>
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="interactions">Interactions</TabsTrigger>
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="ads">Ads</TabsTrigger>
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="accessibility">App</TabsTrigger>
              <TabsTrigger className="shrink-0 rounded-full border border-border px-4" value="creator">Creator</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="account" className="space-y-3">
            <section className="rounded-2xl panel-surface p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" /> Personal details
              </p>
              <div className="mt-3 space-y-2">
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" maxLength={50} />
                <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" maxLength={30} />
                <Textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} placeholder="Bio" className="resize-none" maxLength={150} />
                <Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="Website" />
              </div>

              <Button className="mt-4 w-full" onClick={handleSave} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save profile changes"}
              </Button>
            </section>

            <section className="rounded-2xl panel-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Password and security</p>
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Input value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="Login email" type="email" />
                  <Button variant="secondary" className="w-full" onClick={handleUpdateEmail}>Update email</Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" type="password" />
                  <Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" type="password" />
                  <Button variant="secondary" className="w-full" onClick={handleUpdatePassword}>Update password</Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
                    <p className="text-xs text-muted-foreground">Extra login protection with a code.</p>
                  </div>
                  <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Login alerts</p>
                    <p className="text-xs text-muted-foreground">Get notified about new logins.</p>
                  </div>
                  <Switch checked={loginAlerts} onCheckedChange={setLoginAlerts} />
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-3">
            <section className="rounded-2xl panel-surface p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Bell className="h-3.5 w-3.5" /> Notifications
              </p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Likes</p>
                  <Switch checked={pushLikes} onCheckedChange={setPushLikes} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Comments</p>
                  <Switch checked={pushComments} onCheckedChange={setPushComments} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Messages</p>
                  <Switch checked={pushMessages} onCheckedChange={setPushMessages} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Message requests</p>
                  <Switch checked={pushMessageRequests} onCheckedChange={setPushMessageRequests} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Saves</p>
                  <Switch checked={pushSaves} onCheckedChange={setPushSaves} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Following & followers</p>
                  <Switch checked={pushFollows} onCheckedChange={setPushFollows} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Daily recap</p>
                  <Switch checked={dailyRecap} onCheckedChange={setDailyRecap} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Re-engagement nudges</p>
                  <Switch checked={reengagementNudges} onCheckedChange={setReengagementNudges} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Email notifications</p>
                  <Switch checked={emailMarketing} onCheckedChange={setEmailMarketing} />
                </div>
              </div>

              <Separator className="my-3" />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Quiet mode</p>
                  <Switch checked={quietModeEnabled} onCheckedChange={setQuietModeEnabled} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={quietModeStart} onChange={(event) => setQuietModeStart(event.target.value)} placeholder="Start time (HH:MM)" />
                  <Input value={quietModeEnd} onChange={(event) => setQuietModeEnd(event.target.value)} placeholder="End time (HH:MM)" />
                </div>
              </div>

              <Button
                className="mt-4 w-full"
                onClick={() =>
                  saveSettingsSection(
                    {
                      notifications: {
                        push_likes: pushLikes,
                        push_comments: pushComments,
                        push_messages: pushMessages,
                        push_message_requests: pushMessageRequests,
                        push_saves: pushSaves,
                        push_follows: pushFollows,
                        daily_recap: dailyRecap,
                        reengagement_nudges: reengagementNudges,
                        email_marketing: emailMarketing,
                        quiet_mode_enabled: quietModeEnabled,
                        quiet_mode_start: quietModeStart,
                        quiet_mode_end: quietModeEnd,
                      },
                    },
                    "Notification settings updated",
                  )
                }
                disabled={upsertUserSettings.isPending || updateProfile.isPending}
              >
                {(upsertUserSettings.isPending || updateProfile.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save notification settings"}
              </Button>

              <p className="mt-2 text-xs text-muted-foreground">Unread inbox notifications right now: {unreadNotifications}</p>
            </section>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-3">
            <section className="rounded-2xl panel-surface p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Account privacy
              </p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Private account</p>
                    <p className="text-xs text-muted-foreground">Only approved followers can see your content.</p>
                  </div>
                  <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Activity status</p>
                    <p className="text-xs text-muted-foreground">Let others see your last active time.</p>
                  </div>
                  <Switch checked={showLastActive} onCheckedChange={setShowLastActive} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Allow comments</p>
                    <p className="text-xs text-muted-foreground">Allow people to comment on your posts.</p>
                  </div>
                  <Switch checked={allowComments} onCheckedChange={setAllowComments} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Allow mentions</p>
                    <p className="text-xs text-muted-foreground">Allow others to mention your username.</p>
                  </div>
                  <Switch checked={allowMentions} onCheckedChange={setAllowMentions} />
                </div>

                <div>
                    <p className="text-sm font-medium text-foreground">Message requests</p>
                  <p className="mb-2 text-xs text-muted-foreground">Control who can start new direct messages.</p>
                  <select
                    value={allowMessagesFrom}
                    onChange={(event) => setAllowMessagesFrom(event.target.value as "everyone" | "following" | "none")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="following">People you follow</option>
                    <option value="none">No one</option>
                  </select>
                </div>
              </div>

              <Button className="mt-4 w-full" onClick={handleSave} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save privacy settings"}
              </Button>
            </section>

          </TabsContent>

          <TabsContent value="creator" className="space-y-3">
            <section className="rounded-2xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creator account</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Professional account</p>
                    <p className="text-xs text-muted-foreground">Enable creator analytics and business tools.</p>
                  </div>
                  <Switch checked={professionalAccount} onCheckedChange={setProfessionalAccount} />
                </div>

                <Separator />

                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <div className="inline-flex items-center gap-2 text-foreground">
                    <BadgeCheck className="h-4 w-4" /> Verified
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {profile?.is_verified ? "Active" : "Not verified"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <div className="inline-flex items-center gap-2 text-foreground">
                    <Wallet className="h-4 w-4" /> Monetization
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {profile?.is_monetized ? "Enabled" : "Not enabled"}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">Verification and monetization are admin-reviewed and cannot be self-enabled.</p>
              <p className="mt-1 text-xs text-muted-foreground">Your invite/referral count: {referrals.length}</p>

              <Button className="mt-4 w-full" onClick={handleSave} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save creator settings"}
              </Button>
            </section>

            {!!profile?.is_admin && (
              <section className="rounded-2xl panel-surface p-4">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" /> Admin controls
                </p>
                <div className="mt-3 space-y-3">
                  <Button className="w-full" variant="secondary" onClick={() => navigate("/admin")}>Open Admin Portal</Button>

                  <Input
                    value={adminTargetUserId}
                    onChange={(event) => setAdminTargetUserId(event.target.value)}
                    placeholder="Quick target user ID"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Set verified</span>
                    <Switch checked={adminSetVerified} onCheckedChange={setAdminSetVerified} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Set monetized</span>
                    <Switch checked={adminSetMonetized} onCheckedChange={setAdminSetMonetized} />
                  </div>
                  <Button className="w-full" onClick={handleAdminApply} disabled={adminUpdateProfileStatus.isPending}>
                    {adminUpdateProfileStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply admin update"}
                  </Button>
                </div>
              </section>
            )}
          </TabsContent>

          <TabsContent value="content" className="space-y-3">
            <section className="rounded-2xl panel-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Content preferences</p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Sensitive content</p>
                  <p className="mb-2 text-xs text-muted-foreground">Choose how much potentially sensitive content is shown.</p>
                  <select
                    value={sensitiveContentLevel}
                    onChange={(event) => setSensitiveContentLevel(event.target.value as "more" | "standard" | "less")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="more">More</option>
                    <option value="standard">Standard</option>
                    <option value="less">Less</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Hide like counts</p>
                  <Switch checked={hideLikeCount} onCheckedChange={setHideLikeCount} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Hide view counts</p>
                  <Switch checked={hideViewCount} onCheckedChange={setHideViewCount} />
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() =>
                  saveSettingsSection(
                    {
                      content: {
                        sensitive_content_level: sensitiveContentLevel,
                        hide_like_count: hideLikeCount,
                        hide_view_count: hideViewCount,
                      },
                    },
                    "Content preferences saved",
                  )
                }
                disabled={upsertUserSettings.isPending}
              >
                {upsertUserSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save content settings"}
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="interactions" className="space-y-3">
            <section className="rounded-2xl panel-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interactions</p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Story replies</p>
                  <select
                    value={storyReplies}
                    onChange={(event) => setStoryReplies(event.target.value as "everyone" | "following" | "off")}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="following">People you follow</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Who can tag you</p>
                  <select
                    value={tagsAllowedFrom}
                    onChange={(event) => setTagsAllowedFrom(event.target.value as "everyone" | "following" | "none")}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="following">People you follow</option>
                    <option value="none">No one</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Allow mention requests</p>
                  <Switch checked={mentionRequests} onCheckedChange={setMentionRequests} />
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() =>
                  saveSettingsSection(
                    {
                      interactions: {
                        story_replies: storyReplies,
                        tags_allowed_from: tagsAllowedFrom,
                        mention_requests: mentionRequests,
                      },
                    },
                    "Interaction settings saved",
                  )
                }
                disabled={upsertUserSettings.isPending}
              >
                {upsertUserSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save interaction settings"}
              </Button>

              <Separator className="my-4" />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Close friends</p>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    {closeFriendIds.size}
                  </span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">Only close friends can view stories shared to the close friends audience.</p>
                <Input
                  value={closeFriendsQuery}
                  onChange={(event) => setCloseFriendsQuery(event.target.value)}
                  placeholder="Search people you follow"
                />

                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {filteredFollowing.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">No matching follows</p>
                  ) : (
                    filteredFollowing.slice(0, 50).map((entry: any) => {
                      const userId = entry.user_id;
                      const isCloseFriend = !!entry.is_close_friend;
                      return (
                        <div key={userId} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-secondary/50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{entry.display_name || entry.username}</p>
                            <p className="truncate text-xs text-muted-foreground">@{entry.username}</p>
                          </div>
                          <Button
                            size="sm"
                            variant={isCloseFriend ? "secondary" : "default"}
                            onClick={() => handleToggleCloseFriend(userId)}
                            disabled={toggleCloseFriend.isPending}
                          >
                            {isCloseFriend ? "Remove" : "Add"}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="ads" className="space-y-3">
            <section className="rounded-2xl panel-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ad preferences</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Ads based on your activity</p>
                  <Switch checked={adPersonalization} onCheckedChange={setAdPersonalization} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Data from partners</p>
                  <Switch checked={adsPartnerData} onCheckedChange={setAdsPartnerData} />
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() =>
                  saveSettingsSection(
                    {
                      ads: {
                        personalization: adPersonalization,
                        partner_data: adsPartnerData,
                      },
                    },
                    "Ad preferences saved",
                  )
                }
                disabled={upsertUserSettings.isPending}
              >
                {upsertUserSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save ad settings"}
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="accessibility" className="space-y-3">
            <section className="rounded-2xl panel-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accessibility and display</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Auto captions</p>
                  <Switch checked={captionsEnabled} onCheckedChange={setCaptionsEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">High contrast</p>
                  <Switch checked={highContrast} onCheckedChange={setHighContrast} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Reduce motion</p>
                  <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Dark mode</p>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">Data saver</p>
                  <Switch checked={dataSaver} onCheckedChange={setDataSaver} />
                </div>
                <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Language" />
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() =>
                  saveSettingsSection(
                    {
                      accessibility: {
                        captions_enabled: captionsEnabled,
                        high_contrast: highContrast,
                        reduce_motion: reduceMotion,
                      },
                      app: {
                        dark_mode: darkMode,
                        data_saver: dataSaver,
                        language,
                      },
                    },
                    "Accessibility and app settings saved",
                  )
                }
                disabled={upsertUserSettings.isPending}
              >
                {upsertUserSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save app settings"}
              </Button>
            </section>
          </TabsContent>
        </Tabs>

        <Button variant="destructive" className="mt-4 w-full" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );
};

export default Settings;
