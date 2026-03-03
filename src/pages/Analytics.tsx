import { useState } from "react";
import {
  TrendingUp,
  Eye,
  Heart,
  MessageCircle,
  Users,
  Video,
  BarChart3,
  Calendar,
  Clock3,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAnalyticsSummary,
  useBestPostingWindows,
  useCreatorGrowthInsights,
  useUserAnalytics,
  useVideoRetentionHighlights,
  useTopVideos,
} from "@/hooks/useAnalytics";
import { useNavigate } from "react-router-dom";

const Analytics = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30);

  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: analytics, isLoading: analyticsLoading } =
    useUserAnalytics(undefined, timeRange);
  const { data: topVideos, isLoading: topLoading } = useTopVideos(5);
  const { data: growthInsights, isLoading: growthLoading } = useCreatorGrowthInsights(timeRange);
  const { data: bestPostingWindows, isLoading: windowsLoading } = useBestPostingWindows(timeRange, 4);
  const { data: retentionHighlights, isLoading: retentionLoading } = useVideoRetentionHighlights(5, timeRange);

  if (summaryLoading) {
    return (
      <div className="min-h-screen bg-background p-4 pb-20 pt-safe">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="h-10 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: "Total Views",
      value: summary?.totalViews.toLocaleString() || "0",
      icon: Eye,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "Total Likes",
      value: summary?.totalLikes.toLocaleString() || "0",
      icon: Heart,
      color: "text-pink-600",
      bgColor: "bg-pink-50",
    },
    {
      label: "Followers",
      value: summary?.followersCount.toLocaleString() || "0",
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      label: "Videos",
      value: summary?.totalVideos.toLocaleString() || "0",
      icon: Video,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-4 pb-20 pt-safe fade-in">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your content performance
            </p>
          </div>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Time range selector */}
        <div className="flex gap-2 mb-6">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              variant={timeRange === days ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange(days as 7 | 30 | 90)}
            >
              Last {days} days
            </Button>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((stat) => (
            <Card key={stat.label} className="rounded-2xl panel-surface">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}
                  >
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Views Over Time */}
          <Card className="rounded-2xl panel-surface">
            <CardHeader>
              <CardTitle className="text-lg">Views Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
              ) : analytics && analytics.length > 0 ? (
                <div className="h-48 flex items-end justify-between gap-1">
                  {analytics.slice(-14).map((day: any, i: number) => {
                    const maxViews = Math.max(
                      ...analytics.map((d: any) => d.total_video_views || 0)
                    );
                    const height = maxViews > 0
                      ? ((day.total_video_views || 0) / maxViews) * 100
                      : 0;
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${day.total_video_views || 0} views`}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  No data available yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Engagement Rate */}
          <Card className="rounded-2xl panel-surface">
            <CardHeader>
              <CardTitle className="text-lg">Engagement Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <div className="text-5xl font-bold text-green-600 mb-2">
                    {summary?.avgEngagementRate.toFixed(1) || "0.0"}%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Average engagement rate
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Performing Videos */}
        <Card className="rounded-2xl panel-surface">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              Top Performing Videos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : topVideos && topVideos.length > 0 ? (
              <div className="space-y-3">
                {topVideos.map((video: any, index: number) => (
                  <div
                    key={video.id}
                    onClick={() =>
                      navigate("/clipy", {
                        state: { focusVideoId: video.id, focusSource: "analytics" },
                      })
                    }
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="text-xl font-bold text-gray-400 w-6">
                      #{index + 1}
                    </div>
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                      {video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {video.description || "Untitled Video"}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {video.views_count?.toLocaleString() || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {video.likes_count?.toLocaleString() || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {video.comments_count?.toLocaleString() || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No videos yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Performance */}
        <Card className="rounded-2xl mt-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Recent Performance (Last {timeRange} Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold">
                  {summary?.last30DaysViews.toLocaleString() || "0"}
                </p>
                <p className="text-sm text-muted-foreground">Views</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summary?.last30DaysEngagement.toLocaleString() || "0"}
                </p>
                <p className="text-sm text-muted-foreground">Engagements</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summary?.followersCount || 0}
                </p>
                <p className="text-sm text-muted-foreground">Followers</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summary?.avgEngagementRate.toFixed(1) || "0.0"}%
                </p>
                <p className="text-sm text-muted-foreground">Avg. Engagement</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Growth Insights */}
        <Card className="rounded-2xl mt-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              Growth Funnel & Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {growthLoading ? (
              <div className="h-28 bg-gray-100 rounded-lg animate-pulse" />
            ) : growthInsights ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-lg font-bold">{growthInsights.completionRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Completion rate</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{growthInsights.likeRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Like rate</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{growthInsights.shareRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Share rate</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{growthInsights.followerGrowthRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Follower growth</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold text-foreground">
                    Recommendation Quality: {growthInsights.recommendationQuality}
                  </p>
                  {!!growthInsights.recommendations.length && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {growthInsights.recommendations.map((item, idx) => (
                        <li key={idx}>- {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No growth insights available yet.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 mt-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock3 className="w-5 h-5 text-orange-600" />
                Best Time to Post
              </CardTitle>
            </CardHeader>
            <CardContent>
              {windowsLoading ? (
                <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ) : bestPostingWindows && bestPostingWindows.length > 0 ? (
                <div className="space-y-2">
                  {bestPostingWindows.map((slot: any) => (
                    <div key={slot.label} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{slot.label}</p>
                        <p className="text-xs text-muted-foreground">{slot.count} posts analyzed</p>
                      </div>
                      <p className="text-sm font-semibold text-primary">{slot.avgScore.toFixed(1)} score</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Post more consistently to unlock timing insights.</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                Retention Highlights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {retentionLoading ? (
                <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ) : retentionHighlights && retentionHighlights.length > 0 ? (
                <div className="space-y-2">
                  {retentionHighlights.map((video: any) => (
                    <div key={video.id} className="rounded-lg border border-border/70 px-3 py-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {video.description || "Untitled video"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {video.completionRate.toFixed(1)}% completion ({video.completes}/{video.starts})
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Need more watch events to compute retention highlights.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
