import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

// The terminal demo. Each "beat" is a chunk of text that types in over a
// frame range, plus an optional side-panel "package highlight". The frame
// numbers below are relative to the start of this scene.

type Beat =
  | { kind: "prompt"; start: number; end: number; lines: string[] }
  | {
      kind: "tool";
      start: number;
      end: number;
      pkg: string;
      lines: string[];
      result: string[];
      tag?: string;
    }
  | { kind: "assistant"; start: number; end: number; lines: string[] };

const BEATS: Beat[] = [
  {
    kind: "prompt",
    start: 10,
    end: 80,
    lines: [
      '> "Necesito constituir una sociedad-IA llamada ACME-AI, conseguir CUIT,',
      '   abrir cuenta MP, emitir factura y notificar al cliente por WhatsApp."',
    ],
  },
  {
    kind: "tool",
    start: 100,
    end: 220,
    pkg: "@ar-agents/igj",
    lines: ['→ igj_search_entities({ query: "ACME-AI", tipos: ["sas"] })'],
    result: ["  ← results: []", "  ✓ Nombre disponible"],
    tag: "IGJ open data · datos.jus.gob.ar",
  },
  {
    kind: "tool",
    start: 240,
    end: 380,
    pkg: "@ar-agents/identity",
    lines: [
      '→ validate_cuit({ cuit: "30-71618333-1" })',
      '→ lookup_cuit_afip({ cuit: "30716183331" })',
    ],
    result: [
      '  ← { valid: true, personType: "juridica" }',
      '  ← { taxCondition: "monotributo_a", razonSocial: "ACME-AI SAS" }',
    ],
    tag: "AFIP/ARCA WSAA · cert X.509",
  },
  {
    kind: "tool",
    start: 400,
    end: 560,
    pkg: "@ar-agents/mercadopago",
    lines: [
      '→ create_customer({ email: "cliente@example.com" })',
      '→ create_subscription({ amount: 50000, frequency: "monthly" })',
    ],
    result: [
      '  ← { id: "cust_abc123" }',
      '  ← { id: "sub_xyz789", init_point: "mercadopago.com.ar/..." }',
    ],
    tag: "89 tools tipadas · idempotencia + HITL",
  },
  {
    kind: "tool",
    start: 580,
    end: 720,
    pkg: "@ar-agents/facturacion",
    lines: ['→ emitir_factura({ tipo: "C", monto: 50000, cuit_cliente: "20123456786" })'],
    result: [
      '  ← { CAE: "74269825318964", numero: "0001-00000001" }',
      "  ✓ Factura electrónica emitida (AFIP/WSFE)",
    ],
    tag: "Factura electrónica · WSFE",
  },
  {
    kind: "tool",
    start: 740,
    end: 880,
    pkg: "@ar-agents/whatsapp",
    lines: ['→ send_template({ to: "+5491123456789", template: "factura_lista" })'],
    result: ['  ← { message_id: "wamid.HBgL..." }', "  ✓ Cliente notificado"],
    tag: "Business Cloud · AR phone normalizer",
  },
  {
    kind: "tool",
    start: 900,
    end: 1020,
    pkg: "@ar-agents/boletin-oficial",
    lines: ['→ bo_subscribe({ owner_id: "acme-ai", cuit: "30716183331" })'],
    result: ['  ← { id: "sub_bo_1", active: true }', "  ✓ Suscripto al firehose del BO"],
    tag: "Boletín Oficial · firehose estructurado",
  },
  {
    kind: "assistant",
    start: 1050,
    end: 1180,
    lines: [
      "✓ Sociedad-IA operando.",
      "  ACME-AI SAS · CUIT validado · MP cobrando · factura emitida ·",
      "  cliente notificado · BO monitoreado.",
      "",
      "  12 segundos. 6 paquetes /arg. 0 humanos en el loop.",
    ],
  },
];

const HEADER_HEIGHT = 56;

export function Terminal() {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });

  // Find the currently active package for the side panel.
  const activePkg = (() => {
    for (let i = BEATS.length - 1; i >= 0; i--) {
      const b = BEATS[i];
      if (b && b.kind === "tool" && frame >= b.start) return b;
    }
    return null;
  })();

  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn,
        backgroundColor: COLORS.bg,
        padding: "60px 80px",
        display: "flex",
        flexDirection: "row",
        gap: 32,
      }}
    >
      {/* Terminal pane */}
      <div
        style={{
          flex: 2,
          backgroundColor: COLORS.bgTint,
          borderRadius: 12,
          border: `1px solid ${COLORS.borderLight}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <TerminalHeader />
        <div
          style={{
            flex: 1,
            padding: "28px 32px",
            fontFamily: FONT_MONO,
            fontSize: 22,
            color: COLORS.text,
            lineHeight: 1.55,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflow: "hidden",
          }}
        >
          {BEATS.map((b, bi) => {
            // The "last active" beat is the latest beat the frame is currently
            // inside of. Its cursor blinks; older beats render their text plainly.
            const isLastActive = (() => {
              for (let k = BEATS.length - 1; k >= 0; k--) {
                const beat = BEATS[k]!;
                if (frame >= beat.start && frame <= beat.end) return k === bi;
                if (frame >= beat.start) return false;
              }
              return false;
            })();
            return <BeatLines key={bi} beat={b} frame={frame} isLastActive={isLastActive} />;
          })}
        </div>
      </div>

      {/* Side panel — package spotlight */}
      <div
        style={{
          flex: 1,
          minWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 16,
            color: COLORS.accent,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            fontWeight: 600,
          }}
        >
          paquete activo
        </div>
        <div
          style={{
            backgroundColor: COLORS.bgTint,
            borderRadius: 12,
            border: `1px solid ${COLORS.borderLight}`,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minHeight: 320,
          }}
        >
          {activePkg && activePkg.kind === "tool" ? (
            <>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 30,
                  fontWeight: 600,
                  color: COLORS.text,
                  letterSpacing: "-0.02em",
                  wordBreak: "break-all",
                }}
              >
                {activePkg.pkg}
              </div>
              {activePkg.tag ? (
                <div
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 22,
                    color: COLORS.textBody,
                    lineHeight: 1.5,
                  }}
                >
                  {activePkg.tag}
                </div>
              ) : null}
              <div
                style={{
                  marginTop: "auto",
                  fontFamily: FONT_MONO,
                  fontSize: 16,
                  color: COLORS.textMuted,
                  letterSpacing: "0.06em",
                }}
              >
                pnpm add {activePkg.pkg}
              </div>
            </>
          ) : (
            <div
              style={{
                fontFamily: FONT_SANS,
                fontSize: 22,
                color: COLORS.textMuted,
              }}
            >
              Esperando entrada del usuario…
            </div>
          )}
        </div>

        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 14,
            color: COLORS.textMuted,
            letterSpacing: "0.1em",
            marginTop: "auto",
          }}
        >
          Vercel AI SDK 6 · Edge Runtime · Web Crypto
        </div>
      </div>
    </AbsoluteFill>
  );
}

function TerminalHeader() {
  return (
    <div
      style={{
        height: HEADER_HEIGHT,
        backgroundColor: "#1c1c1c",
        borderBottom: `1px solid ${COLORS.borderLight}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <Dot color="#ff5f56" />
        <Dot color="#ffbd2e" />
        <Dot color="#27c93f" />
      </div>
      <div
        style={{
          marginLeft: 16,
          fontFamily: FONT_MONO,
          fontSize: 14,
          color: COLORS.textMuted,
          letterSpacing: "0.06em",
        }}
      >
        agent.ts — claude-sonnet-4-6 via Vercel AI Gateway
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        display: "inline-block",
      }}
    />
  );
}

function BeatLines({
  beat,
  frame,
  isLastActive,
}: {
  beat: Beat;
  frame: number;
  isLastActive: boolean;
}) {
  if (frame < beat.start) return null;

  const reveal = interpolate(frame, [beat.start, beat.end], [0, 1], {
    extrapolateRight: "clamp",
  });
  const isLive = frame >= beat.start && frame <= beat.end;

  if (beat.kind === "prompt") {
    return (
      <Typewriter
        lines={beat.lines}
        progress={reveal}
        color={COLORS.text}
        bold
        showCursor={isLastActive && isLive}
        frame={frame}
      />
    );
  }

  if (beat.kind === "assistant") {
    return (
      <div style={{ marginTop: 8 }}>
        <Typewriter
          lines={beat.lines}
          progress={reveal}
          color={COLORS.successGreen}
          bold
          showCursor={isLastActive && isLive}
          frame={frame}
        />
      </div>
    );
  }

  // tool
  const half = (beat.start + beat.end) / 2;
  const callsProgress = interpolate(frame, [beat.start, half], [0, 1], {
    extrapolateRight: "clamp",
  });
  const resultProgress = interpolate(frame, [half, beat.end], [0, 1], {
    extrapolateRight: "clamp",
  });
  const isInResult = frame >= half;

  return (
    <div style={{ marginTop: 6 }}>
      <Typewriter
        lines={beat.lines}
        progress={callsProgress}
        color={COLORS.accent}
        showCursor={isLastActive && isLive && !isInResult}
        frame={frame}
      />
      <Typewriter
        lines={beat.result}
        progress={resultProgress}
        color={COLORS.textBody}
        showCursor={isLastActive && isLive && isInResult}
        frame={frame}
      />
    </div>
  );
}

function Typewriter({
  lines,
  progress,
  color,
  bold,
  showCursor,
  frame,
}: {
  lines: string[];
  progress: number;
  color: string;
  bold?: boolean;
  showCursor?: boolean;
  frame?: number;
}) {
  const totalChars = lines.reduce((acc, l) => acc + l.length, 0);
  const visibleChars = Math.floor(totalChars * progress);

  let remaining = visibleChars;
  const renderedLines: string[] = [];
  for (const line of lines) {
    if (remaining <= 0) break;
    if (remaining >= line.length) {
      renderedLines.push(line);
      remaining -= line.length;
    } else {
      renderedLines.push(line.slice(0, remaining));
      remaining = 0;
    }
  }

  return (
    <div style={{ color, fontWeight: bold ? 600 : 400 }}>
      {renderedLines.map((l, i) => {
        const isLast = i === renderedLines.length - 1;
        const cursorOn = frame !== undefined ? Math.floor(frame / 15) % 2 === 0 : true;
        return (
          <div key={i} style={{ whiteSpace: "pre" }}>
            {l || " "}
            {isLast && showCursor && cursorOn ? (
              <span
                style={{
                  display: "inline-block",
                  width: "0.5em",
                  height: "1em",
                  marginLeft: 2,
                  verticalAlign: "text-bottom",
                  background: COLORS.text,
                  opacity: 0.85,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
