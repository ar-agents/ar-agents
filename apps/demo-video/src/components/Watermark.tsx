import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_MONO } from "../theme";

/**
 * Persistent /arg watermark in the top-right corner. Fades in after the
 * intro hands off and fades out at the very end of the outro. Keeps the
 * brand visible without competing with the scene content.
 */
export function Watermark({
  introHandoffFrame,
  totalFrames,
}: {
  introHandoffFrame: number;
  totalFrames: number;
}) {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [introHandoffFrame, introHandoffFrame + 20], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const fadeOut = interpolate(frame, [totalFrames - 40, totalFrames - 10], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 36,
        right: 56,
        opacity: fadeIn * fadeOut,
        fontFamily: FONT_MONO,
        fontSize: 22,
        fontWeight: 600,
        color: COLORS.textMuted,
        letterSpacing: "-0.02em",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      /arg
    </div>
  );
}
