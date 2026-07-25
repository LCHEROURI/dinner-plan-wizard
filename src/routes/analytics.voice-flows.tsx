import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  validateEventPayload,
  type AnalyticsEvent,
  type AnalyticsPayload,
} from "@/lib/analytics";

/**
 * Voice permission-flow debug dashboard.
 *
 * Reads the in-memory ring buffer (`window.__lovableAnalytics`) that
 * `trackEvent` populates on every dispatch, groups entries by `flow_id`,
 * and renders each flow's event sequence with payload-integrity checks
 * against the discriminated-union schema in `src/lib/analytics.ts`.
 *
 * This is a read-only client-side view — no network calls, no PII, no
 * server state — so it lives on a public route. Nothing renders on SSR.
 */

type BufferEntry = { event: string; payload: AnalyticsPayload; ts: number };

const VOICE_EVENTS = [
  "voice_permission_denied",
  "voice_permission_retry_clicked",
  "voice_permission_retry_succeeded",
  "voice_permission_retry_failed",
  "voice_auto_retry_editor_opened",
] as const satisfies readonly AnalyticsEvent[];

const PERMISSION_SEQUENCE: readonly AnalyticsEvent[] = [
  "voice_permission_denied",
  "voice_permission_retry_clicked",
  "voice_permission_retry_succeeded",
];

const EDITOR_SEQUENCE: readonly AnalyticsEvent[] = [
  "voice_auto_retry_editor_opened",
];

function isVoiceEvent(name: string): name is (typeof VOICE_EVENTS)[number] {
  return (VOICE_EVENTS as readonly string[]).includes(name);
}

type FlowKind = "permission" | "editor" | "unknown";

interface Flow {
  flowId: string;
  kind: FlowKind;
  entries: BufferEntry[];
  outcome: "succeeded" | "failed" | "pending" | "opened";
}

function classify(flowId: string, entries: BufferEntry[]): Flow {
  const names = new Set(entries.map((e) => e.event));
  const kind: FlowKind = flowId.startsWith("perm-")
    ? "permission"
    : flowId.startsWith("editor-autoretry-")
    ? "editor"
    : "unknown";
  const outcome: Flow["outcome"] =
    kind === "editor"
      ? "opened"
      : names.has("voice_permission_retry_succeeded")
      ? "succeeded"
      : names.has("voice_permission_retry_failed")
      ? "failed"
      : "pending";
  return { flowId, kind, entries, outcome };
}

function readBuffer(): BufferEntry[] {
  if (typeof window === "undefined") return [];
  const buf = (window.__lovableAnalytics ?? []) as BufferEntry[];
  return buf.filter((e) => isVoiceEvent(e.event));
}

function groupByFlow(entries: BufferEntry[]): Flow[] {
  const groups = new Map<string, BufferEntry[]>();
  for (const e of entries) {
    const fid = (e.payload.flow_id as string | undefined) ?? "(no flow_id)";
    const bucket = groups.get(fid) ?? [];
    bucket.push(e);
    groups.set(fid, bucket);
  }
  return Array.from(groups.entries())
    .map(([fid, list]) =>
      classify(
        fid,
        [...list].sort((a, b) => a.ts - b.ts),
      ),
    )
    .sort((a, b) => {
      const at = a.entries[0]?.ts ?? 0;
      const bt = b.entries[0]?.ts ?? 0;
      return bt - at;
    });
}

function checkSequence(flow: Flow): { ok: boolean; note: string } {
  if (flow.kind === "editor") {
    const names = flow.entries.map((e) => e.event);
    return names.length === 1 && names[0] === EDITOR_SEQUENCE[0]
      ? { ok: true, note: "editor-opened only" }
      : { ok: false, note: `unexpected: ${names.join(" → ")}` };
  }
  if (flow.kind === "permission") {
    const names = flow.entries.map((e) => e.event);
    // Must start with denied; clicked must precede succeeded/failed.
    if (names[0] !== "voice_permission_denied") {
      return { ok: false, note: "did not start with voice_permission_denied" };
    }
    const clickIdx = names.indexOf("voice_permission_retry_clicked");
    const okIdx = names.indexOf("voice_permission_retry_succeeded");
    const failIdx = names.indexOf("voice_permission_retry_failed");
    if (okIdx !== -1 && (clickIdx === -1 || clickIdx > okIdx)) {
      return { ok: false, note: "succeeded before clicked" };
    }
    if (failIdx !== -1 && (clickIdx === -1 || clickIdx > failIdx)) {
      return { ok: false, note: "failed before clicked" };
    }
    return { ok: true, note: `sequence: ${names.join(" → ")}` };
  }
  return { ok: false, note: "unknown flow kind" };
}

function useLiveBuffer(intervalMs: number): BufferEntry[] {
  const [entries, setEntries] = useState<BufferEntry[]>([]);
  useEffect(() => {
    setEntries(readBuffer());
    const listener = () => setEntries(readBuffer());
    const t = window.setInterval(listener, intervalMs);
    window.addEventListener("lovable:analytics", listener);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("lovable:analytics", listener);
    };
  }, [intervalMs]);
  return entries;
}

function VoiceFlowsDashboard() {
  const raw = useLiveBuffer(1000);
  const flows = useMemo(() => groupByFlow(raw), [raw]);

  const totals = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of raw) counts[e.event] = (counts[e.event] ?? 0) + 1;
    return counts;
  }, [raw]);

  const integrity = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    for (const e of raw) {
      if (validateEventPayload(e.event as AnalyticsEvent, e.payload)) valid += 1;
      else invalid += 1;
    }
    return { valid, invalid };
  }, [raw]);

  const sequenceHealth = useMemo(() => {
    let ok = 0;
    let bad = 0;
    for (const f of flows) {
      if (checkSequence(f).ok) ok += 1;
      else bad += 1;
    }
    return { ok, bad };
  }, [flows]);

  const buildReport = () =>
    flows.map((f) => {
      const seq = checkSequence(f);
      return {
        flow_id: f.flowId,
        kind: f.kind,
        outcome: f.outcome,
        sequence_ok: seq.ok,
        sequence_note: seq.note,
        events: f.entries.map((e) => ({
          event: e.event,
          ts: e.ts,
          ts_iso: new Date(e.ts).toISOString(),
          payload_valid: validateEventPayload(e.event as AnalyticsEvent, e.payload),
          payload: e.payload,
        })),
      };
    });

  const download = (filename: string, mime: string, body: string) => {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

  const exportJson = () => {
    const report = {
      generated_at: new Date().toISOString(),
      totals,
      payload_integrity: integrity,
      sequence_integrity: sequenceHealth,
      flows: buildReport(),
    };
    download(`voice-flows-${stamp()}.json`, "application/json", JSON.stringify(report, null, 2));
  };

  const csvEscape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCsv = () => {
    const header = [
      "flow_id",
      "flow_kind",
      "flow_outcome",
      "flow_sequence_ok",
      "flow_sequence_note",
      "step",
      "event",
      "ts_iso",
      "payload_valid",
      "payload_json",
    ];
    const rows: string[] = [header.join(",")];
    for (const f of buildReport()) {
      f.events.forEach((e, i) => {
        rows.push(
          [
            f.flow_id,
            f.kind,
            f.outcome,
            f.sequence_ok,
            f.sequence_note,
            i + 1,
            e.event,
            e.ts_iso,
            e.payload_valid,
            e.payload,
          ]
            .map(csvEscape)
            .join(","),
        );
      });
    }
    download(`voice-flows-${stamp()}.csv`, "text/csv", rows.join("\n"));
  };

  const disabled = flows.length === 0;

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans text-primary">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Voice permission flow report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of `window.__lovableAnalytics` grouped by <code>flow_id</code>.
            Trigger the voice mic in another tab, then return here to inspect the
            sequence and payload integrity. Data is client-side only.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportJson}
            disabled={disabled}
            aria-label="Download report as JSON"
            className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={disabled}
            aria-label="Download report as CSV"
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
          >
            Export CSV
          </button>
        </div>
      </header>


      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <SummaryCard label="Events captured" value={raw.length} />
        <SummaryCard label="Flows" value={flows.length} />
        <SummaryCard
          label="Payload integrity"
          value={`${integrity.valid} ok / ${integrity.invalid} bad`}
          tone={integrity.invalid ? "bad" : "ok"}
        />
        <SummaryCard
          label="Sequence integrity"
          value={`${sequenceHealth.ok} ok / ${sequenceHealth.bad} bad`}
          tone={sequenceHealth.bad ? "bad" : "ok"}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Event totals
        </h2>
        <div className="flex flex-wrap gap-2">
          {VOICE_EVENTS.map((name) => (
            <span
              key={name}
              className="rounded-full border border-border bg-secondary px-3 py-1 text-xs"
            >
              {name}: <strong>{totals[name] ?? 0}</strong>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Flows ({flows.length})
        </h2>
        {flows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No voice analytics events captured yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {flows.map((flow) => (
              <FlowRow key={flow.flowId} flow={flow} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "bad";
}) {
  const toneCls =
    tone === "bad"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : tone === "ok"
      ? "border-sage/40 bg-sage/5 text-sage"
      : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 ${toneCls}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function FlowRow({ flow }: { flow: Flow }) {
  const seq = checkSequence(flow);
  const outcomeTone =
    flow.outcome === "succeeded" || flow.outcome === "opened"
      ? "bg-sage/15 text-sage"
      : flow.outcome === "failed"
      ? "bg-destructive/15 text-destructive"
      : "bg-secondary text-muted-foreground";

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] uppercase tracking-wide">
            {flow.kind}
          </span>
          <code className="text-xs text-muted-foreground">{flow.flowId}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${outcomeTone}`}>
            {flow.outcome}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              seq.ok ? "bg-sage/15 text-sage" : "bg-destructive/15 text-destructive"
            }`}
            title={seq.note}
          >
            sequence {seq.ok ? "✓" : "✗"}
          </span>
        </div>
      </header>

      <ol className="mt-3 space-y-1">
        {flow.entries.map((e, i) => {
          const valid = validateEventPayload(e.event as AnalyticsEvent, e.payload);
          const ts = new Date(e.ts).toISOString().slice(11, 23);
          return (
            <li
              key={`${e.event}-${e.ts}-${i}`}
              className="flex items-start gap-2 rounded-md bg-secondary/40 px-2 py-1 text-xs"
            >
              <span className="w-6 shrink-0 text-muted-foreground">{i + 1}.</span>
              <span className="w-24 shrink-0 font-mono text-muted-foreground">{ts}</span>
              <span className="flex-1 font-mono">{e.event}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  valid ? "bg-sage/15 text-sage" : "bg-destructive/15 text-destructive"
                }`}
              >
                payload {valid ? "✓" : "✗"}
              </span>
            </li>
          );
        })}
      </ol>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-muted-foreground">
          Raw payloads
        </summary>
        <pre className="mt-1 overflow-auto rounded-md bg-secondary/40 p-2 text-[11px]">
{JSON.stringify(
  flow.entries.map((e) => ({ event: e.event, payload: e.payload })),
  null,
  2,
)}
        </pre>
      </details>
    </li>
  );
}

export const Route = createFileRoute("/analytics/voice-flows")({
  component: VoiceFlowsDashboard,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Voice flow report — Lovable Meals" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Debug report for the voice permission analytics flow: event sequence and payload integrity.",
      },
    ],
  }),
});
