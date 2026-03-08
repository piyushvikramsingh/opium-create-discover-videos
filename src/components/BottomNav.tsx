import { Home, Search, PlusSquare, Film, MessageCircle, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Search, label: "Explore", path: "/discover" },
  { icon: PlusSquare, label: "", path: "/create", isCreate: true },
  { icon: Film, label: "Reels", path: "/reels" },
  { icon: MessageCircle, label: "Inbox", path: "/inbox" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 bg-background/95 backdrop-blur-xl pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          if (item.isCreate) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-label="Create"
                className="relative flex items-center justify-center p-2 transition-all duration-150 active:scale-90"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-foreground/80">
                  <Icon className="h-5 w-5 text-foreground" strokeWidth={2} />
                </div>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 transition-all duration-150 active:scale-90 ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon
                className="h-6 w-6"
                strokeWidth={isActive ? 2.5 : 1.5}
                fill={isActive ? "currentColor" : "none"}
              />
              {item.label && (
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
