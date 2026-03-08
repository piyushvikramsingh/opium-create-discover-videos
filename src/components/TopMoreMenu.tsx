import { useEffect, useState } from "react";
import {
  MoreHorizontal,
  User,
  Settings,
  BarChart3,
  CalendarClock,
  Flag,
  Radio,
  Wallet,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const moreItems = [
  { icon: User, label: "Profile", path: "/profile" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: CalendarClock, label: "Drafts", path: "/drafts" },
  { icon: Flag, label: "Engagement", path: "/engagement" },
  { icon: Radio, label: "Live", path: "/live" },
  { icon: Wallet, label: "Monetize", path: "/monetization" },
];

const TopMoreMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isProfileRoute = location.pathname === "/profile" || location.pathname.startsWith("/profile/");

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!isProfileRoute) return null;

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0 z-[60] mx-auto w-full max-w-lg px-3 pt-3">
      <div className="pointer-events-auto ml-auto w-fit">
        <button
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "rounded-full border border-border/60 p-2 backdrop-blur-md transition-all duration-200",
            open
              ? "bg-secondary text-foreground"
              : "bg-background/80 text-foreground hover:bg-secondary"
          )}
          aria-label="Open more menu"
        >
          {open ? (
            <X className="h-5 w-5" />
          ) : (
            <MoreHorizontal className="h-5 w-5" />
          )}
        </button>

        {open && (
          <div className="mt-2 w-56 animate-scale-in rounded-2xl border border-border/60 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
            {moreItems.map((item) => {
              const isCurrentPage = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                    isCurrentPage
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-secondary"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TopMoreMenu;
