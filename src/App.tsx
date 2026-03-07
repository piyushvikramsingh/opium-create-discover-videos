import { lazy, Suspense, Component, ReactNode, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useReliableMutationPipelineWorker } from "@/hooks/useData";
import { useRuntimeSettings } from "@/hooks/useRuntimeSettings";
import {
  getSupabaseRestrictionInfo,
  isSupabaseEgressRestricted,
} from "@/integrations/supabase/client";
import { toast } from "sonner";
import AppLayout from "@/layouts/AppLayout";

const HomeTan = lazy(() => import("./pages/HomeTan"));
const Index = lazy(() => import("./pages/Index"));
const Discover = lazy(() => import("./pages/Discover"));
const Create = lazy(() => import("./pages/Create"));
const Inbox = lazy(() => import("./pages/Inbox"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminPortal = lazy(() => import("./pages/AdminPortal"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Drafts = lazy(() => import("./pages/Drafts"));
const SearchPage = lazy(() => import("./pages/Search"));
const Engagement = lazy(() => import("./pages/Engagement"));
const LiveStreaming = lazy(() => import("./pages/LiveStreaming"));
const Monetization = lazy(() => import("./pages/Monetization"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Sounds = lazy(() => import("./pages/Sounds"));
const SoundDetail = lazy(() => import("./pages/Sounds").then(m => ({ default: m.SoundDetailPage })));
const Help = lazy(() => import("./pages/Help"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (failureCount) => {
        if (isSupabaseEgressRestricted()) return false;
        return failureCount < 1;
      },
    },
  },
});

const RouteWarmup = () => {
  useEffect(() => {
    const warm = () => {
      void import("./pages/HomeTan");
      void import("./pages/Discover");
      void import("./pages/Create");
      void import("./pages/Inbox");
      void import("./pages/Profile");
      void import("./pages/Settings");
      void import("./pages/AdminPortal");
      void import("./pages/Analytics");
      void import("./pages/Drafts");
      void import("./pages/Search");
      void import("./pages/Engagement");
      void import("./pages/LiveStreaming");
      void import("./pages/Monetization");
      void import("./pages/Sounds");
      void import("./pages/Help");
    };

    const withIdle = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof withIdle.requestIdleCallback === "function") {
      const idleId = withIdle.requestIdleCallback(warm, { timeout: 1200 });
      return () => {
        if (typeof withIdle.cancelIdleCallback === "function") {
          withIdle.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(warm, 350);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
};

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

function BackgroundWorkers() {
  useReliableMutationPipelineWorker();
  return null;
}

function RuntimeSettingsBridge() {
  const { themePreference, reduceMotion } = useRuntimeSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", themePreference === "dark");
    root.classList.toggle("light", themePreference === "light");
    root.classList.toggle("reduce-motion", reduceMotion);

    return () => {
      root.classList.remove("light");
      root.classList.remove("reduce-motion");
    };
  }, [reduceMotion, themePreference]);

  return null;
}

function SupabaseRestrictionNotice() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const showRestrictionToast = () => {
      const restriction = getSupabaseRestrictionInfo();
      if (!restriction.restricted) return;

      const untilText = new Date(restriction.restrictedUntil).toLocaleTimeString();
      toast.error("Supabase quota protection mode is active", {
        id: "supabase-quota-protection",
        duration: 12_000,
        description: `Network-heavy requests are temporarily paused until around ${untilText}. Contact Supabase support to fully restore service.`,
      });
    };

    showRestrictionToast();
    const onRestrictionChange = () => showRestrictionToast();
    const onStorage = (event: StorageEvent) => {
      if (event.key?.includes("opium.supabase.restricted")) {
        showRestrictionToast();
      }
    };

    window.addEventListener("opium:supabase-restriction-changed", onRestrictionChange);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("opium:supabase-restriction-changed", onRestrictionChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('App Error Boundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
          <div className="max-w-md rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
            <h1 className="mb-2 text-xl font-bold text-destructive">Something went wrong</h1>
            <p className="mb-4 text-sm text-muted-foreground">{this.state.error?.message}</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Check browser console (F12) and ensure Supabase environment variables are set.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BackgroundWorkers />
        <RuntimeSettingsBridge />
        <SupabaseRestrictionNotice />
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RouteWarmup />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<HomeTan />} />
                  <Route path="/clipy" element={<Index />} />
                  <Route path="/discover" element={<Discover />} />
                  <Route path="/create" element={<Create />} />
                  <Route path="/inbox" element={<Inbox />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/:userId" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<AdminPortal />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/drafts" element={<Drafts />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/engagement" element={<Engagement />} />
                  <Route path="/live" element={<LiveStreaming />} />
                  <Route path="/monetization" element={<Monetization />} />
                  <Route path="/sounds" element={<Sounds />} />
                  <Route path="/sounds/:id" element={<SoundDetail />} />
                  <Route path="/help" element={<Help />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
