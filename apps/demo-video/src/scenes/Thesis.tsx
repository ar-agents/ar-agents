import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_SANS } from "../theme";

export function Thesis() {
  const frame = useCurrentFrame();

  // Three beats — question, single-word answer, transition line.
  const question = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });
  const questionOut = interpolate(frame, [110, 140], [1, 0], { extrapolateRight: "clamp" });
  const answer = interpolate(frame, [110, 150], [0, 1], { extrapolateRight: "clamp" });
  const answerOut = interpolate(frame, [210, 240], [1, 0], { extrapolateRight: "clamp" });
  const transition = interpolate(frame, [210, 250], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [290, 300], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeOut,
        backgroundColor: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 60,
      }}
    >
      <div
        style={{
          opacity: question * questionOut,
          fontFamily: FONT_SANS,
          fontSize: 64,
          fontWeight: 400,
          color: COLORS.textBody,
          letterSpacing: "-0.02em",
          textAlign: "center",
          position: "absolute",
        }}
      >
        ¿Qué les falta para existir?
      </div>
      <div
        style={{
          opacity: answer * answerOut,
          fontFamily: FONT_SANS,
          fontSize: 200,
          fontWeight: 600,
          color: COLORS.text,
          letterSpacing: "-0.05em",
          position: "absolute",
        }}
      >
        Código.
      </div>
      <div
        style={{
          opacity: transition,
          fontFamily: FONT_SANS,
          fontSize: 56,
          fontWeight: 500,
          color: COLORS.accent,
          letterSpacing: "-0.02em",
          textAlign: "center",
          position: "absolute",
        }}
      >
        Esto es ese código.
      </div>
    </AbsoluteFill>
  );
}
