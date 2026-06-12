import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

const PILLARS = [
  "/sociedades-ia",
  "/rfcs/001",
  "/play",
  "/incorporar",
  "/press-kit",
  "/al-ministro",
];

export function Outro() {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const url = interpolate(frame, [20, 60], [0, 1], { extrapolateRight: "clamp" });
  const pills = interpolate(frame, [80, 130], [0, 1], { extrapolateRight: "clamp" });
  const sign = interpolate(frame, [150, 200], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [560, 600], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn * fadeOut,
        backgroundColor: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36,
      }}
    >
      {/* Breathing pulse on the URL — subtle, ~one cycle per 3.3 sec. */}
      <div
        style={{
          opacity: url,
          transform: `scale(${1 + 0.012 * Math.sin((frame - 20) / 16)})`,
          fontFamily: FONT_MONO,
          fontSize: 96,
          fontWeight: 600,
          color: COLORS.text,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          textShadow: `0 0 ${
            18 + 6 * Math.sin((frame - 20) / 16)
          }px rgba(0, 188, 255, 0.18)`,
        }}
      >
        ar-agents<span style={{ color: COLORS.textMuted }}>.vercel.app</span>
      </div>

      <div
        style={{
          opacity: pills,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1400,
        }}
      >
        {PILLARS.map((p) => (
          <div
            key={p}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 20,
              color: COLORS.textBody,
              backgroundColor: COLORS.bgTint,
              border: `1px solid ${COLORS.borderLight}`,
              padding: "10px 22px",
              borderRadius: 9999,
              letterSpacing: "0.02em",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      <div
        style={{
          opacity: pills,
          fontFamily: FONT_SANS,
          fontSize: 24,
          color: COLORS.textMuted,
          marginTop: 12,
          letterSpacing: "-0.01em",
          textAlign: "center",
          maxWidth: 1200,
        }}
      >
        33 paquetes npm · 221 herramientas · MIT · Edge Runtime · CC0 RFCs
      </div>

      <div
        style={{
          opacity: sign,
          marginTop: 80,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 28,
            fontWeight: 500,
            color: COLORS.text,
          }}
        >
          Naza Clemente
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 16,
            color: COLORS.textMuted,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          @nazaclemente · github.com/ar-agents/ar-agents
        </div>
      </div>
    </AbsoluteFill>
  );
}
