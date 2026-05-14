import { Composition } from "remotion";
import { SociedadIaDemo, SCENE_FRAMES } from "./SociedadIaDemo";

const FPS = 30;
const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);

export function Root() {
  return (
    <Composition
      id="SociedadIaDemo"
      component={SociedadIaDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
