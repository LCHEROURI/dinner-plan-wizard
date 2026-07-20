import { createFileRoute } from "@tanstack/react-router";
import { ServingsControl } from "@/components/ServingsControl";

// Public probe route used by e2e tests to prove that even when a shared
// (unauthenticated) route imports ServingsControl directly, the component
// self-gates and renders nothing for anonymous viewers.
function ShareProbe() {
  return (
    <main data-testid="share-probe">
      <h1>Share probe</h1>
      <div data-testid="probe-slot">
        <ServingsControl servings={4} baseServings={4} onChange={() => {}} />
      </div>
    </main>
  );
}

export const Route = createFileRoute("/share/probe")({
  component: ShareProbe,
  head: () => ({ meta: [{ title: "Share probe" }] }),
});
