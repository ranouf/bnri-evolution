import fs from "node:fs";
import path from "node:path";
import yazl from "yazl";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const outputDirectory = "dist";
const files = [
  "assets/icon128.png",
  "manifest.json",
  "PRIVACY.md",
  "src/analytics.js",
  "src/content.js",
  "src/network-bridge.js",
  "src/styles.css",
];

fs.mkdirSync(outputDirectory, { recursive: true });
for (const suffix of ["", "-chrome-store"]) {
  const destination = path.join(outputDirectory, `bnri-evolution-${manifest.version}${suffix}.zip`);
  const zip = new yazl.ZipFile();
  for (const file of files) zip.addFile(file, file);
  zip.end();
  await new Promise((resolve, reject) => {
    zip.outputStream
      .pipe(fs.createWriteStream(destination))
      .on("close", resolve)
      .on("error", reject);
  });
  console.log(destination);
}
