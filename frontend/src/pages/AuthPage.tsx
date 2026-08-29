import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import JournalCard from "../components/JournalCard";
import Button from "../components/Button";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else if (mode === "signup") {
      setNotice("Account created - check your email to confirm, then sign in.");
      setMode("signin");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <JournalCard hoverable={false} className="w-full max-w-sm p-8">
        <div className="mb-2">
          <Logo />
        </div>
        <p className="font-body-md text-on-surface-variant mb-6">Your personal study-growth companion.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none"
            />
          </div>
          <div>
            <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none"
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
          {notice && <p className="text-sm text-primary">{notice}</p>}

          <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center font-label-md text-label-md text-on-surface-variant hover:text-primary mt-5"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </JournalCard>
    </div>
  );
}
