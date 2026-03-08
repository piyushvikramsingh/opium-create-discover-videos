import { Home, Search, PlusSquare, Film, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Search, label: "Explore", path: "/discover" },
  { icon: PlusSquare, label: "", path: "/create", isCreate: true },
  { icon: Film, label: "Reels", path: "/reels" },
  { icon: User, label: "Profile", path: "/profile" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background pb-safe">
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
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 transition-all duration-150 active:scale-90 ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon
                className={`${item.isCreate ? "h-6 w-6" : "h-6 w-6"} ${
                  isActive && !item.isCreate ? "fill-current" : ""
                }`}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
