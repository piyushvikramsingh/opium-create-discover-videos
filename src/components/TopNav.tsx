interface TopNavProps {
  activeTab: "following" | "foryou";
  onTabChange: (tab: "following" | "foryou") => void;
  followingCount?: number;
}

const TopNav = ({ activeTab, onTabChange, followingCount = 0 }: TopNavProps) => {

  return (
    <div className="ig-header fixed left-0 right-0 top-0 z-50 pt-safe">
      <div className="mx-auto flex max-w-lg items-center justify-between px-3 py-2">
        <div className="text-xs font-semibold tracking-wide text-foreground/75">Feed</div>
        <div className="flex items-center justify-center gap-6 border-t border-border/60 px-2 pt-1">
          <button
            onClick={() => onTabChange("following")}
            data-active={activeTab === "following"}
            className={`relative ig-tap px-1 py-1 text-sm font-semibold transition-colors ${
              activeTab === "following"
                ? "text-foreground"
                : "text-foreground/50 hover:text-foreground/80"
            }`}
          >
            Following{followingCount > 0 ? ` (${followingCount})` : ""}
            {activeTab === "following" && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
          </button>
          <button
            onClick={() => onTabChange("foryou")}
            data-active={activeTab === "foryou"}
            className={`relative ig-tap px-1 py-1 text-sm font-semibold transition-colors ${
              activeTab === "foryou"
                ? "text-foreground"
                : "text-foreground/50 hover:text-foreground/80"
            }`}
          >
            For You
            {activeTab === "foryou" && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
          </button>
        </div>
        <div className="w-12" />
      </div>
    </div>
  );
};

export default TopNav;
