// Shared interest taxonomy + lightweight keyword-based suggester.
// Used by Create flow (auto-suggest from caption/hashtags) and by the
// Reels feed for personalization fallback when AI suggestion is unavailable.

export const INTEREST_CATEGORIES = [
  "comedy",
  "music",
  "dance",
  "sports",
  "fitness",
  "food",
  "travel",
  "fashion",
  "beauty",
  "tech",
  "gaming",
  "education",
  "news",
  "art",
  "diy",
  "pets",
  "nature",
  "lifestyle",
  "motivation",
  "vlog",
] as const;

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number];

export const INTEREST_LABELS: Record<InterestCategory, string> = {
  comedy: "Comedy",
  music: "Music",
  dance: "Dance",
  sports: "Sports",
  fitness: "Fitness",
  food: "Food",
  travel: "Travel",
  fashion: "Fashion",
  beauty: "Beauty",
  tech: "Tech",
  gaming: "Gaming",
  education: "Education",
  news: "News",
  art: "Art",
  diy: "DIY",
  pets: "Pets",
  nature: "Nature",
  lifestyle: "Lifestyle",
  motivation: "Motivation",
  vlog: "Vlog",
};

const KEYWORDS: Record<InterestCategory, string[]> = {
  comedy: ["funny", "comedy", "lol", "haha", "joke", "meme", "prank", "skit"],
  music: ["music", "song", "beat", "remix", "lyrics", "guitar", "piano", "singer", "cover"],
  dance: ["dance", "dancing", "choreo", "choreography", "tiktokdance", "ballet"],
  sports: ["sport", "football", "soccer", "basketball", "cricket", "tennis", "match", "goal"],
  fitness: ["gym", "fitness", "workout", "abs", "cardio", "yoga", "training", "lift"],
  food: ["food", "recipe", "cooking", "chef", "tasty", "baking", "kitchen", "meal"],
  travel: ["travel", "trip", "vacation", "explore", "wanderlust", "city", "beach", "mountain"],
  fashion: ["fashion", "outfit", "ootd", "style", "thrift", "designer"],
  beauty: ["makeup", "beauty", "skincare", "hair", "tutorial", "glam"],
  tech: ["tech", "gadget", "phone", "ai", "coding", "developer", "review", "app"],
  gaming: ["game", "gaming", "gamer", "fps", "esports", "stream", "minecraft", "fortnite"],
  education: ["learn", "study", "education", "tip", "tutorial", "explained", "fact"],
  news: ["news", "breaking", "update", "report", "headline"],
  art: ["art", "drawing", "painting", "sketch", "artist", "design"],
  diy: ["diy", "craft", "handmade", "build", "lifehack", "hack"],
  pets: ["dog", "cat", "puppy", "kitten", "pet", "animal"],
  nature: ["nature", "wildlife", "forest", "ocean", "sunset", "landscape"],
  lifestyle: ["lifestyle", "vlog", "morning", "routine", "aesthetic", "diary"],
  motivation: ["motivation", "mindset", "inspire", "quote", "success", "hustle"],
  vlog: ["vlog", "daytrip", "behindthescenes", "bts"],
};

/**
 * Local heuristic suggestion based on caption/hashtags.
 * Returns up to 3 ranked categories. Used as instant fallback while AI loads.
 */
export function suggestInterestsLocally(text: string): InterestCategory[] {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return [];

  const scores: Array<{ cat: InterestCategory; score: number }> = [];
  for (const cat of INTEREST_CATEGORIES) {
    let score = 0;
    for (const kw of KEYWORDS[cat]) {
      if (lower.includes(kw)) score += 1;
      if (lower.includes(`#${kw}`)) score += 1;
    }
    if (score > 0) scores.push({ cat, score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 3).map((s) => s.cat);
}

export function isInterestCategory(value: unknown): value is InterestCategory {
  return typeof value === "string" && (INTEREST_CATEGORIES as readonly string[]).includes(value);
}
