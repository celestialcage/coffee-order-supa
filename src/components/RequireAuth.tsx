import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useLoggedIn } from "../lib/useAuth";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const loggedIn = useLoggedIn();
  if (loggedIn === undefined) return <div className="page muted">확인 중…</div>;
  if (!loggedIn) return <Navigate to="/" replace />;
  return <>{children}</>;
}
