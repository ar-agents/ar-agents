"use client";

// Scripted replay of the incorporate-agent run. The point of the demo is the
// pause: when the run reaches incorporar_sociedad (needsApproval: always()),
// it stops and waits for a human, exactly like eve parks the turn in
// production. Approve and it constitutes + logs; reject and nothing happens.
// Driven by timers + state, not CSS transitions, so it still works under
// prefers-reduced-motion. Bilingual: the parent remounts it with key={lang}.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang, type Lang } from "../i18n";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";

const TYPE_USER_MS = 26;
const TYPE_ASSISTANT_MS = 13;
const TOOL_RUN_MS = 700;
const PAUSE_AFTER_USER = 480;
const PAUSE_AFTER_TOOL = 300;
const PAUSE_BEFORE_DONE = 900;

type Json = Record<string, string | number | boolean>;

type EventNode =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; via?: string; args: Json; result: Json }
  | { kind: "gate"; name: string; args: Json };

// Demo chrome labels per language. Code, tool names and data values stay
// language-agnostic.
const L = {
  en: {
    status_ready: "ready",
    status_running: "running",
    status_awaiting: "waiting for human",
    status_rejected: "rejected",
    status_done: "done",
    user: "Incorporate an automated company for my invoicing SaaS. Administrator CUIT 20-41758101-5.",
    assistant1: "CUIT is valid. Ready to constitute Facturador Automatizada SAS. Constituting a company is irreversible, so it needs your approval (art. 102).",
    assistant2: "Done. Facturador Automatizada SAS is constituted. A human approved the irreversible step, and the whole run is in the signed audit log (art. 101/102).",
    gate_awaiting: "Approval required",
    gate_approved: "Approved by a human",
    gate_rejected: "Rejected. Nothing was constituted.",
    parked: "The run is parked until you answer.",
    approve: "Approve",
    reject: "Reject",
    constituted: "Company constituted",
    f_denomination: "Denomination",
    f_type: "Type",
    f_admin: "Administrator",
    f_audit: "Audit entry",
    v_audit: "#41 · ed25519 signed",
    see_log: "See the audit log",
    replay: "replay",
    run_again: "run again",
  },
  es: {
    status_ready: "listo",
    status_running: "corriendo",
    status_awaiting: "esperando humano",
    status_rejected: "rechazado",
    status_done: "hecho",
    user: "Constituí una sociedad automatizada para mi SaaS de facturación. CUIT del administrador 20-41758101-5.",
    assistant1: "El CUIT es válido. Listo para constituir Facturador Automatizada SAS. Constituir una empresa es irreversible, así que necesita tu aprobación (art. 102).",
    assistant2: "Listo. Facturador Automatizada SAS quedó constituida. Un humano aprobó el paso irreversible, y todo el run quedó en el audit log firmado (art. 101/102).",
    gate_awaiting: "Aprobación requerida",
    gate_approved: "Aprobado por un humano",
    gate_rejected: "Rechazado. No se constituyó nada.",
    parked: "El run está frenado hasta que respondas.",
    approve: "Aprobar",
    reject: "Rechazar",
    constituted: "Empresa constituida",
    f_denomination: "Denominación",
    f_type: "Tipo",
    f_admin: "Administrador",
    f_audit: "Entrada de auditoría",
    v_audit: "#41 · firmado ed25519",
    see_log: "Ver el audit log",
    replay: "replay",
    run_again: "correr de nuevo",
  },
} as const;

function makeEvents(lang: Lang): ReadonlyArray<EventNode> {
  const t = L[lang];
  return [
    { kind: "user", text: t.user },
    {
      kind: "tool",
      name: "validate_cuit",
      via: "ar-agents.ar/api/mcp",
      args: { cuit: "20-41758101-5" },
      result: { valid: true, nombre: "Clemente, Nazareno", condicion: "Responsable Inscripto" },
    },
    { kind: "assistant", text: t.assistant1 },
    {
      kind: "gate",
      name: "incorporar_sociedad",
      args: {
        denominacion: "Facturador Automatizada SAS",
        tipo: "SAS",
        objeto: "Facturación electrónica para PyMEs argentinas",
        representante: "20-41758101-5",
      },
    },
    // --- below here renders only after approval ---
    {
      kind: "tool",
      name: "incorporar_sociedad",
      args: {
        denominacion: "Facturador Automatizada SAS",
        tipo: "SAS",
        representante: "20-41758101-5",
      },
      result: {
        ok: true,
        denominacion: "Facturador Automatizada SAS",
        deployUrl: "facturador-auto.vercel.app",
        auditRef: "rfc006:8f2a91c4",
      },
    },
    {
      kind: "tool",
      name: "registrar_decision",
      args: { tool: "incorporar_sociedad", governance: "human-approved" },
      result: { logged: true, seq: 41, sig: "ed25519:7b3e…d0" },
    },
    { kind: "assistant", text: t.assistant2 },
  ];
}

type Phase =
  | { type: "idle" }
  | { type: "user"; idx: number; chars: number }
  | { type: "tool-running"; idx: number }
  | { type: "tool-done"; idx: number }
  | { type: "assistant"; idx: number; chars: number }
  | { type: "awaiting"; idx: number }
  | { type: "rejected"; idx: number }
  | { type: "done" };

function phaseFor(events: ReadonlyArray<EventNode>, idx: number): Phase {
  const ev = events[idx];
  if (!ev) return { type: "done" };
  if (ev.kind === "user") return { type: "user", idx, chars: 0 };
  if (ev.kind === "tool") return { type: "tool-running", idx };
  if (ev.kind === "gate") return { type: "awaiting", idx };
  return { type: "assistant", idx, chars: 0 };
}

function activeIdx(p: Phase, total: number): number {
  if (p.type === "idle") return -1;
  if (p.type === "done") return total;
  return p.idx;
}

function fmtValue(v: string | number | boolean) {
  if (typeof v === "string") {
    return (
      <>
        <span style={{ color: "var(--text-muted)" }}>&quot;</span>
        <span style={{ color: "var(--text)" }}>{v}</span>
        <span style={{ color: "var(--text-muted)" }}>&quot;</span>
      </>
    );
  }
  return <span style={{ color: "var(--text)" }}>{String(v)}</span>;
}

function FmtObject({ obj }: { obj: Json }) {
  const entries = Object.entries(obj);
  const multiline = entries.some(
    ([, v]) => typeof v === "string" && v.length > 28,
  );
  if (multiline) {
    return (
      <span>
        <span style={{ color: "var(--text-muted)" }}>{"{"}</span>
        {entries.map(([k, v], i) => (
          <span key={k}>
            <br />
            {"  "}
            <span style={{ color: "var(--text-body)" }}>{k}</span>
            <span style={{ color: "var(--text-muted)" }}>: </span>
            {fmtValue(v)}
            {i < entries.length - 1 ? (
              <span style={{ color: "var(--text-muted)" }}>,</span>
            ) : null}
          </span>
        ))}
        <br />
        <span style={{ color: "var(--text-muted)" }}>{"}"}</span>
      </span>
    );
  }
  return (
    <span>
      <span style={{ color: "var(--text-muted)" }}>{"{ "}</span>
      {entries.map(([k, v], i) => (
        <span key={k}>
          <span style={{ color: "var(--text-body)" }}>{k}</span>
          <span style={{ color: "var(--text-muted)" }}>: </span>
          {fmtValue(v)}
          {i < entries.length - 1 ? (
            <span style={{ color: "var(--text-muted)" }}>, </span>
          ) : null}
        </span>
      ))}
      <span style={{ color: "var(--text-muted)" }}>{" }"}</span>
    </span>
  );
}

function Cursor() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "0.55em",
        height: "1em",
        background: "var(--accent)",
        verticalAlign: "-0.12em",
        marginLeft: 2,
        animation: "eve-cursor 1.05s steps(1) infinite",
      }}
    />
  );
}

function RunningDots() {
  return (
    <span style={{ color: "var(--text-muted)" }}>
      <span style={{ animation: "eve-dot 1.2s infinite" }}>.</span>
      <span style={{ animation: "eve-dot 1.2s infinite", animationDelay: "0.18s" }}>.</span>
      <span style={{ animation: "eve-dot 1.2s infinite", animationDelay: "0.36s" }}>.</span>
    </span>
  );
}

function UserRow({ text, cursor }: { text: string; cursor: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
      <span style={{ color: "var(--text-muted)", userSelect: "none" }}>{">"}</span>
      <span style={{ color: "var(--text)", whiteSpace: "pre-wrap", flex: 1 }}>
        {text}
        {cursor ? <Cursor /> : null}
      </span>
    </div>
  );
}

function ToolRow({
  event,
  state,
}: {
  event: Extract<EventNode, { kind: "tool" }>;
  state: "running" | "done";
}) {
  return (
    <div style={{ marginBottom: 12, animation: "eve-fade 200ms ease-out" }}>
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ color: "var(--text-muted)", userSelect: "none" }}>→</span>
        <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
          <span style={{ color: "var(--accent)", fontWeight: 500 }}>{event.name}</span>
          <span style={{ color: "var(--text-muted)" }}>(</span>
          <FmtObject obj={event.args} />
          <span style={{ color: "var(--text-muted)" }}>)</span>
          {event.via ? (
            <span style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
              {"  "}via {event.via}
            </span>
          ) : null}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <span style={{ color: "var(--text-muted)", userSelect: "none" }}>←</span>
        <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
          {state === "running" ? (
            <span style={{ color: "var(--text-muted)" }}>
              running<RunningDots />
            </span>
          ) : (
            <FmtObject obj={event.result} />
          )}
        </span>
      </div>
    </div>
  );
}

function AssistantRow({ text, cursor }: { text: string; cursor: boolean }) {
  return (
    <div style={{ marginTop: 14, marginBottom: 4 }}>
      <span style={{ color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {text}
        {cursor ? <Cursor /> : null}
      </span>
    </div>
  );
}

type GateState = "awaiting" | "approved" | "rejected";

function GateCard({
  event,
  state,
  labels,
  onApprove,
  onReject,
}: {
  event: Extract<EventNode, { kind: "gate" }>;
  state: GateState;
  labels: (typeof L)[Lang];
  onApprove: () => void;
  onReject: () => void;
}) {
  const accent = state === "rejected" ? "var(--text-muted)" : "var(--accent)";
  return (
    <div
      style={{
        margin: "14px 0 12px",
        background: "var(--bg)",
        borderRadius: 8,
        boxShadow: `${accent} 0 0 0 1px, var(--card-shadow)`,
        overflow: "hidden",
        animation: "eve-fade 260ms ease-out",
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "10px 14px",
          boxShadow: "inset 0 -1px 0 var(--border-color)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            width: 18,
            height: 18,
            alignItems: "center",
            justifyContent: "center",
            color: accent,
          }}
        >
          {state === "approved" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : state === "rejected" ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          )}
        </span>
        <span style={{ fontWeight: 500, fontSize: 13.5, color: "var(--text)", letterSpacing: "-0.01em" }}>
          {state === "approved"
            ? labels.gate_approved
            : state === "rejected"
              ? labels.gate_rejected
              : labels.gate_awaiting}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
          needsApproval: always()
        </span>
      </div>

      <div style={{ padding: "12px 14px", fontFamily: FONT_MONO, fontSize: 12.5, lineHeight: 1.6 }}>
        <span style={{ color: "var(--accent)", fontWeight: 500 }}>{event.name}</span>
        <span style={{ color: "var(--text-muted)" }}>(</span>
        <FmtObject obj={event.args} />
        <span style={{ color: "var(--text-muted)" }}>)</span>
      </div>

      {state === "awaiting" ? (
        <div style={{ display: "flex", gap: 8, padding: "0 14px 14px", fontFamily: FONT_SANS }}>
          <button
            type="button"
            onClick={onApprove}
            style={{
              padding: "8px 18px",
              background: "var(--primary-bg)",
              color: "var(--primary-text)",
              border: "none",
              borderRadius: 6,
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {labels.approve}
          </button>
          <button
            type="button"
            onClick={onReject}
            style={{
              padding: "8px 16px",
              background: "transparent",
              color: "var(--text-body)",
              border: "none",
              borderRadius: 6,
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "var(--shadow-ring-light)",
            }}
          >
            {labels.reject}
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ alignSelf: "center", fontSize: 12, color: "var(--text-muted)" }}>
            {labels.parked}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ResultCard({
  labels,
  onReplay,
}: {
  labels: (typeof L)[Lang];
  onReplay: () => void;
}) {
  const fields: ReadonlyArray<readonly [string, string]> = [
    [labels.f_denomination, "Facturador Automatizada SAS"],
    [labels.f_type, "SAS · art. 14 (Automatizada)"],
    [labels.f_admin, "CUIT 20-41758101-5"],
    [labels.f_audit, labels.v_audit],
  ];
  return (
    <div
      style={{
        marginTop: 18,
        padding: "20px 22px",
        background: "var(--bg)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        animation: "eve-fade 360ms ease-out",
        fontFamily: FONT_SANS,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 9999,
            background: "var(--accent)",
            flexShrink: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <span style={{ fontWeight: 500, fontSize: 15, letterSpacing: "-0.16px", color: "var(--text)" }}>
          {labels.constituted}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onReplay}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: "transparent",
            color: "var(--text-muted)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: FONT_MONO,
            cursor: "pointer",
            boxShadow: "var(--shadow-ring-light)",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          {labels.replay}
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 8,
          columnGap: 20,
          fontFamily: FONT_MONO,
          fontSize: 12.5,
          marginBottom: 22,
        }}
      >
        {fields.map(([label, value]) => (
          <span key={label} style={{ display: "contents" }}>
            <span style={{ color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 11, alignSelf: "center" }}>
              {label}
            </span>
            <span style={{ color: "var(--text)" }}>{value}</span>
          </span>
        ))}
      </div>
      <a
        href="/auditor"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: "var(--primary-bg)",
          color: "var(--primary-text)",
          borderRadius: 6,
          fontFamily: FONT_SANS,
          fontSize: 14,
          fontWeight: 500,
          textDecoration: "none",
          letterSpacing: "-0.16px",
        }}
      >
        {labels.see_log}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>
      </a>
    </div>
  );
}

export function EveDemo() {
  const { lang } = useLang();
  const labels = L[lang];
  const events = useMemo(() => makeEvents(lang), [lang]);
  const gateIdx = useMemo(() => events.findIndex((e) => e.kind === "gate"), [events]);

  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Start when scrolled into view.
  useEffect(() => {
    if (started) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          setPhase(phaseFor(events, 0));
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [started, events]);

  // Phase machine. "awaiting" and "rejected" schedule no timer, so the run
  // genuinely waits for a click.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const after = (fn: () => void, ms: number) => {
      timer = setTimeout(fn, ms);
    };

    if (phase.type === "user") {
      const ev = events[phase.idx];
      if (ev.kind !== "user") return;
      if (phase.chars < ev.text.length) {
        after(() => setPhase({ ...phase, chars: phase.chars + 1 }), TYPE_USER_MS);
      } else {
        after(() => setPhase(phaseFor(events, phase.idx + 1)), PAUSE_AFTER_USER);
      }
    } else if (phase.type === "tool-running") {
      after(() => setPhase({ type: "tool-done", idx: phase.idx }), TOOL_RUN_MS);
    } else if (phase.type === "tool-done") {
      after(() => setPhase(phaseFor(events, phase.idx + 1)), PAUSE_AFTER_TOOL);
    } else if (phase.type === "assistant") {
      const ev = events[phase.idx];
      if (ev.kind !== "assistant") return;
      if (phase.chars < ev.text.length) {
        after(() => setPhase({ ...phase, chars: phase.chars + 1 }), TYPE_ASSISTANT_MS);
      } else if (phase.idx >= events.length - 1) {
        after(() => setPhase({ type: "done" }), PAUSE_BEFORE_DONE);
      } else {
        after(() => setPhase(phaseFor(events, phase.idx + 1)), PAUSE_AFTER_TOOL);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [phase, events]);

  const approve = useCallback(() => {
    setPhase((p) => (p.type === "awaiting" ? phaseFor(events, p.idx + 1) : p));
  }, [events]);
  const reject = useCallback(() => {
    setPhase((p) => (p.type === "awaiting" ? { type: "rejected", idx: p.idx } : p));
  }, []);
  const replay = useCallback(() => setPhase(phaseFor(events, 0)), [events]);

  const idx = activeIdx(phase, events.length);
  const statusLabel =
    phase.type === "idle"
      ? labels.status_ready
      : phase.type === "awaiting"
        ? labels.status_awaiting
        : phase.type === "rejected"
          ? labels.status_rejected
          : phase.type === "done"
            ? labels.status_done
            : labels.status_running;
  const activeDot = phase.type !== "idle" && phase.type !== "done" && phase.type !== "rejected";

  const gateState: GateState =
    phase.type === "rejected"
      ? "rejected"
      : idx > gateIdx || phase.type === "done"
        ? "approved"
        : "awaiting";

  return (
    <div ref={containerRef}>
      <style>{`
        @keyframes eve-cursor { 50% { opacity: 0; } }
        @keyframes eve-fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
        @keyframes eve-pulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(0,188,255,0.12); } 50% { box-shadow: 0 0 0 6px rgba(0,188,255,0.04); } }
        @keyframes eve-dot { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
      `}</style>

      <div style={{ background: "var(--bg-tint)", borderRadius: 10, boxShadow: "var(--card-shadow)", overflow: "hidden" }}>
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 16px",
            boxShadow: "inset 0 -1px 0 var(--border-color)",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: activeDot ? "var(--accent)" : "var(--text-muted)",
                animation: activeDot ? "eve-pulse 2s ease-in-out infinite" : "none",
              }}
            />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {statusLabel}
            </span>
          </div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
            @ar-agents/incorporate-agent · eve
          </span>
        </div>

        {/* body */}
        <div
          style={{
            padding: "20px 22px 22px",
            fontFamily: FONT_MONO,
            fontSize: 13,
            lineHeight: 1.65,
            color: "var(--text)",
            minHeight: 360,
          }}
        >
          {events.map((event, i) => {
            if (i > idx) return null;

            if (event.kind === "user") {
              const chars =
                phase.type === "user" && phase.idx === i ? phase.chars : event.text.length;
              return (
                <UserRow
                  key={i}
                  text={event.text.slice(0, chars)}
                  cursor={phase.type === "user" && phase.idx === i && chars < event.text.length}
                />
              );
            }

            if (event.kind === "tool") {
              const state: "running" | "done" =
                i === idx && phase.type === "tool-running" ? "running" : "done";
              return <ToolRow key={i} event={event} state={state} />;
            }

            if (event.kind === "gate") {
              return (
                <GateCard
                  key={i}
                  event={event}
                  state={gateState}
                  labels={labels}
                  onApprove={approve}
                  onReject={reject}
                />
              );
            }

            const chars =
              phase.type === "assistant" && phase.idx === i ? phase.chars : event.text.length;
            return (
              <AssistantRow
                key={i}
                text={event.text.slice(0, chars)}
                cursor={phase.type === "assistant" && phase.idx === i && chars < event.text.length}
              />
            );
          })}

          {phase.type === "done" ? <ResultCard labels={labels} onReplay={replay} /> : null}
          {phase.type === "rejected" ? (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                onClick={replay}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: "transparent",
                  color: "var(--text-body)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontFamily: FONT_MONO,
                  cursor: "pointer",
                  boxShadow: "var(--shadow-ring-light)",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                {labels.run_again}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
