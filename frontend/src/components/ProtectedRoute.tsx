import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import AuthPage from "../pages/AuthPage";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading...</div>
    );
  }
  if (!session) return <AuthPage />;
  return <>{children}</>;
}
