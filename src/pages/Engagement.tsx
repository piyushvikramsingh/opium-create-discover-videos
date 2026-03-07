import { useMemo, useState } from "react";
import { BarChart3, Flag, Plus, Sparkles, Target, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChallenges, useCreateChallenge, useCreatePoll, useJoinChallenge, usePolls, useVotePoll } from "@/hooks/useEngagement";
import { useEngagementLoop } from "@/hooks/useEngagementLoop";

type PollItem = {
  id: string;
  question: string;
  options: string[];
  total_votes?: number;
};

type ChallengeItem = {
  id: string;
  title: string;
  hashtag: string;
  participant_count?: number;
  end_date?: string | null;
};

const Engagement = () => {
  const { data: pollsData = [] } = usePolls();
  const { data: challengesData = [] } = useChallenges();
  const createPoll = useCreatePoll();
  const votePoll = useVotePoll();
  const createChallenge = useCreateChallenge();
  const joinChallenge = useJoinChallenge();
  const { state: engagementState, missions, badges, nextBadge, syncStatus } = useEngagementLoop();
  const polls = pollsData as PollItem[];
  const challenges = challengesData as ChallengeItem[];

  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionsText, setPollOptionsText] = useState("Yes,No");

  const [challengeTitle, setChallengeTitle] = useState("");
  const [challengeHashtag, setChallengeHashtag] = useState("mychallenge");

  const activeChallenges = useMemo(
    () => challenges.filter((challenge) => !challenge.end_date || new Date(challenge.end_date) > new Date()),
    [challenges],
  );

  return (
    <div className="ig-screen-spring ig-modern-page min-h-screen bg-background p-4 pb-20 pt-safe fade-in">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="ig-type-h1 text-foreground">Engagement</h1>
          <p className="ig-type-sub mt-1">Polls and challenges to boost interactions.</p>
          <div className="ig-modern-chip mt-2 inline-flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${
              syncStatus === "synced"
                ? "bg-primary"
                : syncStatus === "syncing"
                  ? "bg-yellow-500"
                  : syncStatus === "error"
                    ? "bg-destructive"
                    : "bg-muted-foreground"
            }`} />
            {syncStatus === "synced" && "Cloud sync active"}
            {syncStatus === "syncing" && "Syncing engagement profile..."}
            {syncStatus === "error" && "Cloud sync issue (using local cache)"}
            {syncStatus === "local" && "Local-only mode"}
          </div>
        </div>

        <Tabs defaultValue="polls" className="w-full">
          <TabsList className="flex w-full max-w-md gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0">
            <TabsTrigger className="ig-tab-trigger shrink-0" value="polls">Polls</TabsTrigger>
            <TabsTrigger className="ig-tab-trigger shrink-0" value="challenges">Challenges</TabsTrigger>
          </TabsList>

          <TabsContent value="polls" className="space-y-4 mt-4">
            <Card className="ig-modern-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Plus className="h-4 w-4" /> Create Poll</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input className="ig-control-md" value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ask your audience a question" />
                <Input className="ig-control-md" value={pollOptionsText} onChange={(event) => setPollOptionsText(event.target.value)} placeholder="Comma-separated options" />
                <Button
                  className="ig-control-md"
                  onClick={() => {
                    const options = pollOptionsText
                      .split(",")
                      .map((option) => option.trim())
                      .filter(Boolean);
                    if (!pollQuestion.trim() || options.length < 2) return;
                    createPoll.mutate({ question: pollQuestion.trim(), options });
                    setPollQuestion("");
                    setPollOptionsText("Yes,No");
                  }}
                  disabled={createPoll.isPending}
                >
                  Create Poll
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {polls.map((poll) => (
                <Card key={poll.id} className="ig-modern-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Vote className="h-4 w-4" /> {poll.question}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {poll.options.map((option: string, index: number) => (
                      <Button
                        key={`${poll.id}-${option}`}
                        variant="outline"
                        className="ig-control-md w-full justify-between"
                        onClick={() => votePoll.mutate({ pollId: poll.id, optionIndex: index })}
                        disabled={votePoll.isPending}
                      >
                        <span>{option}</span>
                        <span className="text-xs text-muted-foreground">Vote</span>
                      </Button>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">Total votes: {poll.total_votes ?? 0}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="challenges" className="space-y-4 mt-4">
            <Card className="ig-modern-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Flag className="h-4 w-4" /> Create Challenge</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input className="ig-control-md" value={challengeTitle} onChange={(event) => setChallengeTitle(event.target.value)} placeholder="Challenge title" />
                <Input className="ig-control-md" value={challengeHashtag} onChange={(event) => setChallengeHashtag(event.target.value.replace(/#/g, ""))} placeholder="Hashtag" />
                <Button
                  className="ig-control-md"
                  onClick={() => {
                    if (!challengeTitle.trim() || !challengeHashtag.trim()) return;
                    createChallenge.mutate({
                      title: challengeTitle.trim(),
                      hashtag: challengeHashtag.trim().toLowerCase(),
                    });
                    setChallengeTitle("");
                  }}
                  disabled={createChallenge.isPending}
                >
                  Create Challenge
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {activeChallenges.map((challenge) => (
                <Card key={challenge.id} className="ig-modern-card">
                  <CardHeader>
                    <CardTitle className="text-base">{challenge.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">#{challenge.hashtag}</p>
                    <p className="text-sm text-muted-foreground">Participants: {challenge.participant_count ?? 0}</p>
                    <Button className="ig-control-md" onClick={() => joinChallenge.mutate({ challengeId: challenge.id })} disabled={joinChallenge.isPending}>
                      Join Challenge
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <Card className="ig-modern-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Quick Insight</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Active polls: {polls.length} · Active challenges: {activeChallenges.length}
            </p>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Engagement score</p>
                <p className="text-lg font-semibold">{engagementState.totalScore}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Current streak</p>
                <p className="text-lg font-semibold">{engagementState.streakDays} days</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Fatigue level</p>
                <p className="text-lg font-semibold">{engagementState.fatigueScore}%</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4" /> Daily Missions
              </div>
              {missions.map((mission) => {
                const percent = Math.min(100, Math.round((mission.progress / mission.target) * 100));
                return (
                  <div key={mission.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span>{mission.title}</span>
                      <span className="text-muted-foreground">{mission.progress}/{mission.target}</span>
                    </div>
                    <Progress value={percent} className="h-2" />
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" /> Badge Milestones
              </div>
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => {
                  const unlocked = engagementState.unlockedBadges.includes(badge.id);
                  return (
                    <Badge key={badge.id} variant={unlocked ? "default" : "secondary"}>
                      {badge.title}
                    </Badge>
                  );
                })}
              </div>
              {nextBadge && (
                <p className="text-xs text-muted-foreground">
                  Next badge: {nextBadge.title} at score {nextBadge.threshold}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Engagement;
