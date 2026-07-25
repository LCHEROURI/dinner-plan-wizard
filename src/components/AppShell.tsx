import { Link, useNavigate } from "@tanstack/react-router";
import { ChefHat, LayoutDashboard, Plus, Settings, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "@/integrations/firebase/config";
import { signOut as firebaseSignOut } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await firebaseSignOut(auth);
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-primary">
            <ChefHat className="h-5 w-5 text-coral" /> Lovable Meals
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            <Link to="/dashboard" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-primary hover:bg-accent/10" activeProps={{ className: "bg-primary text-primary-foreground" }}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
            <Link to="/new-plan" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-primary hover:bg-accent/10" activeProps={{ className: "bg-primary text-primary-foreground" }}>
              <Plus className="h-4 w-4" /> New plan
            </Link>
            <Link to="/settings" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-primary hover:bg-accent/10" activeProps={{ className: "bg-primary text-primary-foreground" }}>
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </nav>
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-full border border-input bg-card px-3 py-1.5 text-sm hover:bg-accent/10">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
