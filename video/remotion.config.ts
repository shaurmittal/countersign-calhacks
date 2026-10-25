// Remotion settings for the demo video. Footage, voiceover and sound live in assets/ (served as staticFile).
import { Config } from "@remotion/cli/config";

Config.setPublicDir("./assets");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setPort(3477); // 3000 is usually the app
Config.setBrowserExecutable("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"); // the downloaded headless shell is missing icudtl.dat on this Mac
