import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, display_name: username },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        setMessage("Check your email to verify your account before signing in.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <h1 className="mb-2 text-3xl font-bold text-foreground text-glow">Opium</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {isLogin ? "Welcome back" : "Create your account"}
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        {!isLogin && (
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-xl bg-secondary px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {message && <p className="text-xs text-primary">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
        </button>
      </form>

      <button
        onClick={() => { setIsLogin(!isLogin); setError(""); setMessage(""); }}
        className="mt-6 text-sm text-muted-foreground"
      >
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <span className="text-primary font-medium">
          {isLogin ? "Sign Up" : "Sign In"}
        </span>
      </button>
    </div>
  );
};

export default Auth;
