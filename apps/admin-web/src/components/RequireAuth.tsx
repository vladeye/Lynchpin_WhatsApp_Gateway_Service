import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";

/**
 * Gates the console behind a valid session. Checks `/api/auth/me`; while it
 * resolves we show a spinner, and on failure we send the user to the login page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });

  if (me.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }
  if (me.isError) return <Navigate to="/" replace />;
  return <>{children}</>;
}
