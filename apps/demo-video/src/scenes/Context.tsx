import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS } from "../theme";

const LINES: Array<{ start: number; text: string; accent?: boolean; mono?: boolean }> = [
  { start: 10, text: "28 de abril de 2026.", mono: true },
  { start: 70, text: "El Ministro Sturzenegger anuncia un nuevo régimen jurídico:" },
  { start: 150, text: "Empresas sin humanos." },
  { start: 200, text: "Cero accionistas. Cero directores. Cero empleados." },
  { start: 280, text: "Solo código que decide, opera y paga impuestos en Argentina.", accent: true },
  { start: 420, text: '"500 millones de agentes IA incorporados acá."', mono: true },
];

export function Context() {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [510, 540], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeOut,
        backgroundColor: COLORS.bg,
        padding: "180px 220px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        justifyContent: "center",
      }}
    >
      {LINES.map((line, i) => {
        const opacity = interpolate(frame, [line.start, line.start + 30], [0, 1], {
          extrapolateRight: "clamp",
        });
        const translateY = interpolate(frame, [line.start, line.start + 30], [12, 0], {
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              opacity,
              transform: `translateY(${translateY}px)`,
              fontFamily: line.mono ? FONT_MONO : FONT_SANS,
              fontSize: line.mono ? 38 : 56,
              fontWeight: line.accent ? 600 : 400,
              color: line.accent ? COLORS.accent : COLORS.text,
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
              maxWidth: 1500,
            }}
          >
            {line.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
