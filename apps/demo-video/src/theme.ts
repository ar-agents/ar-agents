// Design system — keeps the video visually in lockstep with the landing.
// Colors mirror globals.css custom properties from apps/landing/src/app/.

import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

// loadFont() is idempotent — Remotion bundles + serves the WOFF2 from the
// project so the rendered video has the actual Geist family instead of
// falling back to system Helvetica/Arial. We pin the weights we use so we
// don't ship the entire family.
const { fontFamily: GEIST_SANS } = loadGeist("normal", {
  weights: ["300", "400", "500", "600", "700"],
});
const { fontFamily: GEIST_MONO } = loadGeistMono("normal", {
  weights: ["400", "500", "600"],
});

export const COLORS = {
  bg: "#000000",
  bgTint: "#0a0a0a",
  text: "#ededed",
  textBody: "#a1a1a1",
  textMuted: "#717171",
  accent: "#00bcff",
  accentDim: "rgba(0, 188, 255, 0.18)",
  borderLight: "rgba(255, 255, 255, 0.1)",
  codeBg: "#ededed",
  codeText: "#0a0a0a",
  successGreen: "#19c37d",
  warningYellow: "#f5b942",
};

export const FONT_SANS = `${GEIST_SANS}, -apple-system, BlinkMacSystemFont, Inter, Helvetica, Arial, sans-serif`;
export const FONT_MONO = `${GEIST_MONO}, "SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace`;

// All scene durations in seconds — multiplied by FPS to get frames.
export const FPS = 30;
export const s = (seconds: number) => Math.round(seconds * FPS);
