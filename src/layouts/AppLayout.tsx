import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import TopMoreMenu from "@/components/TopMoreMenu";

const AppLayout = () => {
  const location = useLocation();

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-lg overflow-x-hidden bg-background lg:min-h-[100dvh] lg:border-x lg:border-border/40">
      <TopMoreMenu />
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Outlet />
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
