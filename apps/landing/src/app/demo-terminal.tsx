"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./i18n";
import { getScenarios, type Event, type Scenario, type ToolEvent } from "./demo-scripts";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";

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

function nextEventPhase(events: ReadonlyArray<Event>, idx: number): Phase {
  const ev = events[idx];
  if (!ev) return { type: "done" };
  if (ev.kind === "user") return { type: "user", idx, chars: 0 };
  if (ev.kind === "tool") return { type: "tool-running", idx };
  return { type: "assistant", idx, chars: 0 };
}

function currentIdx(p: Phase, total: number): number {
  if (p.type === "idle") return -1;
  if (p.type === "done") return total;
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
  const active = phase.type !== "idle" && phase.type !== "done";
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
  const { t } = useLang();
  let label = t.demo_status_ready;
  if (phase.type === "user") label = t.demo_status_user;
  if (phase.type === "tool-running") label = t.demo_status_tool_running;
  if (phase.type === "tool-done") label = t.demo_status_tool_done;
  if (phase.type === "assistant") label = t.demo_status_assistant;
  if (phase.type === "done") label = t.demo_status_done;
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
}: {
  text: string;
  showCursor: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginBottom: 16,
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
}: {
  text: string;
  showCursor: boolean;
}) {
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
    <div style={{ marginTop: 16 }}>
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

function CheckBadge() {
  return (
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
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

function ResultCard({
  result,
  onReplay,
}: {
  result: Scenario["result"];
  onReplay: () => void;
}) {
  const { t } = useLang();
  return (
    <div
      style={{
        marginTop: 24,
        padding: "20px 22px",
        background: "var(--bg)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        animation: "demo-fade-in 360ms ease-out",
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <CheckBadge />
        <span
          style={{
            fontWeight: 500,
            fontSize: 15,
            letterSpacing: "-0.16px",
            color: "var(--text)",
          }}
        >
          {result.title}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onReplay}
          aria-label={t.demo_replay}
          title={t.demo_replay}
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
          {t.demo_replay}
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
        {result.fields.map(([label, value]) => (
          <span key={label} style={{ display: "contents" }}>
            <span
              style={{
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontSize: 11,
                alignSelf: "center",
              }}
            >
              {label}
            </span>
            <span style={{ color: "var(--text)" }}>{value}</span>
          </span>
        ))}
      </div>

      <a
        href={result.cta.href}
        target="_blank"
        rel="noopener noreferrer"
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
        {result.cta.label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </a>
    </div>
  );
}

function ScenarioTabs({
  scenarios,
  activeId,
  onChange,
}: {
  scenarios: ReadonlyArray<Scenario>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        boxShadow: "inset 0 -1px 0 var(--border-color)",
      }}
    >
      {scenarios.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.id)}
            style={{
              position: "relative",
              padding: "10px 14px",
              background: "transparent",
              color: active ? "var(--text)" : "var(--text-muted)",
              fontFamily: FONT_MONO,
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              letterSpacing: "0.02em",
              border: "none",
              cursor: "pointer",
              transition: "color 160ms ease-out",
              borderRadius: 0,
            }}
          >
            {s.label}
            {active ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 14,
                  right: 14,
                  bottom: -1,
                  height: 1,
                  background: "var(--accent)",
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function DemoTerminal() {
  const { lang, t } = useLang();
  const scenarios = useMemo(() => getScenarios(lang), [lang]);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [hasStarted, setHasStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const { events } = scenario;

  // Start when scrolled into view.
  useEffect(() => {
    if (hasStarted) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHasStarted(true);
          setPhase(nextEventPhase(events, 0));
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasStarted, events]);

  // Phase machine.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const schedule = (fn: () => void, delay: number) => {
      timeout = setTimeout(fn, delay);
    };

    if (phase.type === "user") {
      const ev = events[phase.idx];
      if (ev.kind !== "user") return;
      if (phase.chars < ev.text.length) {
        schedule(
          () => setPhase({ ...phase, chars: phase.chars + 1 }),
          TYPE_USER_MS,
        );
      } else {
        schedule(
          () => setPhase(nextEventPhase(events, phase.idx + 1)),
          PAUSE_AFTER_USER,
        );
      }
    } else if (phase.type === "tool-running") {
      schedule(
        () => setPhase({ type: "tool-done", idx: phase.idx }),
        TOOL_RUN_MS,
      );
    } else if (phase.type === "tool-done") {
      schedule(
        () => setPhase(nextEventPhase(events, phase.idx + 1)),
        PAUSE_AFTER_TOOL,
      );
    } else if (phase.type === "assistant") {
      const ev = events[phase.idx];
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
  }, [phase, events]);

  const replay = useCallback(() => {
    setPhase(nextEventPhase(events, 0));
  }, [events]);

  // Auto-advance to next scenario after each "done", stopping at the last
  // one so the recording has a clean end (no loop back to Subscription).
  useEffect(() => {
    if (phase.type !== "done") return;
    const currentIdx = scenarios.findIndex((s) => s.id === scenarioId);
    if (currentIdx === scenarios.length - 1) return;
    const timeout = setTimeout(() => {
      const next = scenarios[currentIdx + 1];
      setScenarioId(next.id);
      setPhase(nextEventPhase(next.events, 0));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [phase, scenarioId, scenarios]);

  const switchScenario = useCallback(
    (id: string) => {
      if (id === scenarioId) return;
      const target = scenarios.find((s) => s.id === id);
      if (!target) return;
      setScenarioId(id);
      // Reset and restart with the new scenario's first event.
      setPhase(nextEventPhase(target.events, 0));
    },
    [scenarioId, scenarios],
  );

  const idx = currentIdx(phase, events.length);

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
        {/* HEADER: status + scenario tabs + package label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px 0",
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

        <div style={{ padding: "12px 6px 0" }}>
          <ScenarioTabs
            scenarios={scenarios}
            activeId={scenarioId}
            onChange={switchScenario}
          />
        </div>

        {/* BODY */}
        <div
          key={scenarioId}
          style={{
            padding: "20px 24px 24px",
            fontFamily: FONT_MONO,
            fontSize: 13,
            lineHeight: 1.65,
            color: "var(--text)",
            // Pre-allocate enough height for the tallest scenario's
            // transcript + ResultCard so the container never grows.
            // Recovery (5 events + multiline result card) is the cap.
            height: 780,
            overflow: "hidden",
          }}
        >
          {events.map((event, i) => {
            if (i > idx) return null;

            if (event.kind === "user") {
              const chars =
                phase.type === "user" && phase.idx === i
                  ? phase.chars
                  : event.text.length;
              const isCurrent = i === idx && phase.type === "user";
              return (
                <UserRow
                  key={`${scenarioId}-${i}`}
                  text={event.text.slice(0, chars)}
                  showCursor={isCurrent && chars < event.text.length}
                />
              );
            }

            if (event.kind === "tool") {
              const isCurrent = i === idx;
              const state: "running" | "done" =
                isCurrent && phase.type === "tool-running" ? "running" : "done";
              return (
                <ToolRow
                  key={`${scenarioId}-${i}`}
                  event={event}
                  state={state}
                />
              );
            }

            const chars =
              phase.type === "assistant" && phase.idx === i
                ? phase.chars
                : event.text.length;
            const isCurrent = i === idx && phase.type === "assistant";
            return (
              <AssistantRow
                key={`${scenarioId}-${i}`}
                text={event.text.slice(0, chars)}
                showCursor={isCurrent && chars < event.text.length}
              />
            );
          })}

          {phase.type === "done" ? (
            <ResultCard result={scenario.result} onReplay={replay} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
