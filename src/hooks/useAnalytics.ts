import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

// Fetch user's video analytics
export const useVideoAnalytics = (videoId?: string, days: number = 30) => {
  return useQuery({
    queryKey: ["video-analytics", videoId, days],
    queryFn: async () => {
      if (!videoId) return null;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await db
        .from("video_analytics")
        .select("*")
        .eq("video_id", videoId)
        .gte("date", startDate.toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!videoId,
  });
};

// Fetch user's overall analytics
export const useUserAnalytics = (userId?: string, days: number = 30) => {
  return useQuery({
    queryKey: ["user-analytics", userId, days],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) throw new Error("Not authenticated");

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await db
        .from("user_analytics")
        .select("*")
        .eq("user_id", targetUserId)
        .gte("date", startDate.toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
};

// Fetch aggregated analytics summary
export const useAnalyticsSummary = () => {
  return useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user's videos with stats
      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("id, likes_count, comments_count, created_at")
        .eq("user_id", user.id);

      if (videosError) throw videosError;

      // Calculate totals
      const totalVideos = videos?.length || 0;
      const totalLikes = videos?.reduce((sum, v) => sum + (v.likes_count || 0), 0) || 0;
      const totalComments = videos?.reduce((sum, v) => sum + (v.comments_count || 0), 0) || 0;
      
      // Get total views from analytics
      const { data: allAnalytics } = await db
        .from("video_analytics")
        .select("views")
        .in("video_id", videos?.map((v: any) => v.id) || []);
      
      const totalViews = allAnalytics?.reduce((sum, a) => sum + (a.views || 0), 0) || 0;

      // Get followers count
      const { count: followersCount } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", user.id);

      // Get following count
      const { count: followingCount } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", user.id);

      // Get recent analytics (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentAnalytics } = await db
        .from("user_analytics")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);

      const last30DaysViews = recentAnalytics?.reduce(
        (sum, a) => sum + (a.total_video_views || 0),
        0
      ) || 0;

      const last30DaysEngagement = recentAnalytics?.reduce(
        (sum, a) => sum + (a.total_likes || 0) + (a.total_comments || 0),
        0
      ) || 0;

      // Calculate average engagement rate
      const avgEngagementRate =
        recentAnalytics && recentAnalytics.length > 0
          ? recentAnalytics.reduce((sum, a) => sum + (a.engagement_rate || 0), 0) /
            recentAnalytics.length
          : 0;

      return {
        totalVideos,
        totalLikes,
        totalComments,
        totalViews,
        followersCount: followersCount || 0,
        followingCount: followingCount || 0,
        last30DaysViews,
        last30DaysEngagement,
        avgEngagementRate,
        videos: videos || [],
      };
    },
  });
};

// Fetch top-performing videos
export const useTopVideos = (limit: number = 10) => {
  return useQuery({
    queryKey: ["top-videos", limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", user.id)
        .order("likes_count", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
  });
};

// Fetch audience demographics (simplified version)
export const useAudienceDemographics = () => {
  return useQuery({
    queryKey: ["audience-demographics"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get followers
      const { data: followers, error } = await supabase
        .from("follows")
        .select(`
          follower_id,
          profiles!follows_follower_id_fkey (
            id,
            created_at
          )
        `)
        .eq("following_id", user.id);

      if (error) throw error;

      // Basic demographics (in real app would come from user_analytics.audience_demographics)
      return {
        totalFollowers: followers?.length || 0,
        // Could add more demographic data here
      };
    },
  });
};

// Creator growth insights (funnel + recommendation health)
export const useCreatorGrowthInsights = (days: number = 30) => {
  return useQuery({
    queryKey: ["creator-growth-insights", days],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString();

      const [videosRes, followsRes, newFollowersRes, eventsRes] = await Promise.all([
        supabase
          .from("videos")
          .select("id")
          .eq("user_id", user.id),
        supabase
          .from("follows")
          .select("id", { count: "exact", head: true })
          .eq("following_id", user.id),
        supabase
          .from("follows")
          .select("id", { count: "exact", head: true })
          .eq("following_id", user.id)
          .gte("created_at", sinceIso),
        db
          .from("video_events")
          .select("event_type, video_id")
          .gte("created_at", sinceIso),
      ]);

      if (videosRes.error) throw videosRes.error;
      if (followsRes.error) throw followsRes.error;
      if (newFollowersRes.error) throw newFollowersRes.error;
      if (eventsRes.error) throw eventsRes.error;

      const myVideoIds = new Set((videosRes.data || []).map((video) => video.id));
      const relevantEvents = (eventsRes.data || []).filter((event) => myVideoIds.has(event.video_id));

      const views = relevantEvents.filter((event) => event.event_type === "view_start").length;
      const completes = relevantEvents.filter((event) => event.event_type === "view_complete").length;
      const likes = relevantEvents.filter((event) => event.event_type === "like").length;
      const shares = relevantEvents.filter((event) => event.event_type === "share").length;

      const completionRate = views > 0 ? (completes / views) * 100 : 0;
      const likeRate = views > 0 ? (likes / views) * 100 : 0;
      const shareRate = views > 0 ? (shares / views) * 100 : 0;

      const totalFollowers = followsRes.count || 0;
      const newFollowers = newFollowersRes.count || 0;
      const followerGrowthRate = totalFollowers > 0 ? (newFollowers / totalFollowers) * 100 : 0;

      let recommendationQuality: "Excellent" | "Good" | "Needs work" = "Needs work";
      if (completionRate >= 35 && shareRate >= 1.5) recommendationQuality = "Excellent";
      else if (completionRate >= 20 && likeRate >= 2) recommendationQuality = "Good";

      const recommendations: string[] = [];
      if (completionRate < 20) recommendations.push("Improve first 3 seconds to lift completion rate.");
      if (likeRate < 2) recommendations.push("Test stronger captions and hooks to increase likes.");
      if (shareRate < 1) recommendations.push("Create more save/share-worthy utility content.");
      if (newFollowers < 5) recommendations.push("Post collaboration content to improve follower conversion.");

      return {
        views,
        completes,
        likes,
        shares,
        newFollowers,
        totalFollowers,
        completionRate,
        likeRate,
        shareRate,
        followerGrowthRate,
        recommendationQuality,
        recommendations: recommendations.slice(0, 3),
      };
    },
  });
};
