import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Loader2, Shield, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useAdminAuditLogs,
  useAdminDeleteVideo,
  useAdminPriorityVideoReports,
  useAdminProfiles,
  useCreatorRecommendationExperimentAlerts,
  useCreatorRecommendationExperimentMetrics,
  useCreatorRecommendationExperimentConfig,
  useRunAbuseModerationAutomation,
  useRunRetentionNudges,
  useUpsertCreatorRecommendationExperiment,
  useAdminUpdateProfileStatus,
  useAdminUpdateReportStatus,
  useAdminVideoReports,
  useActiveMessageRequestSenderThrottles,
  useCleanupExpiredMessageRequestSenderThrottles,
  useMessageRequestAdminAlerts,
  useMessageRequestAdminMetrics,
  useProfile,
  useReleaseMessageRequestSenderThrottle,
  useRunMessageRequestCriticalMitigation,
} from "@/hooks/useData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const downloadCsv = (fileName: string, rows: Record<string, any>[]) => {
  if (!rows.length) {
    toast.error("No data to export");
    return;
  }

  const headers = Object.keys(rows[0]);
  const escape = (value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const AdminPortal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: myProfile } = useProfile(user?.id);

  const [userSearch, setUserSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [recoWindowDays, setRecoWindowDays] = useState<7 | 30>(7);
  const [ctrDropThresholdPercent, setCtrDropThresholdPercent] = useState(10);
  const [messageRequestDeleteRateThresholdPercent, setMessageRequestDeleteRateThresholdPercent] = useState(70);

  const { data: users = [], isLoading: usersLoading } = useAdminProfiles(200);
  const { data: reports = [], isLoading: reportsLoading } = useAdminVideoReports(200);
  const { data: priorityReports = [], isLoading: priorityReportsLoading } = useAdminPriorityVideoReports(8);
  const { data: creatorRecoExperiment } = useCreatorRecommendationExperimentConfig();
  const { data: creatorRecoMetrics = [], isLoading: creatorRecoMetricsLoading } =
    useCreatorRecommendationExperimentMetrics(recoWindowDays);
  const { data: creatorRecoAlerts, isLoading: creatorRecoAlertsLoading } =
    useCreatorRecommendationExperimentAlerts(recoWindowDays, ctrDropThresholdPercent);
  const { data: auditLogs = [], isLoading: auditLogsLoading } = useAdminAuditLogs(300);
  const { data: messageRequestMetrics } = useMessageRequestAdminMetrics(recoWindowDays);
  const { data: messageRequestAlerts } = useMessageRequestAdminAlerts(recoWindowDays, messageRequestDeleteRateThresholdPercent, 20);
  const { data: activeMessageRequestThrottles = [] } = useActiveMessageRequestSenderThrottles(50);

  const updateProfileStatus = useAdminUpdateProfileStatus();
  const updateReportStatus = useAdminUpdateReportStatus();
  const deleteVideo = useAdminDeleteVideo();
  const runAbuseAutomation = useRunAbuseModerationAutomation();
  const runRetentionNudges = useRunRetentionNudges();
  const runMessageRequestCriticalMitigation = useRunMessageRequestCriticalMitigation();
  const releaseMessageRequestSenderThrottle = useReleaseMessageRequestSenderThrottle();
  const cleanupExpiredMessageRequestSenderThrottles = useCleanupExpiredMessageRequestSenderThrottles();
  const upsertCreatorRecoExperiment = useUpsertCreatorRecommendationExperiment();

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;

    return users.filter((profile: any) => {
      const text = `${profile.username || ""} ${profile.display_name || ""} ${profile.user_id || ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [users, userSearch]);

  const filteredReports = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    if (!query) return reports;

    return reports.filter((report: any) => {
      const text = `${report.reason || ""} ${report.status || ""} ${report.reporter_profile?.username || ""} ${report.owner_profile?.username || ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [reports, reportSearch]);

  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (!query) return auditLogs;

    return auditLogs.filter((log: any) => {
      const text = `${log.action || ""} ${log.actor_profile?.username || ""} ${log.target_profile?.username || ""} ${log.target_video_id || ""} ${log.target_report_id || ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [auditLogs, auditSearch]);

  const overview = useMemo(() => {
    const openReports = reports.filter((report: any) => report.status === "open").length;
    const reviewingReports = reports.filter((report: any) => report.status === "reviewing").length;
    const verifiedUsers = users.filter((profile: any) => profile.is_verified).length;
    const monetizedUsers = users.filter((profile: any) => profile.is_monetized).length;

    return {
      users: users.length,
      openReports,
      reviewingReports,
      verifiedUsers,
      monetizedUsers,
      resolvedReports: reports.filter((report: any) => report.status === "resolved").length,
    };
  }, [reports, users]);

  const reportStatusBars = useMemo(() => {
    const total = reports.length || 1;
    const statuses: Array<"open" | "reviewing" | "resolved" | "dismissed"> = ["open", "reviewing", "resolved", "dismissed"];
    return statuses.map((status) => {
      const count = reports.filter((report: any) => report.status === status).length;
      const pct = Math.round((count / total) * 100);
      return { status, count, pct };
    });
  }, [reports]);

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background pb-20">
        <p className="text-muted-foreground">Sign in to access admin portal</p>
        <Button onClick={() => navigate("/auth")}>Sign In</Button>
      </div>
    );
  }

  if (!myProfile?.is_admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 pb-20 text-center">
        <Shield className="h-8 w-8 text-muted-foreground" />
        <p className="text-base font-semibold text-foreground">Admin access only</p>
        <p className="text-sm text-muted-foreground">You do not have permission to use this portal.</p>
        <Button variant="secondary" onClick={() => navigate("/settings")}>Back to Settings</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={() => navigate(-1)} className="rounded-lg p-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Admin Portal</h1>
        <Badge variant="secondary">Platform Control</Badge>
      </div>

      <div className="px-4 py-4">
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="monetization">Monetize</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <div className="grid grid-cols-2 gap-2 pt-2">
              <StatCard label="Users" value={overview.users} />
              <StatCard label="Open reports" value={overview.openReports} />
              <StatCard label="Reviewing" value={overview.reviewingReports} />
              <StatCard label="Verified" value={overview.verifiedUsers} />
              <StatCard label="Monetized" value={overview.monetizedUsers} />
              <StatCard label="Resolved" value={overview.resolvedReports} />
            </div>

            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform controls</p>
              <p className="mt-2 text-sm text-foreground">Use this portal to approve verification, enable monetization, and moderate reports, similar to how social platforms centralize trust and safety controls.</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate("/engagement")}>Engagement</Button>
                <Button size="sm" variant="secondary" onClick={() => navigate("/live")}>Live</Button>
                <Button size="sm" variant="secondary" onClick={() => navigate("/monetization")}>Monetization</Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const rows = await runAbuseAutomation.mutateAsync({ maxUpdates: 100 });
                      toast.success(`Abuse automation escalated ${rows.length} reports`);
                    } catch (error: any) {
                      toast.error(error.message || "Could not run abuse automation");
                    }
                  }}
                  disabled={runAbuseAutomation.isPending}
                >
                  {runAbuseAutomation.isPending ? "Running..." : "Run Abuse Automation"}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const rows = await runRetentionNudges.mutateAsync({ limitCount: 250 });
                      const recap = rows.find((row: any) => row.kind === "recap")?.inserted_count || 0;
                      const reengage = rows.find((row: any) => row.kind === "reengage")?.inserted_count || 0;
                      toast.success(`Nudges sent: recap ${recap}, re-engage ${reengage}`);
                    } catch (error: any) {
                      toast.error(error.message || "Could not run retention nudges");
                    }
                  }}
                  disabled={runRetentionNudges.isPending}
                >
                  {runRetentionNudges.isPending ? "Running..." : "Run Retention Nudges"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Moderation status mix</p>
              <div className="mt-3 space-y-2">
                {reportStatusBars.map((row) => (
                  <div key={row.status}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="capitalize text-foreground">{row.status}</span>
                      <span className="text-muted-foreground">{row.count} ({row.pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority moderation queue</p>
                <Badge variant="outline">Top risk first</Badge>
              </div>

              {priorityReportsLoading ? (
                <Loader className="py-8" />
              ) : priorityReports.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">No open high-priority reports.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {priorityReports.map((report: any) => (
                    <div key={report.report_id} className="rounded-lg border border-border/70 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {report.reason} • @{report.owner_username || "creator"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            score {Math.round(report.priority_score || 0)} • {report.report_count_on_video} reports on video
                          </p>
                        </div>
                        <Badge variant={report.status === "open" ? "destructive" : "secondary"}>
                          {report.status}
                        </Badge>
                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[11px]"
                          onClick={async () => {
                            try {
                              await updateReportStatus.mutateAsync({ reportId: report.report_id, status: "reviewing" });
                              toast.success("Marked reviewing");
                            } catch (error: any) {
                              toast.error(error.message || "Could not update report");
                            }
                          }}
                        >
                          Review
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={async () => {
                            try {
                              await updateReportStatus.mutateAsync({ reportId: report.report_id, status: "resolved" });
                              toast.success("Resolved");
                            } catch (error: any) {
                              toast.error(error.message || "Could not resolve");
                            }
                          }}
                        >
                          Resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-[11px]"
                          onClick={async () => {
                            try {
                              await deleteVideo.mutateAsync({ videoId: report.video_id });
                              await updateReportStatus.mutateAsync({ reportId: report.report_id, status: "resolved" });
                              toast.success("Video removed");
                            } catch (error: any) {
                              toast.error(error.message || "Could not remove video");
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creator recommendation experiment</p>
                <Badge variant={creatorRecoExperiment?.status === "active" ? "default" : "secondary"}>
                  {creatorRecoExperiment?.status || "paused"}
                </Badge>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Exposure cap/day: {creatorRecoExperiment?.exposure_cap_per_day ?? 4}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await upsertCreatorRecoExperiment.mutateAsync({
                        name: creatorRecoExperiment?.name || "creator_reco_default",
                        status: "active",
                        exposureCap: creatorRecoExperiment?.exposure_cap_per_day || 4,
                        controlWeights:
                          (creatorRecoExperiment?.control_weights as Record<string, number>) || {
                            mutual: 25,
                            follower: 0.01,
                            video: 2,
                            recency_recent: 8,
                            recency_month: 3,
                            verified: 4,
                          },
                        variantWeights:
                          (creatorRecoExperiment?.variant_weights as Record<string, number>) || {
                            mutual: 18,
                            follower: 0.02,
                            video: 2.5,
                            recency_recent: 10,
                            recency_month: 4,
                            verified: 5,
                          },
                      });
                      toast.success("Creator recommendation experiment activated");
                    } catch (error: any) {
                      toast.error(error.message || "Could not activate experiment");
                    }
                  }}
                  disabled={upsertCreatorRecoExperiment.isPending}
                >
                  Activate variant
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await upsertCreatorRecoExperiment.mutateAsync({
                        name: creatorRecoExperiment?.name || "creator_reco_default",
                        status: "paused",
                        exposureCap: creatorRecoExperiment?.exposure_cap_per_day || 4,
                        controlWeights:
                          (creatorRecoExperiment?.control_weights as Record<string, number>) || {
                            mutual: 25,
                            follower: 0.01,
                            video: 2,
                            recency_recent: 8,
                            recency_month: 3,
                            verified: 4,
                          },
                        variantWeights:
                          (creatorRecoExperiment?.variant_weights as Record<string, number>) || {
                            mutual: 18,
                            follower: 0.02,
                            video: 2.5,
                            recency_recent: 10,
                            recency_month: 4,
                            verified: 5,
                          },
                      });
                      toast.success("Creator recommendation experiment paused");
                    } catch (error: any) {
                      toast.error(error.message || "Could not pause experiment");
                    }
                  }}
                  disabled={upsertCreatorRecoExperiment.isPending}
                >
                  Pause experiment
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant={recoWindowDays === 7 ? "default" : "outline"}
                  onClick={() => setRecoWindowDays(7)}
                >
                  7d
                </Button>
                <Button
                  size="sm"
                  variant={recoWindowDays === 30 ? "default" : "outline"}
                  onClick={() => setRecoWindowDays(30)}
                >
                  30d
                </Button>
              </div>

              {creatorRecoMetricsLoading ? (
                <Loader className="py-6" />
              ) : creatorRecoMetrics.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {creatorRecoMetrics.map((row: any) => (
                    <div key={row.variant} className="rounded-lg border border-border/70 p-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-foreground capitalize">{row.variant}</p>
                        <Badge variant="outline">{row.exposures} exposures</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <p>CTR: {Number(row.ctr_percent || 0).toFixed(2)}%</p>
                        <p>Clicks: {row.clicks || 0}</p>
                        <p>Follow CVR: {Number(row.follow_conversion_percent || 0).toFixed(2)}%</p>
                        <p>Cap-hit: {Number(row.cap_hit_rate_percent || 0).toFixed(2)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No experiment metrics yet for this window.</p>
              )}

              <div className="mt-4 rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alert threshold</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={ctrDropThresholdPercent}
                      onChange={(event) => {
                        const next = Number(event.target.value || 0);
                        setCtrDropThresholdPercent(Math.max(1, Math.min(60, next || 10)));
                      }}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-muted-foreground">% CTR drop</span>
                  </div>
                </div>

                {creatorRecoAlertsLoading ? (
                  <Loader className="py-4" />
                ) : creatorRecoAlerts ? (
                  <div
                    className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                      creatorRecoAlerts.warning_level === "critical"
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : creatorRecoAlerts.warning_level === "warning"
                          ? "border-amber-400/60 bg-amber-500/10 text-amber-700"
                          : "border-border bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <p className="font-semibold uppercase tracking-wide">{creatorRecoAlerts.warning_level}</p>
                    <p className="mt-1">{creatorRecoAlerts.message}</p>
                    <p className="mt-1">
                      Control CTR {Number(creatorRecoAlerts.control_ctr_percent || 0).toFixed(2)}% vs Variant CTR {Number(creatorRecoAlerts.variant_ctr_percent || 0).toFixed(2)}% (drop {Number(creatorRecoAlerts.ctr_drop_percent || 0).toFixed(2)}%)
                    </p>

                    {creatorRecoAlerts.warning_level === "critical" && creatorRecoExperiment?.status === "active" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="mt-3 h-7 text-[11px]"
                        disabled={upsertCreatorRecoExperiment.isPending}
                        onClick={async () => {
                          try {
                            await upsertCreatorRecoExperiment.mutateAsync({
                              name: creatorRecoExperiment?.name || "creator_reco_default",
                              status: "paused",
                              exposureCap: creatorRecoExperiment?.exposure_cap_per_day || 4,
                              controlWeights:
                                (creatorRecoExperiment?.control_weights as Record<string, number>) || {
                                  mutual: 25,
                                  follower: 0.01,
                                  video: 2,
                                  recency_recent: 8,
                                  recency_month: 3,
                                  verified: 4,
                                },
                              variantWeights:
                                (creatorRecoExperiment?.variant_weights as Record<string, number>) || {
                                  mutual: 18,
                                  follower: 0.02,
                                  video: 2.5,
                                  recency_recent: 10,
                                  recency_month: 4,
                                  verified: 5,
                                },
                            });
                            toast.success("Critical alert: experiment auto-paused");
                          } catch (error: any) {
                            toast.error(error.message || "Could not auto-pause experiment");
                          }
                        }}
                      >
                        Auto-pause variant now
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No alert signal yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message request funnel</p>
                <Badge variant="outline">{messageRequestMetrics?.window_days || recoWindowDays}d</Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <StatMini label="Total actions" value={messageRequestMetrics?.total_actions || 0} />
                <StatMini label="Accepts" value={messageRequestMetrics?.accept_actions || 0} />
                <StatMini label="Deletes" value={messageRequestMetrics?.delete_actions || 0} />
                <StatMini label="Accept rate" value={`${Number(messageRequestMetrics?.accept_rate_percent || 0).toFixed(2)}%`} />
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Unique receivers {messageRequestMetrics?.unique_receivers || 0} • unique senders {messageRequestMetrics?.unique_senders || 0}
              </p>

              {Array.isArray(messageRequestMetrics?.top_sender_breakdown) && messageRequestMetrics.top_sender_breakdown.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {(messageRequestMetrics.top_sender_breakdown as any[]).map((sender: any) => (
                    <div key={sender.sender_id} className="rounded-lg border border-border/70 px-2.5 py-2">
                      <p className="text-xs font-semibold text-foreground">
                        {sender.display_name || sender.username || sender.sender_id}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        actions {sender.actions || 0} • deletes {sender.deletes || 0}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No request action data yet in this window.</p>
              )}

              <div className="mt-4 rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delete-rate alert threshold</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      max={95}
                      value={messageRequestDeleteRateThresholdPercent}
                      onChange={(event) => {
                        const next = Number(event.target.value || 0);
                        setMessageRequestDeleteRateThresholdPercent(Math.max(10, Math.min(95, next || 70)));
                      }}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-muted-foreground">% deletes</span>
                  </div>
                </div>

                {messageRequestAlerts ? (
                  <div
                    className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                      messageRequestAlerts.warning_level === "critical"
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : messageRequestAlerts.warning_level === "warning"
                          ? "border-amber-400/60 bg-amber-500/10 text-amber-700"
                          : "border-border bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <p className="font-semibold uppercase tracking-wide">{messageRequestAlerts.warning_level}</p>
                    <p className="mt-1">{messageRequestAlerts.message}</p>
                    <p className="mt-1">
                      Delete rate {Number(messageRequestAlerts.delete_rate_percent || 0).toFixed(2)}% • threshold {Number(messageRequestAlerts.threshold_percent || messageRequestDeleteRateThresholdPercent).toFixed(2)}%
                    </p>

                    {messageRequestAlerts.warning_level === "critical" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="mt-3 h-7 text-[11px]"
                        disabled={runMessageRequestCriticalMitigation.isPending}
                        onClick={async () => {
                          try {
                            const rows = await runMessageRequestCriticalMitigation.mutateAsync({
                              windowDays: recoWindowDays,
                              deleteRateThresholdPercent: messageRequestDeleteRateThresholdPercent,
                              minActions: 20,
                              throttleHours: 24,
                              maxSenders: 5,
                            });
                            toast.success(
                              rows.length > 0
                                ? `Applied sender throttles to ${rows.length} accounts`
                                : "No sender throttles applied",
                            );
                          } catch (error: any) {
                            toast.error(error.message || "Could not apply sender throttles");
                          }
                        }}
                      >
                        {runMessageRequestCriticalMitigation.isPending ? "Applying..." : "Apply sender throttling"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No alert signal yet.</p>
                )}
              </div>

              <div className="mt-4 rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active sender throttles</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-[11px]"
                    disabled={cleanupExpiredMessageRequestSenderThrottles.isPending}
                    onClick={async () => {
                      try {
                        const releasedCount = await cleanupExpiredMessageRequestSenderThrottles.mutateAsync();
                        toast.success(`Released ${releasedCount} expired throttles`);
                      } catch (error: any) {
                        toast.error(error.message || "Could not clean up throttles");
                      }
                    }}
                  >
                    {cleanupExpiredMessageRequestSenderThrottles.isPending ? "Cleaning..." : "Cleanup expired"}
                  </Button>
                </div>

                {activeMessageRequestThrottles.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {(activeMessageRequestThrottles as any[]).map((row: any) => (
                      <div key={row.sender_id} className="rounded-lg border border-border/70 px-2.5 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {row.display_name || row.username || row.sender_id}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              deletes {row.delete_actions || 0} / actions {row.total_actions || 0}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              expires {row.expires_at ? new Date(row.expires_at).toLocaleString() : "-"}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            disabled={releaseMessageRequestSenderThrottle.isPending}
                            onClick={async () => {
                              try {
                                const released = await releaseMessageRequestSenderThrottle.mutateAsync({
                                  senderId: row.sender_id,
                                  reason: "manual_admin_release",
                                });
                                toast.success(released ? "Sender unthrottled" : "No active throttle found");
                              } catch (error: any) {
                                toast.error(error.message || "Could not unthrottle sender");
                              }
                            }}
                          >
                            Unthrottle
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No active sender throttles.</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-3">
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  downloadCsv(
                    `admin-users-${new Date().toISOString().slice(0, 10)}.csv`,
                    filteredUsers.map((profile: any) => ({
                      user_id: profile.user_id,
                      username: profile.username,
                      display_name: profile.display_name,
                      is_admin: profile.is_admin,
                      is_verified: profile.is_verified,
                      is_monetized: profile.is_monetized,
                      professional_account: profile.professional_account,
                      created_at: profile.created_at,
                    })),
                  );
                }}
              >
                Export Users CSV
              </Button>
            </div>

            <Input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Search by username, name, or user id"
            />

            {usersLoading ? (
              <Loader className="py-10" />
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((profile: any) => (
                  <div key={profile.user_id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{profile.display_name || "User"}</p>
                        <p className="truncate text-xs text-muted-foreground">@{profile.username || "user"}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {profile.is_admin && <Badge variant="secondary">Admin</Badge>}
                        {profile.is_verified && <Badge>Verified</Badge>}
                        {profile.is_monetized && <Badge variant="outline">Monetized</Badge>}
                      </div>
                    </div>

                    <Separator className="my-3" />

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant={profile.is_verified ? "secondary" : "default"}
                        onClick={async () => {
                          try {
                            await updateProfileStatus.mutateAsync({
                              targetUserId: profile.user_id,
                              isVerified: !profile.is_verified,
                              isMonetized: !!profile.is_monetized,
                            });
                            toast.success(profile.is_verified ? "Verification removed" : "User verified");
                          } catch (error: any) {
                            toast.error(error.message || "Could not update verification");
                          }
                        }}
                      >
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        {profile.is_verified ? "Unverify" : "Verify"}
                      </Button>

                      <Button
                        size="sm"
                        variant={profile.is_monetized ? "secondary" : "default"}
                        onClick={async () => {
                          try {
                            await updateProfileStatus.mutateAsync({
                              targetUserId: profile.user_id,
                              isVerified: !!profile.is_verified,
                              isMonetized: !profile.is_monetized,
                            });
                            toast.success(profile.is_monetized ? "Monetization disabled" : "Monetization enabled");
                          } catch (error: any) {
                            toast.error(error.message || "Could not update monetization");
                          }
                        }}
                      >
                        <Wallet className="mr-1 h-3.5 w-3.5" />
                        {profile.is_monetized ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">No users found.</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports" className="space-y-3">
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  downloadCsv(
                    `admin-reports-${new Date().toISOString().slice(0, 10)}.csv`,
                    filteredReports.map((report: any) => ({
                      id: report.id,
                      status: report.status,
                      reason: report.reason,
                      details: report.details,
                      reporter_username: report.reporter_profile?.username || "",
                      owner_username: report.owner_profile?.username || "",
                      video_id: report.video_id,
                      created_at: report.created_at,
                    })),
                  );
                }}
              >
                Export Reports CSV
              </Button>
            </div>

            <Input
              value={reportSearch}
              onChange={(event) => setReportSearch(event.target.value)}
              placeholder="Search by reason, status, or username"
            />

            {reportsLoading ? (
              <Loader className="py-10" />
            ) : (
              <div className="space-y-2">
                {filteredReports.map((report: any) => (
                  <div key={report.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{report.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          Reporter @{report.reporter_profile?.username || "user"} • Owner @{report.owner_profile?.username || "user"}
                        </p>
                      </div>
                      <Badge variant={report.status === "open" ? "destructive" : "secondary"}>{report.status}</Badge>
                    </div>

                    {report.details && <p className="mt-2 text-xs text-muted-foreground">{report.details}</p>}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await updateReportStatus.mutateAsync({ reportId: report.id, status: "reviewing" });
                            toast.success("Report moved to reviewing");
                          } catch (error: any) {
                            toast.error(error.message || "Could not update report");
                          }
                        }}
                      >
                        Mark Reviewing
                      </Button>

                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await updateReportStatus.mutateAsync({ reportId: report.id, status: "resolved" });
                            toast.success("Report resolved");
                          } catch (error: any) {
                            toast.error(error.message || "Could not resolve report");
                          }
                        }}
                      >
                        Resolve
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        className="col-span-2"
                        onClick={async () => {
                          if (!report.video?.id) {
                            toast.error("Video not found");
                            return;
                          }

                          try {
                            await deleteVideo.mutateAsync({ videoId: report.video.id });
                            await updateReportStatus.mutateAsync({ reportId: report.id, status: "resolved" });
                            toast.success("Video removed and report resolved");
                          } catch (error: any) {
                            toast.error(error.message || "Could not remove video");
                          }
                        }}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Remove Video
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredReports.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">No reports found.</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="monetization" className="space-y-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold text-foreground">Monetization Controls</p>
              <p className="mt-1 text-xs text-muted-foreground">Use the Users tab to enable monetization and verification per creator after manual review, matching platform moderation and trust workflows.</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold text-foreground">Review checklist</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>- Identity signals and profile completion</li>
                <li>- Policy-safe content history</li>
                <li>- Engagement quality and consistency</li>
                <li>- Regional compliance before payout enablement</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-3">
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  downloadCsv(
                    `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`,
                    filteredAuditLogs.map((log: any) => ({
                      id: log.id,
                      action: log.action,
                      actor_username: log.actor_profile?.username || "",
                      target_username: log.target_profile?.username || "",
                      target_user_id: log.target_user_id || "",
                      target_video_id: log.target_video_id || "",
                      target_report_id: log.target_report_id || "",
                      metadata: JSON.stringify(log.metadata || {}),
                      created_at: log.created_at,
                    })),
                  );
                }}
              >
                Export Audit CSV
              </Button>
            </div>

            <Input
              value={auditSearch}
              onChange={(event) => setAuditSearch(event.target.value)}
              placeholder="Search by action, actor, target, entity IDs"
            />

            {auditLogsLoading ? (
              <Loader className="py-10" />
            ) : (
              <div className="space-y-2">
                {filteredAuditLogs.map((log: any) => (
                  <div key={log.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{log.action}</p>
                        <p className="text-xs text-muted-foreground">
                          by @{log.actor_profile?.username || "admin"}
                          {log.target_profile?.username ? ` → @${log.target_profile.username}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline">{new Date(log.created_at).toLocaleString()}</Badge>
                    </div>

                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {log.target_video_id && <p>Video: {log.target_video_id}</p>}
                      {log.target_report_id && <p>Report: {log.target_report_id}</p>}
                      {!!Object.keys(log.metadata || {}).length && (
                        <p className="mt-1 break-all">Meta: {JSON.stringify(log.metadata)}</p>
                      )}
                    </div>
                  </div>
                ))}
                {filteredAuditLogs.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">No audit logs found.</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border/70 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Loader({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default AdminPortal;
