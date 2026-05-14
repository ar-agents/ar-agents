import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_MONO } from "../theme";

interface Chapter {
  label: string;
  frames: number;
}

/**
 * Bottom-edge progress bar with chapter markers. Tells the viewer where
 * they are in the 2:30 — useful for "skim and decide if to watch full
 * thing" scenarios where the audience is a busy advisor.
 */
export function ProgressBar({
  chapters,
  totalFrames,
  introHandoffFrame,
}: {
  chapters: Chapter[];
  totalFrames: number;
  introHandoffFrame: number;
}) {
  const frame = useCurrentFrame();
  // Hide during the intro (clean opening) + fade out at end.
  const opacity =
    interpolate(frame, [introHandoffFrame, introHandoffFrame + 20], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    }) *
    interpolate(frame, [totalFrames - 40, totalFrames - 10], [1, 0], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });

  const progress = frame / totalFrames;
  const cumulative: number[] = [];
  let acc = 0;
  for (const c of chapters) {
    acc += c.frames;
    cumulative.push(acc);
  }
  const activeIdx = chapters.findIndex((_c, i) => frame < (cumulative[i] ?? 0));

  return (
    <div
      style={{
        position: "absolute",
        left: 56,
        right: 56,
        bottom: 24,
        opacity,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: COLORS.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
        }}
      >
        {chapters.map((c, i) => (
          <span
            key={i}
            style={{
              color: i === activeIdx ? COLORS.accent : COLORS.textMuted,
              fontWeight: i === activeIdx ? 600 : 400,
              transition: "color 0.2s",
            }}
          >
            {c.label}
          </span>
        ))}
      </div>
      <div
        style={{
          height: 2,
          width: "100%",
          background: COLORS.borderLight,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${progress * 100}%`,
            background: COLORS.accent,
          }}
        />
      </div>
    </div>
  );
}
