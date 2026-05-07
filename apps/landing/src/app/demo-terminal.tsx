"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type ToolEvent = {
  kind: "tool";
  name: string;
  args: Record<string, string | number | boolean>;
  result: Record<string, string | number | boolean>;
};

type Event =
  | { kind: "user"; text: string }
  | ToolEvent
  | { kind: "assistant"; text: string };

const SCRIPT: ReadonlyArray<Event> = [
  {
    kind: "user",
    text: "Creá una subscription mensual de $1000 ARS para customer@example.com",
  },
  {
    kind: "tool",
    name: "find_customer_by_email",
    args: { email: "customer@example.com" },
    result: { found: false },
  },
  {
    kind: "tool",
    name: "create_customer",
    args: { email: "customer@example.com" },
    result: { id: "1234567890", email: "customer@example.com" },
  },
  {
    kind: "tool",
    name: "create_subscription",
    args: { amount: 1000, frequency: "monthly", customer_id: "1234567890" },
    result: {
      id: "abc-123",
      init_point:
        "https://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
    },
  },
  {
    kind: "assistant",
    text: "Listo, creé la subscription mensual de $1000 ARS para customer@example.com.\nMandale este link para que pague:\nhttps://mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc-123",
  },
];

const TYPE_USER_MS = 24;
const TYPE_ASSISTANT_MS = 14;
const TOOL_RUN_MS = 650;
const PAUSE_AFTER_USER = 500;
const PAUSE_AFTER_TOOL = 280;
const PAUSE_AFTER_ASSISTANT_BEFORE_DONE = 1200;

type Phase =
  | { type: "idle" }
  | { type: "user"; idx: number; chars: number }
  | { type: "tool-running"; idx: number }
  | { type: "tool-done"; idx: number }
  | { type: "assistant"; idx: number; chars: number }
  | { type: "done" };

function nextEventPhase(idx: number): Phase {
  const ev = SCRIPT[idx];
  if (!ev) return { type: "done" };
  if (ev.kind === "user") return { type: "user", idx, chars: 0 };
  if (ev.kind === "tool") return { type: "tool-running", idx };
  return { type: "assistant", idx, chars: 0 };
}

function currentIdx(p: Phase): number {
  if (p.type === "idle") return -1;
  if (p.type === "done") return SCRIPT.length;
  return p.idx;
}

function fmtValue(v: string | number | boolean): React.ReactNode {
  if (typeof v === "string") {
    return (
      <>
        <span style={{ color: "var(--text-muted)" }}>&quot;</span>
        <span style={{ color: "var(--text)" }}>{v}</span>
        <span style={{ color: "var(--text-muted)" }}>&quot;</span>
      </>
    );
  }
  if (typeof v === "number") {
    return <span style={{ color: "var(--text)" }}>{v}</span>;
  }
  return <span style={{ color: "var(--text)" }}>{String(v)}</span>;
}

function fmtObject(
  obj: Record<string, string | number | boolean>,
): React.ReactNode {
  const entries = Object.entries(obj);
  // Heuristic: if any string value is long, render multiline; else single line.
  const longValue = entries.some(
    ([, v]) => typeof v === "string" && v.length > 36,
  );
  if (longValue) {
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
        animation: "demo-cursor 1.05s steps(1) infinite",
      }}
    />
  );
}

function RunningDots() {
  return (
    <span style={{ color: "var(--text-muted)" }}>
      <span style={{ animation: "demo-dot 1.2s infinite", animationDelay: "0s" }}>.</span>
      <span style={{ animation: "demo-dot 1.2s infinite", animationDelay: "0.18s" }}>.</span>
      <span style={{ animation: "demo-dot 1.2s infinite", animationDelay: "0.36s" }}>.</span>
    </span>
  );
}

function StatusDot({ phase }: { phase: Phase }) {
  const active =
    phase.type !== "idle" && phase.type !== "done";
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 9999,
        background: active ? "var(--accent)" : "var(--text-muted)",
        boxShadow: active ? "0 0 0 4px rgba(0, 188, 255, 0.12)" : "none",
        animation: active ? "demo-pulse 2s ease-in-out infinite" : "none",
        transition: "background 200ms",
      }}
    />
  );
}

function StatusLabel({ phase }: { phase: Phase }) {
  let label = "ready";
  if (phase.type === "user") label = "receiving prompt";
  if (phase.type === "tool-running") label = "calling tool";
  if (phase.type === "tool-done") label = "tool ok";
  if (phase.type === "assistant") label = "responding";
  if (phase.type === "done") label = "done";
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        color: "var(--text-muted)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function UserRow({
  text,
  showCursor,
  fadeIn,
}: {
  text: string;
  showCursor: boolean;
  fadeIn: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginBottom: 16,
        opacity: fadeIn ? 0 : 1,
        animation: fadeIn ? "demo-fade-in 200ms ease-out forwards" : "none",
      }}
    >
      <span style={{ color: "var(--text-muted)", userSelect: "none" }}>{">"}</span>
      <span style={{ color: "var(--text)", whiteSpace: "pre-wrap", flex: 1 }}>
        {text}
        {showCursor ? <Cursor /> : null}
      </span>
    </div>
  );
}

function ToolRow({
  event,
  state,
}: {
  event: ToolEvent;
  state: "running" | "done";
}) {
  return (
    <div
      style={{
        marginBottom: 12,
        animation: "demo-fade-in 200ms ease-out",
      }}
    >
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ color: "var(--text-muted)", userSelect: "none" }}>→</span>
        <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
          <span style={{ color: "var(--accent)", fontWeight: 500 }}>
            {event.name}
          </span>
          <span style={{ color: "var(--text-muted)" }}>(</span>
          {fmtObject(event.args)}
          <span style={{ color: "var(--text-muted)" }}>)</span>
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
            fmtObject(event.result)
          )}
        </span>
      </div>
    </div>
  );
}

function AssistantRow({
  text,
  showCursor,
  fadeIn,
}: {
  text: string;
  showCursor: boolean;
  fadeIn: boolean;
}) {
  // Detect URLs and render them in accent color while preserving streaming.
  const URL_RE = /(https?:\/\/[^\s]+)/g;
  const parts: Array<{ kind: "text" | "url"; value: string }> = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    if (match.index === undefined) continue;
    if (match.index > last)
      parts.push({ kind: "text", value: text.slice(last, match.index) });
    parts.push({ kind: "url", value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length)
    parts.push({ kind: "text", value: text.slice(last) });

  return (
    <div
      style={{
        marginTop: 16,
        opacity: fadeIn ? 0 : 1,
        animation: fadeIn ? "demo-fade-in 240ms ease-out forwards" : "none",
      }}
    >
      <div
        style={{
          color: "var(--text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {parts.map((p, i) =>
          p.kind === "url" ? (
            <span key={i} style={{ color: "var(--accent)" }}>
              {p.value}
            </span>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
        {showCursor ? <Cursor /> : null}
      </div>
    </div>
  );
}

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 20,
        padding: "6px 12px",
        background: "transparent",
        color: "var(--text-muted)",
        boxShadow: "var(--shadow-ring-light)",
        borderRadius: 6,
        fontSize: 12,
        fontFamily: FONT_MONO,
        cursor: "pointer",
        border: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        animation: "demo-fade-in 320ms ease-out",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
      Replay
    </button>
  );
}

export function DemoTerminal() {
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [hasStarted, setHasStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Start when scrolled into view.
  useEffect(() => {
    if (hasStarted) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHasStarted(true);
          setPhase(nextEventPhase(0));
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasStarted]);

  // Phase machine.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const schedule = (fn: () => void, delay: number) => {
      timeout = setTimeout(fn, delay);
    };

    if (phase.type === "user") {
      const ev = SCRIPT[phase.idx];
      if (ev.kind !== "user") return;
      if (phase.chars < ev.text.length) {
        schedule(
          () => setPhase({ ...phase, chars: phase.chars + 1 }),
          TYPE_USER_MS,
        );
      } else {
        schedule(() => setPhase(nextEventPhase(phase.idx + 1)), PAUSE_AFTER_USER);
      }
    } else if (phase.type === "tool-running") {
      schedule(
        () => setPhase({ type: "tool-done", idx: phase.idx }),
        TOOL_RUN_MS,
      );
    } else if (phase.type === "tool-done") {
      schedule(() => setPhase(nextEventPhase(phase.idx + 1)), PAUSE_AFTER_TOOL);
    } else if (phase.type === "assistant") {
      const ev = SCRIPT[phase.idx];
      if (ev.kind !== "assistant") return;
      if (phase.chars < ev.text.length) {
        schedule(
          () => setPhase({ ...phase, chars: phase.chars + 1 }),
          TYPE_ASSISTANT_MS,
        );
      } else {
        schedule(
          () => setPhase({ type: "done" }),
          PAUSE_AFTER_ASSISTANT_BEFORE_DONE,
        );
      }
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [phase]);

  const replay = useCallback(() => {
    setPhase(nextEventPhase(0));
  }, []);

  const idx = currentIdx(phase);

  return (
    <div ref={containerRef}>
      <style>{`
        @keyframes demo-cursor {
          50% { opacity: 0; }
        }
        @keyframes demo-fade-in {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes demo-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(0, 188, 255, 0.12); }
          50% { box-shadow: 0 0 0 6px rgba(0, 188, 255, 0.04); }
        }
        @keyframes demo-dot {
          0%, 60%, 100% { opacity: 0.25; }
          30% { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          background: "var(--bg-tint)",
          borderRadius: 8,
          boxShadow: "var(--card-shadow)",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            boxShadow: "inset 0 -1px 0 var(--border-color)",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusDot phase={phase} />
            <StatusLabel phase={phase} />
          </div>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
            }}
          >
            @ar-agents/mercadopago
          </span>
        </div>

        {/* BODY */}
        <div
          style={{
            padding: "20px 24px 24px",
            fontFamily: FONT_MONO,
            fontSize: 13,
            lineHeight: 1.65,
            color: "var(--text)",
            minHeight: 380,
          }}
        >
          {SCRIPT.map((event, i) => {
            if (i > idx) return null;

            if (event.kind === "user") {
              const chars =
                phase.type === "user" && phase.idx === i
                  ? phase.chars
                  : event.text.length;
              const isCurrent = i === idx && phase.type === "user";
              return (
                <UserRow
                  key={i}
                  text={event.text.slice(0, chars)}
                  showCursor={isCurrent && chars < event.text.length}
                  fadeIn={chars === 1}
                />
              );
            }

            if (event.kind === "tool") {
              const isCurrent = i === idx;
              const state: "running" | "done" =
                isCurrent && phase.type === "tool-running" ? "running" : "done";
              return <ToolRow key={i} event={event} state={state} />;
            }

            // assistant
            const chars =
              phase.type === "assistant" && phase.idx === i
                ? phase.chars
                : event.text.length;
            const isCurrent = i === idx && phase.type === "assistant";
            return (
              <AssistantRow
                key={i}
                text={event.text.slice(0, chars)}
                showCursor={isCurrent && chars < event.text.length}
                fadeIn={chars === 1}
              />
            );
          })}

          {phase.type === "done" ? <ReplayButton onClick={replay} /> : null}
        </div>
      </div>
    </div>
  );
}
