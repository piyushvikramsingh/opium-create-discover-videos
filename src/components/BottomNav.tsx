import { Home, Search, PlusSquare, MessageCircle, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUnreadNotificationsCount } from "@/hooks/useData";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Search, label: "Discover", path: "/discover" },
  { icon: PlusSquare, label: "", path: "/create", isCreate: true },
  { icon: MessageCircle, label: "Inbox", path: "/inbox" },
  { icon: User, label: "Profile", path: "/profile" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: unreadNotifications = 0 } = useUnreadNotificationsCount();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/80 backdrop-blur-xl pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);

          if (item.isCreate) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="lift-on-tap flex items-center justify-center rounded-xl p-1"
              >
                <div className="gradient-primary flex h-9 w-12 items-center justify-center rounded-xl shadow-lg shadow-primary/20">
                  <PlusSquare className="h-5 w-5 text-foreground" />
                </div>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`lift-on-tap flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 ${
                isActive ? "bg-secondary/80" : ""
              }`}
            >
              <div className="relative">
                <item.icon
                  className={`h-6 w-6 transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                />
                {item.path === "/inbox" && unreadNotifications > 0 && (
                  <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] transition-colors ${
                  isActive ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
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
