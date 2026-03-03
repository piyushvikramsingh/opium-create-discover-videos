import { Home, Search, MessageCircle, User, Play, Bell } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUnreadNotificationsCount } from "@/hooks/useData";
import { useConversations } from "@/hooks/useMessages";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Play, label: "Clippy", path: "/clipy" },
  { icon: MessageCircle, label: "Message", path: "/inbox" },
  { icon: Bell, label: "Activity", path: "/notifications" },
  { icon: User, label: "Profile", path: "/profile" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: unreadNotifications = 0 } = useUnreadNotificationsCount();
  const { data: conversations = [] } = useConversations();
  const messageRequestCount = (conversations as any[]).filter((convo) => convo?.isMessageRequest).length;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/80 backdrop-blur-xl pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);

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
                {item.path === "/notifications" && unreadNotifications > 0 && (
                  <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
                {item.path === "/inbox" && messageRequestCount > 0 && (
                  <span className="absolute -left-2 -top-2 min-w-4 rounded-full bg-secondary px-1 text-[9px] font-bold text-foreground">
                    {messageRequestCount > 9 ? "9+" : messageRequestCount}
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
