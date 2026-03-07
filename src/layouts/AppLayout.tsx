import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import TopMoreMenu from "@/components/TopMoreMenu";

const AppLayout = () => {
  return (
    <div className="ig-app-shell relative mx-auto min-h-screen w-full max-w-lg overflow-x-hidden bg-background lg:min-h-[100dvh] lg:border-x lg:border-border/60">
      <TopMoreMenu />
      <div className="ig-screen ig-screen-spring pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
