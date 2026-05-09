"use client";

/**
 * Interactive tampering demo embedded on /dashboard. Hits
 * /api/play/tamper-demo with a chosen mutation and renders the
 * before/after, demonstrating that any field-level edit invalidates
 * the HMAC. The point is to make "you can't fake the log" something
 * a regulator can poke at, not just believe.
 */

import { useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

type Mutation = "tool" | "input" | "output" | "ts";

interface Result {
  hmacWired: boolean;
  mutation: Mutation;
  mutationDescription: string;
  original: Record<string, unknown>;
  originalVerified: boolean;
  tampered: Record<string, unknown>;
  tamperedVerified: boolean;
  explanation: string;
}

const MUTATION_LABEL: Record<Mutation, string> = {
  tool: "Falsificar el nombre del tool",
  input: "Cambiar el input",
  output: "Cambiar el output",
  ts: "Mover el timestamp",
};

export function TamperDemo() {
  const [mutation, setMutation] = useState<Mutation>("tool");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/play/tamper-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutation }),
        cache: "no-store",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? r.statusText);
        return;
      }
      const j = (await r.json()) as Result;
      setResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      style={{
        marginTop: 32,
        padding: 18,
        background: "#fff",
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <h2
          style={{
            fontSize: 13,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "0 0 4px",
            fontWeight: 600,
          }}
        >
          Demostración de tampering
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "#4d4d4d",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          Ejecutar este demo construye una entrada sintética, la firma con
          el secret de producción, le aplica una mutación, y verifica
          ambas. Si <code style={{ fontFamily: FONT_MONO }}>tamperedVerified</code>{" "}
          vuelve <code style={{ fontFamily: FONT_MONO }}>false</code>, el
          HMAC está atrapando el cambio. Read-only — no toca ningún audit
          log real.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <label
          htmlFor="tamper-mutation"
          style={{
            fontSize: 12,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          mutación
        </label>
        <select
          id="tamper-mutation"
          value={mutation}
          onChange={(e) => setMutation(e.target.value as Mutation)}
          disabled={pending}
          style={{
            background: "#fff",
            color: "#171717",
            border: 0,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
            fontFamily: "inherit",
            boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
            outline: "none",
          }}
        >
          {(Object.keys(MUTATION_LABEL) as Mutation[]).map((m) => (
            <option key={m} value={m}>
              {MUTATION_LABEL[m]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          style={{
            background: pending ? "#ebebeb" : "#171717",
            color: pending ? "#666" : "#fff",
            border: 0,
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            fontFamily: "inherit",
            fontWeight: 500,
            cursor: pending ? "not-allowed" : "pointer",
          }}
          aria-busy={pending}
        >
          {pending ? "verificando…" : "Ejecutar demo →"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "#fff5f5",
            color: "#c53030",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: FONT_MONO,
          }}
        >
          {error}
        </div>
      )}

      {result && <ResultPanel result={result} />}
    </section>
  );
}

function ResultPanel({ result }: { result: Result }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!result.hmacWired && (
        <div
          style={{
            padding: "10px 14px",
            background: "#fffbe6",
            borderRadius: 6,
            fontSize: 13,
            color: "#856404",
            boxShadow: "rgba(133,100,4,0.2) 0px 0px 0px 1px",
            fontFamily: FONT_MONO,
          }}
        >
          AUDIT_HMAC_SECRET no está cableado en este deploy — el demo es
          informativo pero las firmas son null. Setear el secret en Vercel
          para que la verificación tenga contenido.
        </div>
      )}
      <p
        style={{
          fontSize: 13,
          fontStyle: "italic",
          color: "#4d4d4d",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {result.mutationDescription}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 10,
        }}
      >
        <Card
          title="Original (firmado)"
          verified={result.originalVerified}
          entry={result.original}
        />
        <Card
          title={`Mutado · ${MUTATION_LABEL[result.mutation]}`}
          verified={result.tamperedVerified}
          entry={result.tampered}
        />
      </div>
      <p
        style={{
          fontSize: 12,
          color: "#666",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        {result.explanation}
      </p>
    </div>
  );
}

function Card({
  title,
  verified,
  entry,
}: {
  title: string;
  verified: boolean;
  entry: Record<string, unknown>;
}) {
  const tone = verified ? "#0a72ef" : "#ff5b4f";
  const bg = verified ? "#ebf5ff" : "#fff1f0";
  const label = verified ? "VERIFIED ✓" : "TAMPERED ✗";
  return (
    <article
      style={{
        background: "#fff",
        borderRadius: 6,
        boxShadow: SHADOW_BORDER,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontFamily: FONT_MONO,
            color: "#171717",
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span
          style={{
            background: bg,
            color: tone,
            padding: "1px 10px",
            borderRadius: 9999,
            fontSize: 11,
            fontFamily: FONT_MONO,
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
      <pre
        style={{
          background: "#fafafa",
          padding: 10,
          borderRadius: 4,
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "#4d4d4d",
          margin: 0,
          overflowX: "auto",
          boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {JSON.stringify(entry, null, 2)}
      </pre>
    </article>
  );
}
