import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import TopMoreMenu from "@/components/TopMoreMenu";

const AppLayout = () => {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-lg overflow-x-hidden bg-background lg:min-h-[100dvh] lg:border-x lg:border-border/40">
      <TopMoreMenu />
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
