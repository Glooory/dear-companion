import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const source = resolve("build/tray-icon.svg");
const destination = resolve("resources/tray");

try {
  await access(source);
} catch {
  throw new Error(`Tray icon source is missing: ${source}`);
}

await mkdir(destination, { recursive: true });

const outputs = [
  { name: "trayTemplate.png", size: 16 },
  { name: "trayTemplate@2x.png", size: 32 },
  { name: "tray-win.png", size: 32 },
];

for (const output of outputs) {
  await sharp(source, { density: 144 })
    .resize(output.size, output.size, { fit: "contain" })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(resolve(destination, output.name));
}
