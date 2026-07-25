import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { auth } from "@/integrations/firebase/config";
import { onAuthStateChanged } from "firebase/auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page slipped out of the pantry.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Try again or head home.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a href="/" className="rounded-full border border-input bg-card px-5 py-2.5 text-sm font-medium hover:bg-accent/10">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovable Meals — AI weeknight dinner planner" },
      { name: "description", content: "Get a personalized 3, 5, or 7-night dinner plan with recognizable recipes and a consolidated shopping list, powered by AI." },
      { name: "author", content: "Lovable Meals" },
      { property: "og:title", content: "Lovable Meals — AI weeknight dinner planner" },
      { property: "og:description", content: "Get a personalized 3, 5, or 7-night dinner plan with recognizable recipes and a consolidated shopping list, powered by AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Lovable Meals — AI weeknight dinner planner" },
      { name: "twitter:description", content: "Get a personalized 3, 5, or 7-night dinner plan with recognizable recipes and a consolidated shopping list, powered by AI." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b1069ef4-3ea8-4697-a5e3-cf515c7efce5/id-preview-bf07b313--b32bcc04-06b7-42d8-b53f-63ac4c8f4b0b.lovable.app-1784924295962.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b1069ef4-3ea8-4697-a5e3-cf515c7efce5/id-preview-bf07b313--b32bcc04-06b7-42d8-b53f-63ac4c8f4b0b.lovable.app-1784924295962.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      router.invalidate();
      if (user) {
        queryClient.invalidateQueries();
      }
    });
    return () => unsub();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
