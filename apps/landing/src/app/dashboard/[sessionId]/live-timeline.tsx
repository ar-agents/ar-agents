"use client";

/**
 * Client-side live overlay for /dashboard/[sessionId].
 *
 * Server component renders the initial timeline from the audit log.
 * This component opens an EventSource against /api/play/audit-stream/{id}
 * and merges any newly-arriving entries into the rendered list. Browsers
 * that lack EventSource (or where it fails) silently degrade to the
 * static initial render — no functional regression.
 *
 * Pattern: receive initial entries via prop, maintain a Set of seen ids,
 * append new ones in chronological order. Show a "● live" indicator
 * when connected, and a gentle "reconnecting" state on transient drops
 * (EventSource auto-reconnects; the indicator just reflects current
 * status).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { AuditEntry } from "@/lib/audit";
import { GOVERNANCE_COLOR, GOVERNANCE_LABEL } from "@/app/play/scenarios";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px";

type ConnState = "connecting" | "open" | "closed" | "error";

export function LiveTimeline({
  sessionId,
  initialEntries,
  hmacWired,
}: {
  sessionId: string;
  initialEntries: AuditEntry[];
  hmacWired: boolean;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>(initialEntries);
  const [conn, setConn] = useState<ConnState>("connecting");
  const seenIds = useRef<Set<string>>(new Set(initialEntries.map((e) => e.id)));
  const newEntryIds = useRef<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setConn("closed");
      return;
    }
    const url = `/api/play/audit-stream/${encodeURIComponent(sessionId)}`;
    const es = new EventSource(url);
    setConn("connecting");

    const onOpen = () => setConn("open");
    const onError = () => setConn("error");
    const onEntry = (ev: MessageEvent<string>) => {
      try {
        const entry = JSON.parse(ev.data) as AuditEntry;
        if (seenIds.current.has(entry.id)) return;
        seenIds.current.add(entry.id);
        newEntryIds.current.add(entry.id);
        setEntries((prev) => [...prev, entry]);
        setHighlight((prev) => new Set(prev).add(entry.id));
        // Drop the "new" highlight after 2 seconds.
        setTimeout(() => {
          setHighlight((prev) => {
            const next = new Set(prev);
            next.delete(entry.id);
            return next;
          });
        }, 2000);
      } catch {
        // ignore malformed
      }
    };
    const onSnapshotComplete = () => {
      // Initial server-rendered set + the SSE snapshot are now reconciled.
      setConn("open");
    };
    const onPing = () => {
      // keep-alive; no-op
    };
    const onEnd = () => {
      setConn("closed");
      es.close();
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    es.addEventListener("entry", onEntry as EventListener);
    es.addEventListener("snapshot-complete", onSnapshotComplete);
    es.addEventListener("ping", onPing);
    es.addEventListener("end", onEnd);

    return () => {
      es.removeEventListener("open", onOpen);
      es.removeEventListener("error", onError);
      es.removeEventListener("entry", onEntry as EventListener);
      es.removeEventListener("snapshot-complete", onSnapshotComplete);
      es.removeEventListener("ping", onPing);
      es.removeEventListener("end", onEnd);
      es.close();
    };
  }, [sessionId]);

  const sorted = useMemo(
    () =>
      entries
        .slice()
        .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)),
    [entries],
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "var(--text-muted, #666)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background:
              conn === "open"
                ? "#22c55e"
                : conn === "connecting"
                  ? "#eab308"
                  : "#999",
            animation: conn === "open" ? "pulse 1.6s ease-in-out infinite" : undefined,
          }}
        />
        <span>
          {conn === "open"
            ? "live · escuchando nuevas entradas"
            : conn === "connecting"
              ? "conectando…"
              : conn === "error"
                ? "reconectando…"
                : "stream cerrado (5min cap; recargá para retomar)"}
        </span>
        <span style={{ marginLeft: "auto", color: "#666" }}>
          {entries.length} {entries.length === 1 ? "entrada" : "entradas"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {sorted.length === 0 ? (
          <article
            style={{
              background: "#fff",
              padding: 14,
              borderRadius: 8,
              boxShadow: SHADOW_CARD,
              fontSize: 13,
              color: "var(--text-muted, #666)",
              textAlign: "center",
            }}
          >
            Esta sesión todavía no tiene tool calls. El stream va a empujarlas acá apenas la escritura llegue a Vercel KV.
          </article>
        ) : (
          sorted.map((e) => (
            <TimelineEntry
              key={e.id}
              entry={e}
              hmacWired={hmacWired}
              highlight={highlight.has(e.id)}
            />
          ))
        )}
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes flashIn {
          0% {
            background: #ebf5ff;
            box-shadow: rgba(10, 114, 239, 0.5) 0 0 0 2px;
          }
          100% {
            background: #ffffff;
            box-shadow: rgba(0, 0, 0, 0.08) 0px 0px 0px 1px,
              rgba(0, 0, 0, 0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px;
          }
        }
      `}</style>
    </>
  );
}

function TimelineEntry({
  entry,
  hmacWired,
  highlight,
}: {
  entry: AuditEntry;
  hmacWired: boolean;
  highlight: boolean;
}) {
  const govColor =
    GOVERNANCE_COLOR[entry.governance] ?? { fg: "#666", bg: "#f5f5f5" };
  const govLabel = GOVERNANCE_LABEL[entry.governance] ?? entry.governance;
  const date = new Date(entry.ts);
  const ts = `${date.toISOString().slice(11, 19)}Z`;
  const ymd = date.toISOString().slice(0, 10);
  return (
    <article
      style={{
        background: "#ffffff",
        padding: 14,
        borderRadius: 8,
        boxShadow: SHADOW_CARD,
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 14,
        animation: highlight ? "flashIn 2s ease-out" : undefined,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: "#666",
          letterSpacing: "0.04em",
        }}
      >
        <div style={{ color: "#171717", fontWeight: 500 }}>{ts}</div>
        <div style={{ marginTop: 2 }}>{ymd}</div>
        {typeof entry.durationMs === "number" && (
          <div style={{ marginTop: 6 }}>{entry.durationMs}ms</div>
        )}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <code
            style={{
              fontFamily: FONT_MONO,
              fontSize: 14,
              color: "#171717",
              fontWeight: 600,
            }}
          >
            {entry.tool}
          </code>
          <Pill color={govColor.fg} bg={govColor.bg}>
            {govLabel}
          </Pill>
          {entry.errored && (
            <Pill color="#ff5b4f" bg="#fff1f0">
              ERRORED
            </Pill>
          )}
        </div>

        <details style={{ marginTop: 4 }}>
          <summary
            style={{
              fontSize: 11,
              fontFamily: FONT_MONO,
              color: "#666",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            input / output
          </summary>
          <pre
            style={{
              background: "#fafafa",
              padding: 10,
              borderRadius: 4,
              fontSize: 11,
              fontFamily: FONT_MONO,
              color: "#4d4d4d",
              margin: "6px 0 0",
              overflowX: "auto",
              boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
{JSON.stringify({ input: entry.input, output: entry.output }, null, 2)}
          </pre>
        </details>

        {hmacWired && entry.hmac && (
          <code
            style={{
              display: "inline-block",
              marginTop: 8,
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: "#7928ca",
              background: "#f5edfd",
              padding: "2px 8px",
              borderRadius: 4,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={entry.hmac}
          >
            {entry.hmac.slice(0, 26)}…
          </code>
        )}
      </div>
    </article>
  );
}

function Pill({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        color,
        borderRadius: 9999,
        padding: "1px 10px",
        fontSize: 11,
        fontFamily: FONT_MONO,
        fontWeight: 500,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
