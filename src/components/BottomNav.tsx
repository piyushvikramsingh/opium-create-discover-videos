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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/90 backdrop-blur-xl pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-3 py-2">
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
              className={`ig-tap relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200 ${
                isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon
                className={`transition-transform duration-200 ${
                  isCreate ? "h-6 w-6" : "h-5.5 w-5.5"
                } ${isActive ? "scale-110" : "scale-100"}`}
              />
              {isActive && !isCreate && (
                <span className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
