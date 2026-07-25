import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { auth } from "@/integrations/firebase/config";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Wait brief tick for Firebase auth state initialization if needed
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw redirect({ to: "/auth" });
    }
    return { user: currentUser };
  },
  component: () => <Outlet />,
});
