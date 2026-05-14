import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

export function Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slashOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const slashScale = spring({ frame, fps, config: { damping: 12, stiffness: 90 } });
  const subtitleOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [180, 210], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeOut,
        backgroundColor: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div
        style={{
          opacity: slashOpacity,
          transform: `scale(${0.92 + slashScale * 0.08})`,
          fontFamily: FONT_MONO,
          fontSize: 220,
          fontWeight: 600,
          color: COLORS.text,
          letterSpacing: "-0.08em",
          lineHeight: 1,
        }}
      >
        /arg
      </div>
      <div
        style={{
          opacity: subtitleOpacity,
          fontFamily: FONT_SANS,
          fontSize: 32,
          color: COLORS.textBody,
          maxWidth: 1200,
          textAlign: "center",
          letterSpacing: "-0.02em",
          fontWeight: 400,
        }}
      >
        Infraestructura abierta para la jurisdicción de agentes argentina.
      </div>
      <div
        style={{
          opacity: subtitleOpacity,
          fontFamily: FONT_MONO,
          fontSize: 16,
          color: COLORS.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          marginTop: 16,
        }}
      >
        ar-agents.ar · mayo de 2026
      </div>
    </AbsoluteFill>
  );
}
