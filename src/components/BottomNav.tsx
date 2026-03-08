import { Home, Compass, MessageCircle, Scissors, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Compass, label: "Explore", path: "/discover" },
  { icon: MessageCircle, label: "Messages", path: "/inbox" },
  { icon: Scissors, label: "Clippy", path: "/reels" },
  { icon: User, label: "Profile", path: "/profile" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/20 bg-background/80 backdrop-blur-2xl pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-0.5">
        {navItems.map((item) => {
          const isActive = item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-4 py-2 transition-all duration-200 active:scale-90",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-primary animate-scale-in" />
              )}

              <Icon
                className={cn(
                  "h-[22px] w-[22px] transition-all duration-200",
                  isActive && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.4)]"
                )}
                strokeWidth={isActive ? 2.5 : 1.5}
                fill={isActive ? "currentColor" : "none"}
              />
              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  isActive ? "font-semibold" : "font-medium opacity-70"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
