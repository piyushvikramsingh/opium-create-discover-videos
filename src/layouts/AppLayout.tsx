import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

const AppLayout = () => {
  return (
    <div className="mx-auto min-h-screen w-full max-w-lg bg-background shadow-2xl shadow-black/20">
      <Outlet />
      <BottomNav />
    </div>
  );
};

export default AppLayout;
