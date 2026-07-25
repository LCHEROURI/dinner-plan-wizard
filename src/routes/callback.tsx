import { createFileRoute } from "@tanstack/react-router";
import { AuthCallback } from "./auth.callback";

export const Route = createFileRoute("/callback")({
  component: AuthCallback,
});
