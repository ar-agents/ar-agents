/**
 * Hero SVG diagram, depicts the agent → @ar-agents/* → AR state stack
 * → signed audit log flow. Static, no animation, accessible (role=img +
 * descriptive title/desc). Theme-aware via currentColor / CSS vars.
 * Locale-aware: receives `lang` prop and switches the in-diagram labels
 * accordingly. Default = "en" for safety on SSR.
 *
 * Designed to fit ~640×330 px in the hero. Reduces visual emptiness
 * without screaming "we hired a designer". Bauhaus-ish: monoline,
 * generous whitespace, the agent on the left, the audit log on the
 * right, ar-agents in the middle bridging.
 */
type Lang = "en" | "es";

const L = {
  agentLoop: { en: "↳ agent loop", es: "↳ agente" },
  modelVendor: { en: "Sonnet 4.6", es: "Sonnet 4.6" },
  toolCalls: { en: "tool calls", es: "tool-calls" },
  packagesLabel: { en: "17 packages", es: "17 paquetes" },
  toolsLabel: { en: "168 typed tools", es: "168 tools tipadas" },
  sdkLabel: { en: "Vercel AI SDK 6", es: "Vercel AI SDK 6" },
  auditCaption: {
    en: "↓ each tool call is written to a dual-signed audit log (HMAC + Ed25519)",
    es: "↓ cada tool call se escribe al audit log dual-sign (HMAC + Ed25519)",
  },
} as const;

export function HeroDiagram({ lang = "en" }: { lang?: Lang } = {}) {
  const t = (k: keyof typeof L) => L[k][lang];
  return (
    <svg
      role="img"
      aria-labelledby="hero-diagram-title hero-diagram-desc"
      viewBox="0 0 640 330"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: "100%",
        height: "auto",
        maxWidth: 640,
        display: "block",
        overflow: "visible",
      }}
    >
      <title id="hero-diagram-title">
        Flujo: agente IA → ar-agents packages → AR state stack → audit log firmado
      </title>
      <desc id="hero-diagram-desc">
        Un agente Claude llama tools tipadas de @ar-agents/* que se
        conectan al stack del Estado argentino (AFIP/ARCA, Mercado Pago,
        WhatsApp Business, Boletín Oficial, IGJ). Cada llamada genera una
        entrada en un audit log forense firmado con HMAC-SHA256 + Ed25519.
      </desc>

      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill="currentColor"
            opacity="0.6"
          />
        </marker>
      </defs>

      {/* Agent box (left) */}
      <g transform="translate(20 90)">
        <rect
          width="130"
          height="100"
          rx="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.4"
        />
        <text
          x="65"
          y="38"
          textAnchor="middle"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          opacity="0.55"
          fill="currentColor"
        >
          {t("agentLoop")}
        </text>
        <text
          x="65"
          y="62"
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          fontFamily="ui-monospace, monospace"
          fill="currentColor"
        >
          Claude
        </text>
        <text
          x="65"
          y="80"
          textAnchor="middle"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          opacity="0.55"
          fill="currentColor"
        >
          {t("modelVendor")}
        </text>
      </g>

      {/* Arrow agent → ar-agents */}
      <line
        x1="150"
        y1="140"
        x2="240"
        y2="140"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
        markerEnd="url(#arrow)"
      />
      <text
        x="195"
        y="128"
        textAnchor="middle"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        opacity="0.6"
        fill="currentColor"
      >
        {t("toolCalls")}
      </text>

      {/* ar-agents core (middle, highlighted with accent) */}
      <g transform="translate(245 80)">
        <rect
          width="150"
          height="120"
          rx="8"
          fill="var(--accent-bg)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <text
          x="75"
          y="30"
          textAnchor="middle"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
          opacity="0.75"
          fill="var(--accent)"
        >
          @ar-agents/*
        </text>
        <text
          x="75"
          y="56"
          textAnchor="middle"
          fontSize="16"
          fontWeight="600"
          fill="currentColor"
        >
          {t("packagesLabel")}
        </text>
        <text
          x="75"
          y="76"
          textAnchor="middle"
          fontSize="11"
          opacity="0.75"
          fill="currentColor"
        >
          {t("toolsLabel")}
        </text>
        <text
          x="75"
          y="100"
          textAnchor="middle"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
          opacity="0.65"
          fill="currentColor"
        >
          {t("sdkLabel")}
        </text>
      </g>

      {/* Fan out: ar-agents → AR state stack (5 small boxes) */}
      <line
        x1="395"
        y1="125"
        x2="460"
        y2="55"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
        markerEnd="url(#arrow)"
      />
      <line
        x1="395"
        y1="135"
        x2="460"
        y2="100"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
        markerEnd="url(#arrow)"
      />
      <line
        x1="395"
        y1="140"
        x2="460"
        y2="145"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
        markerEnd="url(#arrow)"
      />
      <line
        x1="395"
        y1="155"
        x2="460"
        y2="195"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
        markerEnd="url(#arrow)"
      />
      <line
        x1="395"
        y1="165"
        x2="460"
        y2="245"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
        markerEnd="url(#arrow)"
      />

      {/* AR state stack labels (right column) */}
      <StateLabel x={465} y={40} label="AFIP / ARCA" />
      <StateLabel x={465} y={85} label="Mercado Pago" />
      <StateLabel x={465} y={130} label="WhatsApp Biz" />
      <StateLabel x={465} y={180} label="Boletín Oficial" />
      <StateLabel x={465} y={230} label="IGJ + BCRA" />

      {/* Audit log strip (bottom). Pushed below the last state-stack
          box (which ends at y=258) so the text doesn't overlap the
          diagram. Dashed separator first, then text well below. */}
      <g transform="translate(0 290)">
        <line
          x1="60"
          y1="0"
          x2="580"
          y2="0"
          stroke="currentColor"
          strokeWidth="0.5"
          opacity="0.25"
          strokeDasharray="3 3"
        />
        <text
          x="320"
          y="22"
          textAnchor="middle"
          fontSize="10.5"
          fontFamily="ui-monospace, monospace"
          opacity="0.6"
          fill="currentColor"
        >
          {t("auditCaption")}
        </text>
      </g>
    </svg>
  );
}

function StateLabel({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width="130"
        height="28"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.35"
      />
      <text
        x="65"
        y="18"
        textAnchor="middle"
        fontSize="11.5"
        fontFamily="ui-monospace, monospace"
        opacity="0.85"
        fill="currentColor"
      >
        {label}
      </text>
    </g>
  );
}
