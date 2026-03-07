type DiversityVideo = {
  id: string;
  user_id: string;
  description?: string | null;
  video_url?: string | null;
  _score?: number;
};

type RankedVideo<T> = T & {
  _score: number;
  _diversityAdjustment: number;
  _finalScore: number;
};

const getTopicTokens = (description: string | null | undefined) => {
  if (!description) return [];
  const hashtags = (description.toLowerCase().match(/#[\w]+/g) || []).map((value) => value.slice(1));
  return Array.from(new Set(hashtags)).slice(0, 4);
};

const getMediaKind = (video: DiversityVideo) => (video.video_url ? "video" : "photo");

export const diversifyFeedRanking = <T extends DiversityVideo>(videos: T[], options?: { candidateWindow?: number }) => {
  if (videos.length <= 2) {
    return videos.map((video, index) => ({
      ...video,
      _score: Number.isFinite(video._score) ? Number(video._score) : videos.length - index,
      _diversityAdjustment: 0,
      _finalScore: Number.isFinite(video._score) ? Number(video._score) : videos.length - index,
    })) as RankedVideo<T>[];
  }

  const candidateWindow = Math.max(6, options?.candidateWindow ?? 18);

  const remaining = videos.map((video, index) => ({
    ...video,
    _score: Number.isFinite(video._score) ? Number(video._score) : videos.length - index,
  })) as Array<T & { _score: number }>;

  const ranked: RankedVideo<T>[] = [];
  const recentCreators: string[] = [];
  const recentMediaKinds: Array<"video" | "photo"> = [];
  const topicMomentum = new Map<string, number>();

  while (remaining.length > 0) {
    const pool = remaining.slice(0, Math.min(candidateWindow, remaining.length));

    let bestIndex = 0;
    let bestFinalScore = Number.NEGATIVE_INFINITY;
    let bestAdjustment = 0;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const baseScore = candidate._score;

      const creatorPenalty = recentCreators.includes(candidate.user_id)
        ? recentCreators[recentCreators.length - 1] === candidate.user_id
          ? 40
          : 22
        : 0;

      const topics = getTopicTokens(candidate.description);
      const topicPenalty = topics.reduce((sum, topic) => sum + (topicMomentum.get(topic) || 0) * 4.5, 0);

      const mediaKind = getMediaKind(candidate);
      const lastMedia = recentMediaKinds[recentMediaKinds.length - 1];
      const sameMediaRun = recentMediaKinds.length >= 3 && recentMediaKinds.slice(-3).every((value) => value === lastMedia);
      const mediaPenalty = sameMediaRun && mediaKind === lastMedia ? 10 : 0;

      const creatorNoveltyBoost = recentCreators.includes(candidate.user_id) ? 0 : 6;
      const topicNoveltyBoost = topics.some((topic) => (topicMomentum.get(topic) || 0) === 0) ? 3 : 0;

      const diversityAdjustment = creatorNoveltyBoost + topicNoveltyBoost - creatorPenalty - topicPenalty - mediaPenalty;
      const finalScore = baseScore + diversityAdjustment;

      if (finalScore > bestFinalScore) {
        bestFinalScore = finalScore;
        bestIndex = index;
        bestAdjustment = diversityAdjustment;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    const topics = getTopicTokens(picked.description);

    recentCreators.push(picked.user_id);
    if (recentCreators.length > 6) recentCreators.shift();

    recentMediaKinds.push(getMediaKind(picked));
    if (recentMediaKinds.length > 4) recentMediaKinds.shift();

    topicMomentum.forEach((value, key) => {
      const decayed = value * 0.72;
      if (decayed < 0.1) {
        topicMomentum.delete(key);
      } else {
        topicMomentum.set(key, decayed);
      }
    });

    topics.forEach((topic) => {
      topicMomentum.set(topic, Math.min(3, (topicMomentum.get(topic) || 0) + 1));
    });

    ranked.push({
      ...picked,
      _diversityAdjustment: bestAdjustment,
      _finalScore: bestFinalScore,
    } as RankedVideo<T>);
  }

  return ranked;
};
