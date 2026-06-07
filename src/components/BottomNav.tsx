import { Home, Search, Film, MessageCircle, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Search, label: "Search", path: "/discover" },
  { icon: Film, label: "Reels", path: "/reels" },
  { icon: MessageCircle, label: "Messages", path: "/inbox" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isProfileActive = location.pathname.startsWith("/profile");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              className="group flex h-11 w-11 items-center justify-center rounded-md transition-transform active:scale-90"
            >
              <Icon
                className={cn(
                  "h-7 w-7 transition-colors",
                  isActive ? "text-foreground" : "text-foreground/80"
                )}
                strokeWidth={isActive ? 2.4 : 1.8}
                fill={isActive ? "currentColor" : "none"}
              />
            </button>
          );
        })}

        {/* Profile avatar tab (IG-style) */}
        <button
          onClick={() => navigate("/profile")}
          aria-label="Profile"
          className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90"
        >
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full",
              isProfileActive && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
            )}
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={user?.user_metadata?.avatar_url as string | undefined} />
              <AvatarFallback className="text-[10px]">
                {(user?.email?.[0] || "U").toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
