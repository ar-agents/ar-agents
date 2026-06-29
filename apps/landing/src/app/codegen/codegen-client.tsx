"use client";

/**
 * /codegen, multi-language code generator for /api/auto-incorporate.
 *
 * User fills in a form, gets equivalent snippets for TypeScript (via
 * @ar-agents/incorporate), Python (via ar-agents-incorporate), Go
 * (stdlib net/http), Rust (reqwest), curl, and HTTPie. Each snippet
 * has its own copy button. Pure client component, every generator
 * is a pure function over the same input model.
 */

import { useMemo, useState } from "react";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px";

interface FormState {
  denominacion: string;
  tipo: "SAS" | "SRL" | "SA" | "SOCIEDAD-IA";
  capitalSocial: number;
  objeto: string;
  emailContacto: string;
  representanteNombre: string;
  representanteCuit: string;
}

const DEFAULT_STATE: FormState = {
  denominacion: "ACME-AI SAS",
  tipo: "SOCIEDAD-IA",
  capitalSocial: 1,
  objeto:
    "Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
  emailContacto: "ops@acme-ai.example",
  representanteNombre: "Pérez, Juan",
  representanteCuit: "20-12345678-9",
};

const LANGUAGES = [
  "typescript",
  "python",
  "go",
  "rust",
  "curl",
  "httpie",
] as const;

type Language = (typeof LANGUAGES)[number];

const LANG_LABEL: Record<Language, string> = {
  typescript: "TypeScript (@ar-agents/incorporate)",
  python: "Python (ar-agents-incorporate)",
  go: "Go (net/http stdlib)",
  rust: "Rust (reqwest)",
  curl: "curl",
  httpie: "HTTPie",
};

const LANG_COLOR: Record<Language, string> = {
  typescript: "#0a72ef",
  python: "#7928ca",
  go: "#06b6d4",
  rust: "#d97706",
  curl: "#666666",
  httpie: "#666666",
};

// ─────────────────────────────────────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────────────────────────────────────

function generateTypescript(s: FormState): string {
  return `import { incorporate } from "@ar-agents/incorporate";

const result = await incorporate({
  denominacion: ${JSON.stringify(s.denominacion)},
  tipo: ${JSON.stringify(s.tipo)},
  capitalSocial: ${s.capitalSocial},
  objeto: ${JSON.stringify(s.objeto)},${
    s.emailContacto
      ? `
  emailContacto: ${JSON.stringify(s.emailContacto)},`
      : ""
  }${
    s.representanteNombre && s.representanteCuit
      ? `
  representante: {
    nombre: ${JSON.stringify(s.representanteNombre)},
    cuit: ${JSON.stringify(s.representanteCuit)},
  },`
      : ""
  }
});

if (!result.ok) {
  for (const f of result.validation.findings) {
    console.error(\`[\${f.severity}] \${f.field}: \${f.message}\`);
  }
  process.exit(1);
}

console.log("Slug:        ", result.sociedad.slug);
console.log("Deploy URL:  ", result.deploy.oneClickUrl);
console.log("Audit log:   ", result.audit.dashboardUrl);
console.log("HMAC:        ", result.audit.entry.hmac);`;
}

function generatePython(s: FormState): string {
  const repBlock =
    s.representanteNombre && s.representanteCuit
      ? `
    representante=Representante(
        nombre=${JSON.stringify(s.representanteNombre)},
        cuit=${JSON.stringify(s.representanteCuit)},
    ),`
      : "";
  return `from ar_agents_incorporate import incorporate${
    repBlock ? ", Representante" : ""
  }

result = incorporate(
    denominacion=${JSON.stringify(s.denominacion)},
    tipo=${JSON.stringify(s.tipo)},
    capital_social=${s.capitalSocial},
    objeto=${JSON.stringify(s.objeto)},${
      s.emailContacto
        ? `
    email_contacto=${JSON.stringify(s.emailContacto)},`
        : ""
    }${repBlock}
)

if not result.ok:
    for f in result.validation.findings:
        print(f"[{f.severity}] {f.field}: {f.message}")
    raise SystemExit(1)

print("Slug:       ", result.sociedad.slug)
print("Deploy URL: ", result.deploy.one_click_url)
print("Audit log:  ", result.audit.dashboard_url)
print("HMAC:       ", result.audit.entry.hmac)`;
}

function buildJsonBody(s: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    denominacion: s.denominacion,
    tipo: s.tipo,
    capitalSocial: s.capitalSocial,
    objeto: s.objeto,
  };
  if (s.emailContacto) body.emailContacto = s.emailContacto;
  if (s.representanteNombre && s.representanteCuit) {
    body.representante = {
      nombre: s.representanteNombre,
      cuit: s.representanteCuit,
    };
  }
  return body;
}

function generateGo(s: FormState): string {
  const body = buildJsonBody(s);
  const json = JSON.stringify(body, null, 2)
    .split("\n")
    .map((l) => `\t\t\t${l}`)
    .join("\n");
  return `package main

import (
\t"bytes"
\t"encoding/json"
\t"fmt"
\t"io"
\t"net/http"
\t"os"
)

func main() {
\tbody := []byte(\`${JSON.stringify(body)}\`)
\t_ = body
\t// Or, for readability:
\tpayload := map[string]any{
${json
  .replace(/^\t\t\t{/, "")
  .replace(/}$/, "")
  .replace(/^/gm, "\t\t")
  .replace(/^\t\t$/gm, "")}
\t}
\tb, _ := json.Marshal(payload)

\treq, _ := http.NewRequest(
\t\t"POST",
\t\t"https://ar-agents.ar/api/auto-incorporate",
\t\tbytes.NewReader(b),
\t)
\treq.Header.Set("Content-Type", "application/json")
\treq.Header.Set("User-Agent", "ar-agents-codegen/go")

\tresp, err := http.DefaultClient.Do(req)
\tif err != nil {
\t\tfmt.Fprintln(os.Stderr, "request failed:", err)
\t\tos.Exit(1)
\t}
\tdefer resp.Body.Close()

\tout, _ := io.ReadAll(resp.Body)
\tif resp.StatusCode == 200 {
\t\tfmt.Println("OK:", string(out))
\t} else if resp.StatusCode == 422 {
\t\tfmt.Fprintln(os.Stderr, "validation failed:", string(out))
\t\tos.Exit(1)
\t} else {
\t\tfmt.Fprintf(os.Stderr, "HTTP %d: %s\\n", resp.StatusCode, string(out))
\t\tos.Exit(1)
\t}
}`;
}

function generateRust(s: FormState): string {
  const body = buildJsonBody(s);
  const jsonStr = JSON.stringify(body);
  return `// Cargo.toml:
//   reqwest = { version = "0.12", features = ["json", "blocking"] }
//   serde_json = "1"

use serde_json::{json, Value};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let body: Value = serde_json::from_str(r##"${jsonStr}"##)?;

    let resp = reqwest::blocking::Client::new()
        .post("https://ar-agents.ar/api/auto-incorporate")
        .header("user-agent", "ar-agents-codegen/rust")
        .json(&body)
        .send()?;

    let status = resp.status();
    let json: Value = resp.json()?;

    if status == 200 {
        println!("OK: {}", json);
    } else if status == 422 {
        eprintln!("validation failed: {}", json);
        std::process::exit(1);
    } else {
        eprintln!("HTTP {}: {}", status, json);
        std::process::exit(1);
    }
    Ok(())
}`;
}

function generateCurl(s: FormState): string {
  const body = buildJsonBody(s);
  const json = JSON.stringify(body, null, 2);
  return `curl -X POST https://ar-agents.ar/api/auto-incorporate \\
  -H "Content-Type: application/json" \\
  -d '${json.replace(/'/g, "'\\''")}'`;
}

function generateHttpie(s: FormState): string {
  const body = buildJsonBody(s);
  const fields = Object.entries(body)
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}=${JSON.stringify(v)}`;
      if (typeof v === "number") return `${k}:=${v}`;
      return `${k}:=${JSON.stringify(v)}`;
    })
    .join(" \\\n  ");
  return `http POST https://ar-agents.ar/api/auto-incorporate \\
  ${fields}`;
}

const GENERATORS: Record<Language, (s: FormState) => string> = {
  typescript: generateTypescript,
  python: generatePython,
  go: generateGo,
  rust: generateRust,
  curl: generateCurl,
  httpie: generateHttpie,
};

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

export function CodegenClient() {
  const [state, setState] = useState<FormState>(DEFAULT_STATE);
  const [activeLang, setActiveLang] = useState<Language>("typescript");

  const snippets = useMemo(
    () =>
      Object.fromEntries(
        LANGUAGES.map((l) => [l, GENERATORS[l](state)]),
      ) as Record<Language, string>,
    [state],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  };

  const active = snippets[activeLang];

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "48px 24px 96px",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <p
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: 0,
          }}
        >
          codegen · multi-lang snippets
        </p>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: "#171717",
            letterSpacing: "-1.6px",
            lineHeight: 1.0,
            margin: "8px 0 12px",
          }}
        >
          Generate the incorporate() snippet
          <br />
          in your language.
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "#4d4d4d",
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          Fill in your automated company&apos;s details, get equivalent code
          in 6 languages. Copy, paste, run. The form fields mirror{" "}
          <code style={{ fontFamily: FONT_MONO }}>POST /api/auto-incorporate</code>
          &apos;s input schema. Everything happens client-side, no data
          leaves your browser until you actually run the snippet.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)",
          gap: 24,
          alignItems: "start",
        }}
      >
        <form
          onSubmit={(e) => e.preventDefault()}
          style={{
            background: "#fff",
            padding: 18,
            borderRadius: 8,
            boxShadow: SHADOW_CARD,
            display: "grid",
            gap: 14,
          }}
          aria-label="Automated company parameters"
        >
          <Field
            label="Denominación"
            value={state.denominacion}
            onChange={(v) => set("denominacion", v)}
            placeholder="ACME-AI SAS"
            help="3-200 chars. IGJ rejects reserved words (Nacional, Estatal, etc)."
          />
          <FieldGrid>
            <FieldSelect
              label="Tipo"
              value={state.tipo}
              onChange={(v) => set("tipo", v as FormState["tipo"])}
              options={["SAS", "SRL", "SA", "SOCIEDAD-IA"]}
              help="SOCIEDAD-IA gated by AR regime; currently uses SAS template."
            />
            <FieldNumber
              label="Capital social (ARS)"
              value={state.capitalSocial}
              onChange={(v) => set("capitalSocial", v)}
              help="SAS/SRL: ≥ 100K. SOCIEDAD-IA: ≥ 1."
            />
          </FieldGrid>
          <FieldTextarea
            label="Objeto social"
            value={state.objeto}
            onChange={(v) => set("objeto", v)}
            placeholder="Operación de servicios digitales..."
            help="20-2000 chars. IGJ rejects generic phrasing."
          />
          <Field
            label="Email contacto"
            value={state.emailContacto}
            onChange={(v) => set("emailContacto", v)}
            placeholder="ops@example.com"
            help="Optional. Used by the platform for human-touch escalations."
          />
          <FieldGrid>
            <Field
              label="Representante nombre"
              value={state.representanteNombre}
              onChange={(v) => set("representanteNombre", v)}
              placeholder="Pérez, Juan"
              help="Optional pre-launch. Required at IGJ submission."
            />
            <Field
              label="Representante CUIT"
              value={state.representanteCuit}
              onChange={(v) => set("representanteCuit", v)}
              placeholder="20-12345678-9"
              help="11 digits. Validated by the server too."
            />
          </FieldGrid>
        </form>

        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <div
            role="tablist"
            aria-label="Output language"
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              padding: 4,
              background: "#fafafa",
              borderRadius: 8,
              boxShadow: SHADOW_BORDER,
            }}
          >
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={activeLang === l}
                onClick={() => setActiveLang(l)}
                style={{
                  background: activeLang === l ? "#171717" : "transparent",
                  color: activeLang === l ? "#fff" : LANG_COLOR[l],
                  border: 0,
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontFamily: FONT_MONO,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>

          <SnippetCard code={active} />
        </div>
      </div>

      <Footer />
    </div>
  );
}

function SnippetCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        boxShadow: SHADOW_CARD,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "#fafafa",
          boxShadow: "inset 0 -1px 0 0 rgba(0,0,0,0.08)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: FONT_MONO,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          snippet
        </span>
        <button
          type="button"
          onClick={onCopy}
          style={{
            marginLeft: "auto",
            background: copied ? "#ebf5ff" : "#fff",
            color: copied ? "#0a72ef" : "#171717",
            border: 0,
            borderRadius: 4,
            padding: "3px 12px",
            fontSize: 11,
            fontFamily: FONT_MONO,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: SHADOW_BORDER,
          }}
        >
          {copied ? "copiado ✓" : "copiar"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 16,
          fontSize: 12,
          fontFamily: FONT_MONO,
          color: "#171717",
          background: "#fff",
          overflow: "auto",
          maxHeight: 580,
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label
        htmlFor={id}
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 600,
          marginBottom: 4,
          display: "block",
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {help && (
        <div style={helpStyle}>{help}</div>
      )}
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  help?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        style={inputStyle}
      />
      {help && <div style={helpStyle}>{help}</div>}
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  help?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {help && <div style={helpStyle}>{help}</div>}
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ ...inputStyle, fontFamily: "inherit", lineHeight: 1.5 }}
      />
      {help && <div style={helpStyle}>{help}</div>}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  color: "#666",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 600,
  marginBottom: 4,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#fff",
  color: "#171717",
  border: 0,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: FONT_MONO,
  boxShadow: "rgb(235,235,235) 0px 0px 0px 1px",
  outline: "none",
  boxSizing: "border-box",
};

const helpStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  marginTop: 4,
  lineHeight: 1.4,
};

function Footer() {
  return (
    <footer
      style={{
        marginTop: 48,
        padding: 18,
        background: "#fafafa",
        borderRadius: 8,
        boxShadow: SHADOW_BORDER,
        fontSize: 13,
        color: "#4d4d4d",
        lineHeight: 1.6,
        display: "grid",
        gap: 8,
      }}
    >
      <div>
        <strong style={{ color: "#171717" }}>What this generates:</strong>{" "}
        a single-shot POST to{" "}
        <code style={{ fontFamily: FONT_MONO }}>
          /api/auto-incorporate
        </code>{" "}
        with the form fields as the body. The response includes the
        generated source files, env-var manifest, deploy URL, and audit
        log reference, see{" "}
        <a href="/sdk" style={{ color: "#0072f5" }}>
          /sdk
        </a>{" "}
        for the result schema and{" "}
        <a href="/api/auto-incorporate" style={{ color: "#0072f5" }}>
          /api/auto-incorporate
        </a>{" "}
        for the endpoint&apos;s self-description.
      </div>
      <div>
        <strong style={{ color: "#171717" }}>Multi-step orchestration:</strong>{" "}
        Pass a stable{" "}
        <code style={{ fontFamily: FONT_MONO }}>sessionId</code>{" "}
        (UUID v4) across multiple calls to chain them under one
        forensic timeline. The TypeScript + Python snippets cover this
        in their full README forms.
      </div>
      <div>
        <strong style={{ color: "#171717" }}>Privacy:</strong> every
        field stays in your browser until you hit run. The page
        doesn&apos;t POST anywhere or telemetry-log the inputs.
      </div>
    </footer>
  );
}
