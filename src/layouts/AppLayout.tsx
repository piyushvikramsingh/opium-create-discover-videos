import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import TopMoreMenu from "@/components/TopMoreMenu";

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

const AppLayout = () => {
  const location = useLocation();

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-lg overflow-x-hidden bg-background lg:min-h-[100dvh] lg:border-x lg:border-border/40">
      <TopMoreMenu />
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
