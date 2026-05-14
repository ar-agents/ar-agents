import { AbsoluteFill, Sequence } from "remotion";
import { ProgressBar } from "./components/ProgressBar";
import { Watermark } from "./components/Watermark";
import { Context } from "./scenes/Context";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Stats } from "./scenes/Stats";
import { Terminal } from "./scenes/Terminal";
import { Thesis } from "./scenes/Thesis";
import { COLORS, s } from "./theme";

// Each scene's frame budget. Total = ~150 seconds (~2:30).
export const SCENE_FRAMES = {
  intro: s(7),
  context: s(18),
  thesis: s(10),
  stats: s(10),
  terminal: s(85),
  outro: s(20),
};

const SCENE_START = (() => {
  let acc = 0;
  return {
    intro: (acc = 0),
    context: (acc += SCENE_FRAMES.intro),
    thesis: (acc += SCENE_FRAMES.context),
    stats: (acc += SCENE_FRAMES.thesis),
    terminal: (acc += SCENE_FRAMES.stats),
    outro: (acc += SCENE_FRAMES.terminal),
  };
})();

const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);

const CHAPTERS = [
  { label: "intro", frames: SCENE_FRAMES.intro },
  { label: "el anuncio", frames: SCENE_FRAMES.context },
  { label: "tesis", frames: SCENE_FRAMES.thesis },
  { label: "stats", frames: SCENE_FRAMES.stats },
  { label: "agente en vivo", frames: SCENE_FRAMES.terminal },
  { label: "outro", frames: SCENE_FRAMES.outro },
];

export function SociedadIaDemo() {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <Sequence from={SCENE_START.intro} durationInFrames={SCENE_FRAMES.intro}>
        <Intro />
      </Sequence>
      <Sequence from={SCENE_START.context} durationInFrames={SCENE_FRAMES.context}>
        <Context />
      </Sequence>
      <Sequence from={SCENE_START.thesis} durationInFrames={SCENE_FRAMES.thesis}>
        <Thesis />
      </Sequence>
      <Sequence from={SCENE_START.stats} durationInFrames={SCENE_FRAMES.stats}>
        <Stats />
      </Sequence>
      <Sequence from={SCENE_START.terminal} durationInFrames={SCENE_FRAMES.terminal}>
        <Terminal />
      </Sequence>
      <Sequence from={SCENE_START.outro} durationInFrames={SCENE_FRAMES.outro}>
        <Outro />
      </Sequence>

      {/* Persistent overlays — sit above scene content. */}
      <Watermark introHandoffFrame={SCENE_START.context} totalFrames={TOTAL_FRAMES} />
      <ProgressBar
        chapters={CHAPTERS}
        totalFrames={TOTAL_FRAMES}
        introHandoffFrame={SCENE_START.context}
      />
    </AbsoluteFill>
  );
}
