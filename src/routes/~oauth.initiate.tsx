import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/~oauth/initiate")({
  component: OAuthInitiateCatch,
});

function OAuthInitiateCatch() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.error("Google Sign-In is not configured for this project deployment. Please use Email & Password below.", {
      duration: 5000,
    });
    navigate({ to: "/auth", replace: true });
  }, [navigate]);

  return null;
}
