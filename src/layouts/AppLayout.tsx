import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import TopMoreMenu from "@/components/TopMoreMenu";

const AppLayout = () => {
  return (
    <div className="relative mx-auto min-h-[100dvh] w-full max-w-lg overflow-x-hidden bg-background lg:border-x lg:border-border/30">
      <TopMoreMenu />
      <div className="pb-[calc(3.75rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
