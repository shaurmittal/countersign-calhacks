// Look of the video: near-black, off-white, one green for verified, one red for threat. Nothing else bright.
import { loadFont as loadSans } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const SANS = loadSans("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily;
export const MONO = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#07080B",
  fg: "#ECEEF1",
  soft: "#A9B0BA",
  muted: "#6B7380",
  line: "rgba(236, 238, 241, 0.12)",
  green: "#3DFFA2",
  red: "#FF3B4E",
};

export const W = 1920;
export const H = 1080;
export const FPS = 30;
/** 2.39:1 letterbox bars on 16:9. */
export const BAR = Math.round((H - W / 2.39) / 2);
