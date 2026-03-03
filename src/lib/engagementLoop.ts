export type EngagementActionType =
  | "like"
  | "share"
  | "bookmark"
  | "follow"
  | "comment_open"
  | "view_3s"
  | "view_complete"
  | "skip";

export type EngagementBadgeId = "spark_starter" | "momentum_builder" | "social_catalyst";

export type EngagementMissionId = "daily_likes" | "daily_shares" | "daily_saves" | "daily_completions";

export type EngagementMission = {
  id: EngagementMissionId;
  title: string;
  target: number;
  actionType: EngagementActionType;
};

export type EngagementMissionProgress = EngagementMission & {
  progress: number;
  completed: boolean;
};

export type EngagementBadge = {
  id: EngagementBadgeId;
  title: string;
  threshold: number;
};

export type EngagementLoopState = {
  schemaVersion: 1;
  totalScore: number;
  lastActiveDay: string;
  streakDays: number;
  fatigueScore: number;
  actionsToday: Partial<Record<EngagementActionType, number>>;
  actionsTotal: Partial<Record<EngagementActionType, number>>;
  unlockedBadges: EngagementBadgeId[];
  completedMissionsToday: EngagementMissionId[];
  rewardToastCountToday: number;
  lastRewardToastAt: number;
  topicAffinity: Record<string, number>;
  creatorAffinity: Record<string, number>;
  lastUpdatedAt: number;
};

export type EngagementActionContext = {
  topic?: string | null;
  creatorId?: string | null;
};

export type EngagementReward = {
  kind: "mission" | "badge" | "streak" | "milestone";
  title: string;
  description: string;
};

export type EngagementRecordResult = {
  state: EngagementLoopState;
  deltaScore: number;
  score: number;
  rewards: EngagementReward[];
  canNotify: boolean;
};

const STORAGE_KEY = "opium.engagement.loop.v1";

const ACTION_WEIGHTS: Record<EngagementActionType, number> = {
  like: 2,
  share: 6,
  bookmark: 4,
  follow: 5,
  comment_open: 2,
  view_3s: 1,
  view_complete: 5,
  skip: -2,
};

const MISSIONS: EngagementMission[] = [
  { id: "daily_likes", title: "Give 3 likes", target: 3, actionType: "like" },
  { id: "daily_shares", title: "Share 1 video", target: 1, actionType: "share" },
  { id: "daily_saves", title: "Save 2 videos", target: 2, actionType: "bookmark" },
  { id: "daily_completions", title: "Finish 3 videos", target: 3, actionType: "view_complete" },
];

const BADGES: EngagementBadge[] = [
  { id: "spark_starter", title: "Spark Starter", threshold: 25 },
  { id: "momentum_builder", title: "Momentum Builder", threshold: 100 },
  { id: "social_catalyst", title: "Social Catalyst", threshold: 240 },
];

const getDayKey = (date = new Date()) => {
  return date.toISOString().slice(0, 10);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const coerceEngagementLoopState = (
  state: Partial<EngagementLoopState> | null | undefined,
): EngagementLoopState => {
  const dayKey = getDayKey();

  if (!state || state.schemaVersion !== 1) {
    return {
      schemaVersion: 1,
      totalScore: 0,
      lastActiveDay: dayKey,
      streakDays: 0,
      fatigueScore: 0,
      actionsToday: {},
      actionsTotal: {},
      unlockedBadges: [],
      completedMissionsToday: [],
      rewardToastCountToday: 0,
      lastRewardToastAt: 0,
      topicAffinity: {},
      creatorAffinity: {},
      lastUpdatedAt: Date.now(),
    };
  }

  return {
    schemaVersion: 1,
    totalScore: Number.isFinite(state.totalScore) ? Math.max(0, Number(state.totalScore)) : 0,
    lastActiveDay: state.lastActiveDay || dayKey,
    streakDays: Number.isFinite(state.streakDays) ? Math.max(0, Number(state.streakDays)) : 0,
    fatigueScore: Number.isFinite(state.fatigueScore) ? clamp(Number(state.fatigueScore), 0, 100) : 0,
    actionsToday: state.actionsToday || {},
    actionsTotal: state.actionsTotal || {},
    unlockedBadges: Array.isArray(state.unlockedBadges) ? state.unlockedBadges : [],
    completedMissionsToday: Array.isArray(state.completedMissionsToday) ? state.completedMissionsToday : [],
    rewardToastCountToday: Number.isFinite(state.rewardToastCountToday)
      ? Math.max(0, Number(state.rewardToastCountToday))
      : 0,
    lastRewardToastAt: Number.isFinite(state.lastRewardToastAt) ? Number(state.lastRewardToastAt) : 0,
    topicAffinity: state.topicAffinity || {},
    creatorAffinity: state.creatorAffinity || {},
    lastUpdatedAt: Number.isFinite(state.lastUpdatedAt) ? Number(state.lastUpdatedAt) : Date.now(),
  };
};

export const getInitialEngagementState = () => coerceEngagementLoopState(undefined);

export const loadEngagementLoopState = (): EngagementLoopState => {
  if (typeof window === "undefined") {
    return getInitialEngagementState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialEngagementState();
    return coerceEngagementLoopState(JSON.parse(raw));
  } catch {
    return getInitialEngagementState();
  }
};

export const saveEngagementLoopState = (state: EngagementLoopState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const withDayBoundary = (state: EngagementLoopState, now: Date) => {
  const today = getDayKey(now);
  if (state.lastActiveDay === today) return state;

  const previousDate = new Date(`${state.lastActiveDay}T00:00:00Z`);
  const currentDate = new Date(`${today}T00:00:00Z`);
  const diffDays = Math.round((currentDate.getTime() - previousDate.getTime()) / 86_400_000);

  const hadMeaningfulActivityYesterday =
    (state.actionsToday.like || 0) +
      (state.actionsToday.share || 0) +
      (state.actionsToday.bookmark || 0) +
      (state.actionsToday.view_complete || 0) >
    0;

  const nextStreak = diffDays === 1 && hadMeaningfulActivityYesterday ? state.streakDays + 1 : 1;

  return {
    ...state,
    lastActiveDay: today,
    streakDays: nextStreak,
    actionsToday: {},
    completedMissionsToday: [],
    rewardToastCountToday: 0,
  };
};

export const getMissionProgress = (state: EngagementLoopState): EngagementMissionProgress[] => {
  return MISSIONS.map((mission) => {
    const progress = state.actionsToday[mission.actionType] || 0;
    return {
      ...mission,
      progress,
      completed: progress >= mission.target,
    };
  });
};

const getMilestoneReward = (score: number): EngagementReward | null => {
  const milestones = [20, 50, 100, 180, 280];
  const hit = milestones.find((milestone) => score >= milestone && score - 8 < milestone);
  if (!hit) return null;
  return {
    kind: "milestone",
    title: `+${hit} energy reached`,
    description: "Your feed now favors creators you actively engage with.",
  };
};

const getCanNotify = (state: EngagementLoopState, nowMs: number) => {
  const minGapMs = 90_000;
  const maxToastPerDay = 6;

  if (state.fatigueScore >= 70) return false;
  if (state.rewardToastCountToday >= maxToastPerDay) return false;
  if (nowMs - state.lastRewardToastAt < minGapMs) return false;

  return true;
};

const reduceFatigue = (current: number, actionType: EngagementActionType) => {
  if (["like", "share", "bookmark", "follow", "view_complete"].includes(actionType)) {
    return clamp(current - 4, 0, 100);
  }

  if (actionType === "skip") {
    return clamp(current + 8, 0, 100);
  }

  return clamp(current + 1, 0, 100);
};

export const recordEngagementAction = (
  actionType: EngagementActionType,
  options?: { now?: Date; context?: EngagementActionContext },
): EngagementRecordResult => {
  const now = options?.now || new Date();
  const nowMs = now.getTime();

  const baseState = withDayBoundary(loadEngagementLoopState(), now);

  const deltaScore = ACTION_WEIGHTS[actionType] || 0;
  const nextScore = Math.max(0, baseState.totalScore + deltaScore);

  const actionsToday = {
    ...baseState.actionsToday,
    [actionType]: (baseState.actionsToday[actionType] || 0) + 1,
  };

  const actionsTotal = {
    ...baseState.actionsTotal,
    [actionType]: (baseState.actionsTotal[actionType] || 0) + 1,
  };

  const topicKey = String(options?.context?.topic || "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "");
  const creatorKey = String(options?.context?.creatorId || "").trim();

  const affinityDelta = deltaScore > 0 ? deltaScore : deltaScore * 0.45;
  const topicAffinity = { ...baseState.topicAffinity };
  const creatorAffinity = { ...baseState.creatorAffinity };

  if (topicKey) {
    topicAffinity[topicKey] = clamp((topicAffinity[topicKey] || 0) + affinityDelta, -30, 200);
  }

  if (creatorKey) {
    creatorAffinity[creatorKey] = clamp((creatorAffinity[creatorKey] || 0) + affinityDelta, -30, 240);
  }

  let nextState: EngagementLoopState = {
    ...baseState,
    totalScore: nextScore,
    actionsToday,
    actionsTotal,
    fatigueScore: reduceFatigue(baseState.fatigueScore, actionType),
    topicAffinity,
    creatorAffinity,
    lastUpdatedAt: nowMs,
  };

  const rewards: EngagementReward[] = [];

  const missionProgress = getMissionProgress(nextState);
  for (const mission of missionProgress) {
    if (!mission.completed) continue;
    if (nextState.completedMissionsToday.includes(mission.id)) continue;

    nextState = {
      ...nextState,
      completedMissionsToday: [...nextState.completedMissionsToday, mission.id],
    };
    rewards.push({
      kind: "mission",
      title: "Mission complete",
      description: mission.title,
    });
  }

  for (const badge of BADGES) {
    if (nextState.totalScore < badge.threshold) continue;
    if (nextState.unlockedBadges.includes(badge.id)) continue;

    nextState = {
      ...nextState,
      unlockedBadges: [...nextState.unlockedBadges, badge.id],
    };
    rewards.push({
      kind: "badge",
      title: "Badge unlocked",
      description: badge.title,
    });
  }

  if ([3, 7, 14].includes(nextState.streakDays)) {
    rewards.push({
      kind: "streak",
      title: `${nextState.streakDays}-day streak`,
      description: "You’re building strong discovery momentum.",
    });
  }

  const milestone = getMilestoneReward(nextState.totalScore);
  if (milestone) {
    rewards.push(milestone);
  }

  const canNotify = getCanNotify(nextState, nowMs) && rewards.length > 0;
  if (canNotify) {
    nextState = {
      ...nextState,
      rewardToastCountToday: nextState.rewardToastCountToday + 1,
      lastRewardToastAt: nowMs,
    };
  }

  saveEngagementLoopState(nextState);

  return {
    state: nextState,
    deltaScore,
    score: nextState.totalScore,
    rewards,
    canNotify,
  };
};

export const getEngagementSummary = () => {
  const state = loadEngagementLoopState();
  const missions = getMissionProgress(state);
  const nextBadge = BADGES.find((badge) => !state.unlockedBadges.includes(badge.id)) || null;

  return {
    state,
    missions,
    badges: BADGES,
    nextBadge,
  };
};

const getVideoTopicKey = (video: any) => {
  const description = String(video?.description || "");
  const hashMatch = description.match(/#([a-zA-Z0-9_]+)/);
  if (hashMatch?.[1]) return hashMatch[1].toLowerCase();

  const music = String(video?.music || "").trim().toLowerCase();
  if (!music) return "";
  return music.split(/[\s|,-]/).filter(Boolean)[0] || "";
};

export const getEngagementPersonalizationBoost = (
  video: any,
  state: EngagementLoopState,
  options?: { baseScore?: number },
) => {
  const topicKey = getVideoTopicKey(video);
  const creatorId = String(video?.user_id || "");
  const topicBoostRaw = topicKey ? state.topicAffinity[topicKey] || 0 : 0;
  const creatorBoostRaw = creatorId ? state.creatorAffinity[creatorId] || 0 : 0;

  const topicBoost = topicBoostRaw * 0.9;
  const creatorBoost = creatorBoostRaw * 1.1;
  const fatiguePenalty = state.fatigueScore >= 70 ? 4 : 0;
  const sessionEnergyBoost = Math.min(10, state.totalScore / 40);

  const score = (options?.baseScore || 0) + topicBoost + creatorBoost + sessionEnergyBoost - fatiguePenalty;
  return {
    score,
    components: {
      topicBoost,
      creatorBoost,
      fatiguePenalty,
      sessionEnergyBoost,
    },
  };
};
