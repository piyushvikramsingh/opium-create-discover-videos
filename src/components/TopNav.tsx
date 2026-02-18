import { useState } from "react";

const TopNav = () => {
  const [activeTab, setActiveTab] = useState<"following" | "foryou">("foryou");

  return (
    <div className="fixed left-0 right-0 top-0 z-50 pt-safe">
      <div className="mx-auto mt-2 flex w-fit items-center justify-center gap-2 rounded-full border border-border/80 bg-background/70 px-2 py-1 backdrop-blur-xl">
      <button
        onClick={() => setActiveTab("following")}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
          activeTab === "following"
            ? "bg-secondary text-foreground"
            : "text-foreground/50 hover:text-foreground/80"
        }`}
      >
        Following
      </button>
      <button
        onClick={() => setActiveTab("foryou")}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
          activeTab === "foryou"
            ? "bg-secondary text-foreground"
            : "text-foreground/50 hover:text-foreground/80"
        }`}
      >
        For You
      </button>
      </div>
    </div>
  );
};

export default TopNav;
