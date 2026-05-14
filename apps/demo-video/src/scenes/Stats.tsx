import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

interface Counter {
  label: string;
  to: number;
  suffix?: string;
  start: number;
  end: number;
}

const COUNTERS: Counter[] = [
  { label: "paquetes en npm", to: 17, start: 10, end: 80 },
  { label: "herramientas tipadas", to: 168, start: 30, end: 100 },
  { label: "piezas operativas cubiertas", to: 16, suffix: " / 17", start: 50, end: 120 },
];

const FOOTNOTES = [
  "MIT · SLSA v1 provenance",
  "Edge Runtime · Web Crypto only",
  "Vercel AI SDK 6 · MCP-native",
];

export function Stats() {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [280, 300], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn * fadeOut,
        backgroundColor: COLORS.bg,
        padding: "140px 220px",
        display: "flex",
        flexDirection: "column",
        gap: 64,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 18,
          color: COLORS.accent,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          fontWeight: 600,
        }}
      >
        Lo que ya está construido
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
        {COUNTERS.map((c, i) => {
          const progress = interpolate(frame, [c.start, c.end], [0, 1], {
            extrapolateRight: "clamp",
          });
          const value = Math.round(progress * c.to);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 32,
                opacity: interpolate(frame, [c.start, c.start + 12], [0, 1], {
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 160,
                  fontWeight: 600,
                  color: COLORS.text,
                  letterSpacing: "-0.06em",
                  lineHeight: 1,
                  minWidth: 320,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value}
                {c.suffix ?? ""}
              </div>
              <div
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 36,
                  color: COLORS.textBody,
                  letterSpacing: "-0.02em",
                }}
              >
                {c.label}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 32,
          display: "flex",
          gap: 24,
          opacity: interpolate(frame, [180, 220], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        {FOOTNOTES.map((f) => (
          <div
            key={f}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 18,
              color: COLORS.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              border: `1px solid ${COLORS.borderLight}`,
              padding: "10px 18px",
              borderRadius: 6,
            }}
          >
            {f}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
