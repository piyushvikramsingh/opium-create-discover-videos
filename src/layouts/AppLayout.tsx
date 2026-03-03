import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import TopMoreMenu from "@/components/TopMoreMenu";

const AppLayout = () => {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-lg bg-background lg:border lg:border-border/60 lg:shadow-2xl lg:shadow-black/10">
      <TopMoreMenu />
      <div className="ig-screen">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
