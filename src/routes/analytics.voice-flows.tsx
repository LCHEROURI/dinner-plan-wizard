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

function normalizeImported(input: unknown): {
  entries: BufferEntry[];
  errors: string[];
} {
  const errors: string[] = [];
  const push = (msg: string) => errors.push(msg);

  const coerceEntry = (raw: unknown, path: string): BufferEntry | null => {
    if (!raw || typeof raw !== "object") {
      push(`${path}: not an object`);
      return null;
    }
    const r = raw as Record<string, unknown>;
    const event = typeof r.event === "string" ? r.event : null;
    const payload =
      r.payload && typeof r.payload === "object"
        ? (r.payload as AnalyticsPayload)
        : null;
    const ts =
      typeof r.ts === "number"
        ? r.ts
        : typeof r.ts_iso === "string"
        ? Date.parse(r.ts_iso)
        : typeof (payload?.ts as unknown) === "number"
        ? (payload!.ts as number)
        : NaN;
    if (!event) {
      push(`${path}: missing 'event'`);
      return null;
    }
    if (!payload) {
      push(`${path}: missing 'payload'`);
      return null;
    }
    if (!Number.isFinite(ts)) {
      push(`${path}: missing/invalid 'ts'`);
      return null;
    }
    return { event, payload, ts: ts as number };
  };

  let list: unknown[] = [];
  if (Array.isArray(input)) {
    list = input;
  } else if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    if (Array.isArray(o.flows)) {
      // Exported report shape: { flows: [{ events: [...] }] }
      (o.flows as unknown[]).forEach((f, fi) => {
        if (f && typeof f === "object" && Array.isArray((f as { events?: unknown }).events)) {
          (f as { events: unknown[] }).events.forEach((e, ei) =>
            list.push({ __path: `flows[${fi}].events[${ei}]`, ...(e as object) }),
          );
        }
      });
    } else if (Array.isArray(o.events)) {
      list = o.events;
    } else if (Array.isArray(o.buffer)) {
      list = o.buffer;
    } else {
      push("Unrecognized shape: expected an array or an object with 'flows'/'events'/'buffer'.");
    }
  } else {
    push("Input must be a JSON array or object.");
  }

  const entries: BufferEntry[] = [];
  list.forEach((item, i) => {
    const path = (item as { __path?: string })?.__path ?? `[${i}]`;
    const e = coerceEntry(item, path);
    if (e) entries.push(e);
  });
  return { entries, errors };
}

interface ImportedSource {
  entries: BufferEntry[];
  filename?: string;
  errors: string[];
}

function VoiceFlowsDashboard() {
  const live = useLiveBuffer(1000);
  const [imported, setImported] = useState<ImportedSource | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const raw = useMemo(
    () => (imported ? imported.entries.filter((e) => isVoiceEvent(e.event)) : live),
    [imported, live],
  );
  const flows = useMemo(() => groupByFlow(raw), [raw]);

  const loadFromText = (text: string, filename?: string) => {
    setParseError(null);
    try {
      const parsed = JSON.parse(text);
      const { entries, errors } = normalizeImported(parsed);
      if (entries.length === 0) {
        setParseError(
          errors.length
            ? `No usable events found. ${errors.slice(0, 3).join("; ")}`
            : "No usable events found in the file.",
        );
        return;
      }
      setImported({ entries, filename, errors });
      setPasteOpen(false);
      setPasteText("");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    loadFromText(text, file.name);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      setParseError("Only JSON files are accepted.");
      return;
    }
    void onFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

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
    <main
      className="mx-auto max-w-5xl p-6 font-sans text-primary"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Voice permission flow report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {imported
              ? "Viewing imported event log offline. Payload and sequence checks run entirely client-side."
              : "Live view of window.__lovableAnalytics grouped by flow_id. Trigger the voice mic in another tab, then return here to inspect the sequence and payload integrity."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary focus-within:outline-none focus-within:ring-2 focus-within:ring-coral focus-within:ring-offset-2"
            aria-label="Upload JSON event log"
          >
            Upload JSON
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            aria-expanded={pasteOpen}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
          >
            {pasteOpen ? "Cancel paste" : "Paste JSON"}
          </button>
          {imported && (
            <button
              type="button"
              onClick={() => {
                setImported(null);
                setParseError(null);
              }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
            >
              Back to live
            </button>
          )}
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

      {imported && (
        <div className="mb-4 rounded-lg border border-coral/30 bg-coral/5 p-3 text-xs">
          <p className="font-semibold text-primary">
            Imported {imported.entries.length} event
            {imported.entries.length === 1 ? "" : "s"}
            {imported.filename ? ` from ${imported.filename}` : ""}.
          </p>
          {imported.errors.length > 0 && (
            <details className="mt-1 text-muted-foreground">
              <summary className="cursor-pointer">
                {imported.errors.length} row{imported.errors.length === 1 ? "" : "s"} skipped
              </summary>
              <ul className="mt-1 list-disc pl-4">
                {imported.errors.slice(0, 20).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {pasteOpen && (
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <label htmlFor="paste-json" className="text-xs font-semibold">
            Paste exported JSON (report or raw event array)
          </label>
          <textarea
            id="paste-json"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
            placeholder='[{"event":"voice_permission_denied","payload":{...},"ts":1700000000000}]'
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => loadFromText(pasteText)}
              disabled={!pasteText.trim()}
              className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              Analyze
            </button>
          </div>
        </div>
      )}

      {parseError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
        >
          Could not load JSON: {parseError}
        </div>
      )}



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
