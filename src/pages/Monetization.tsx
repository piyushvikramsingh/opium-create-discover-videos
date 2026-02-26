import { useMemo, useState } from "react";
import { Banknote, Crown, DollarSign, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateSubscription, useCreateSubscriptionTier, useEarnings, useSendTip, useSubscriptionTiers, useSubscriptions, useTips } from "@/hooks/useMonetization";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Monetization = () => {
  const { data: tiers = [] } = useSubscriptionTiers();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: tips = [] } = useTips();
  const { data: earnings = [] } = useEarnings();
  const { data: profiles = [] } = useQuery({
    queryKey: ["monetized-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, user_id, username, is_monetized")
        .eq("is_monetized", true)
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const createTier = useCreateSubscriptionTier();
  const createSubscription = useCreateSubscription();
  const sendTip = useSendTip();

  const [tierName, setTierName] = useState("VIP");
  const [tierPrice, setTierPrice] = useState("499");
  const [tierBenefits, setTierBenefits] = useState("Exclusive posts,Priority replies");

  const [tipUserId, setTipUserId] = useState("");
  const [tipAmount, setTipAmount] = useState("100");

  const monetizedProfiles = useMemo(
    () => profiles.filter((profile: any) => profile.is_monetized),
    [profiles],
  );

  const totalEarningsCents = useMemo(
    () => earnings.reduce((sum: number, entry: any) => sum + (entry.amount_cents ?? 0), 0),
    [earnings],
  );

  return (
    <div className="min-h-screen bg-background p-4 pb-20 pt-safe fade-in">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Monetization</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage tiers, subscriptions, tips, and earnings.</p>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Earnings Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${(totalEarningsCents / 100).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">From {earnings.length} earning entries</p>
          </CardContent>
        </Card>

        <Tabs defaultValue="tiers" className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="tiers">Tiers</TabsTrigger>
            <TabsTrigger value="subs">Subscriptions</TabsTrigger>
            <TabsTrigger value="tips">Tips</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
          </TabsList>

          <TabsContent value="tiers" className="space-y-4 mt-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Create Tier</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <Input value={tierName} onChange={(event) => setTierName(event.target.value)} placeholder="Tier name" />
                <Input value={tierPrice} onChange={(event) => setTierPrice(event.target.value)} placeholder="Price (cents)" />
                <Input value={tierBenefits} onChange={(event) => setTierBenefits(event.target.value)} placeholder="Benefits comma-separated" />
                <div className="md:col-span-3">
                  <Button
                    onClick={() => {
                      const price = Number(tierPrice);
                      if (!tierName.trim() || Number.isNaN(price) || price < 0) return;
                      createTier.mutate({
                        name: tierName.trim(),
                        price_cents: price,
                        benefits: tierBenefits.split(",").map((value) => value.trim()).filter(Boolean),
                      });
                    }}
                    disabled={createTier.isPending}
                  >
                    Create Tier
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {tiers.map((tier: any) => (
                <Card key={tier.id} className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-yellow-500" /> {tier.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-lg font-semibold">${(tier.price_cents / 100).toFixed(2)}/mo</p>
                    <ul className="text-sm text-muted-foreground list-disc pl-4">
                      {(tier.benefits ?? []).map((benefit: string) => (
                        <li key={`${tier.id}-${benefit}`}>{benefit}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="subs" className="space-y-4 mt-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Subscribe to Creator</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                  {monetizedProfiles.slice(0, 6).map((profile: any) => (
                    <Button
                      key={profile.id}
                      variant="outline"
                      className="justify-between"
                      onClick={() =>
                        createSubscription.mutate({
                          creator_id: profile.user_id,
                          tier: "default",
                          price_cents: 499,
                        })
                      }
                      disabled={createSubscription.isPending}
                    >
                      <span>@{profile.username}</span>
                      <span className="text-xs text-muted-foreground">$4.99</span>
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">Active subscriptions: {subscriptions.length}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tips" className="space-y-4 mt-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Send Tip</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <Input value={tipUserId} onChange={(event) => setTipUserId(event.target.value)} placeholder="Creator user_id" />
                <Input value={tipAmount} onChange={(event) => setTipAmount(event.target.value)} placeholder="Amount cents" />
                <Button
                  onClick={() => {
                    const amount = Number(tipAmount);
                    if (!tipUserId.trim() || Number.isNaN(amount) || amount <= 0) return;
                    sendTip.mutate({ to_user_id: tipUserId.trim(), amount_cents: amount });
                    setTipAmount("100");
                  }}
                  disabled={sendTip.isPending}
                >
                  Send
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {tips.slice(0, 12).map((tip: any) => (
                <Card key={tip.id} className="rounded-2xl">
                  <CardContent className="py-3 text-sm text-muted-foreground">
                    {tip.from_user_id} → {tip.to_user_id} · ${(tip.amount_cents / 100).toFixed(2)}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="earnings" className="space-y-2 mt-4">
            {earnings.slice(0, 20).map((entry: any) => (
              <Card key={entry.id} className="rounded-2xl">
                <CardContent className="flex items-center justify-between py-3 text-sm">
                  <span className="text-muted-foreground">{entry.source}</span>
                  <span className="font-semibold flex items-center gap-1"><Banknote className="h-4 w-4" /> ${(entry.amount_cents / 100).toFixed(2)}</span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Monetization;
