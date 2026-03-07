import { Home, Search, User, Play, PlusSquare } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Search, label: "Search", path: "/discover" },
  { icon: PlusSquare, label: "Create", path: "/create" },
  { icon: Play, label: "Clippy", path: "/clipy" },
  { icon: User, label: "Profile", path: "/profile" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="ig-nav-frost fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/95 pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-3 py-1">
        {navItems.map((item) => {
          const isActive = item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          const isCreate = item.path === "/create";

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              className={`ig-tap ig-icon-btn ig-nav-item relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-150 ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon
                className={`transition-transform duration-150 ${
                  isCreate ? "h-6 w-6" : "h-5 w-5"
                } ${isActive ? "scale-105" : "scale-100"}`}
              />
              {isActive && !isCreate && (
                <span className="ig-tab-indicator absolute -bottom-1 h-0.5 w-4 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
