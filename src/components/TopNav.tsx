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
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onTabChange("following")}
            data-active={activeTab === "following"}
            className={`ig-tab-pill ig-tap px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTab === "following"
                ? "text-foreground"
                : "text-foreground/50 hover:text-foreground/80"
            }`}
          >
            Following{followingCount > 0 ? ` (${followingCount})` : ""}
          </button>
          <button
            onClick={() => onTabChange("foryou")}
            data-active={activeTab === "foryou"}
            className={`ig-tab-pill ig-tap px-4 py-1.5 text-sm font-semibold transition-all ${
              activeTab === "foryou"
                ? "text-foreground"
                : "text-foreground/50 hover:text-foreground/80"
            }`}
          >
            For You
          </button>
        </div>
        <div className="w-12" />
      </div>
    </div>
  );
};

export default TopNav;
