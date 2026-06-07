import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // If already authenticated, bounce to home.
  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  const friendlyError = (raw: string) => {
    if (/invalid login credentials/i.test(raw)) return "Wrong email or password.";
    if (/already registered/i.test(raw)) return "That email is already in use. Try signing in.";
    if (/rate limit/i.test(raw)) return "Too many attempts. Please wait a moment and try again.";
    if (/password.*pwned|leaked/i.test(raw)) return "This password has been exposed in a data breach. Pick a stronger one.";
    return raw || "Something went wrong.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/", { replace: true });
      } else {
        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: cleanUsername, display_name: username.trim() || cleanUsername },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        // Auto-confirm is on, so a session is returned immediately.
        if (data.session) {
          navigate("/", { replace: true });
        } else {
          setMessage("Account created. You can sign in now.");
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      setError(friendlyError(err?.message ?? ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="meta-auth-bg flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="meta-wordmark text-5xl font-extrabold tracking-tight">opium</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isLogin ? "Log in to continue" : "Create a new account"}
          </p>
        </div>

        <div className="meta-card space-y-3 p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={2}
                maxLength={24}
                className="meta-input"
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="meta-input"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="meta-input pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
            {message && <p className="text-xs font-medium text-primary">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="meta-primary-btn flex w-full items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLogin ? "Log in" : "Sign up"}
            </button>
          </form>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => { setError(""); setMessage(""); }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <div className="mt-4 meta-card p-4 text-center text-sm">
          <span className="text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
          </span>{" "}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); setMessage(""); }}
            className="font-semibold text-primary"
          >
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
