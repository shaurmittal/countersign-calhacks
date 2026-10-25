import React from "react";
import { Composition } from "remotion";
import { Demo, Thumbnail } from "./Demo";
import { FPS, H, W } from "./theme";
import { f, TOTAL_SECONDS } from "./timeline";

export const Root: React.FC = () => (
  <>
    <Composition id="CountersignDemo" component={Demo} durationInFrames={f(TOTAL_SECONDS)} fps={FPS} width={W} height={H} />
    {/* A one-frame composition at 30 fps (a <Still> runs at 1 fps, which would misplace the footage seek). */}
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={FPS} width={W} height={H} />
  </>
);
