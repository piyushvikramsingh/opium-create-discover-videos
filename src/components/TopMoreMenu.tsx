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
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

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
          className="lift-on-tap rounded-full border border-border/80 bg-background p-2"
          aria-label="Open more menu"
        >
          <MoreHorizontal className="h-5 w-5 text-foreground" />
        </button>

        {open && (
          <div className="mt-2 w-64 rounded-xl border border-border bg-background p-2 shadow-lg">
            <div className="grid grid-cols-2 gap-1">
              {moreItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="lift-on-tap flex items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-secondary"
                >
                  <item.icon className="h-4 w-4 text-foreground" />
                  <span className="text-xs text-foreground">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopMoreMenu;
