import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";

// Clean
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/themes", { recursive: true });

// Bundle JS
execSync(
  "npx esbuild src/index.ts --bundle --outfile=dist/bundle.js --format=esm --platform=browser",
  { stdio: "inherit" }
);
execSync(
  "npx esbuild src/rnnoise-worklet-processor.ts --bundle --outfile=dist/rnnoise-worklet-processor.js --format=esm --platform=browser",
  { stdio: "inherit" }
);

// Copy static assets
cpSync("index.html", "dist/index.html");
cpSync("style.css", "dist/style.css");
cpSync("src/themes", "dist/themes", { recursive: true });

console.log("✓ voice-engine built → dist/");
