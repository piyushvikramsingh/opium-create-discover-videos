import { ArrowLeft, ExternalLink, FileText, HelpCircle, LifeBuoy, MessageSquareWarning, ShieldAlert, Smartphone } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const sectionTitles: Record<string, string> = {
  center: "Help Center",
  faq: "Frequently Asked Questions",
  report: "Report and Safety",
  guidelines: "Community Guidelines",
  contact: "Contact Support",
};

const Help = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const section = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("section") || "center";
    return value in sectionTitles ? value : "center";
  }, [location.search]);

  return (
    <div className="ig-screen-spring ig-modern-page min-h-screen bg-background pb-24">
      <div className="ig-modern-header flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={() => navigate(-1)} className="rounded-lg p-1" aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="ig-type-h2 text-foreground">Help and support</h1>
        <div className="w-6" />
      </div>

      <div className="space-y-3 px-4 py-4">
        <section className="rounded-2xl panel-surface p-4">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" /> {sectionTitles[section]}
          </p>
          <p className="mt-2 text-sm text-foreground">
            Find fast answers, report issues, and review community standards in one place.
          </p>
        </section>

        <section className="rounded-2xl panel-surface p-4">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <LifeBuoy className="h-3.5 w-3.5" /> Quick links
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant={section === "center" ? "default" : "secondary"} onClick={() => navigate("/help?section=center")}>Help center</Button>
            <Button variant={section === "faq" ? "default" : "secondary"} onClick={() => navigate("/help?section=faq")}>FAQs</Button>
            <Button variant={section === "report" ? "default" : "outline"} onClick={() => navigate("/help?section=report")}>Report a problem</Button>
            <Button variant={section === "guidelines" ? "default" : "outline"} onClick={() => navigate("/help?section=guidelines")}>Community guidelines</Button>
            <Button variant={section === "contact" ? "default" : "outline"} onClick={() => navigate("/help?section=contact")} className="sm:col-span-2">Contact support</Button>
          </div>
        </section>

        {section === "center" && (
          <section className="rounded-2xl panel-surface p-4">
            <p className="text-sm font-medium text-foreground">What you can do here</p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              <li>• Manage account security and privacy from Settings.</li>
              <li>• Open Inbox for message and request troubleshooting.</li>
              <li>• Use in-app report options on posts, comments, and profiles.</li>
            </ul>
          </section>
        )}

        {section === "faq" && (
          <section className="rounded-2xl panel-surface p-4">
            <p className="text-sm font-medium text-foreground">Top questions</p>
            <div className="mt-2 space-y-3 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">How do I reset my password?</p>
                <p>Open Settings → Security → Reset password.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">How do I control who can message me?</p>
                <p>Open Settings → Privacy → Message requests.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">How do I export my account data?</p>
                <p>Open Settings → Data and storage → Download account data.</p>
              </div>
            </div>
          </section>
        )}

        {section === "report" && (
          <section className="rounded-2xl panel-surface p-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageSquareWarning className="h-4 w-4" /> Report and safety workflow
            </p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              <li>• On a post or profile, open the overflow menu and tap Report.</li>
              <li>• Choose the most accurate reason and include details when prompted.</li>
              <li>• For urgent safety concerns, contact support directly.</li>
            </ul>
          </section>
        )}

        {section === "guidelines" && (
          <section className="rounded-2xl panel-surface p-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="h-4 w-4" /> Community guidelines summary
            </p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              <li>• Respect others: no harassment, hate, or threats.</li>
              <li>• Post authentic media and avoid harmful misinformation.</li>
              <li>• Do not share private or sensitive personal information.</li>
              <li>• Illegal or exploitative content is removed and may trigger account action.</li>
            </ul>
          </section>
        )}

        {section === "contact" && (
          <section className="rounded-2xl panel-surface p-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Smartphone className="h-4 w-4" /> Contact support
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Send details and screenshots so the team can investigate faster.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = "mailto:support@opium.app?subject=Opium%20Support%20Request";
                }}
              >
                Email support
              </Button>
              <Button variant="outline" onClick={() => navigate("/settings?tab=security")}>
                <ShieldAlert className="mr-2 h-4 w-4" /> Security settings
              </Button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border/70 bg-background/70 p-4">
          <p className="text-xs text-muted-foreground">Need account-specific help? Include your username and the time the issue happened.</p>
          <Button className="mt-3 w-full" variant="outline" onClick={() => navigate("/settings")}>Back to settings</Button>
          <Button className="mt-2 w-full" variant="secondary" onClick={() => navigate("/inbox")}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open inbox
          </Button>
        </section>
      </div>
    </div>
  );
};

export default Help;
