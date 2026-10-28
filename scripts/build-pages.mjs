import { build } from "vite";
import { writeFile } from "node:fs/promises";

await build({ configFile: new URL("../vite.pages.config.ts", import.meta.url).pathname });
// The output is already bundled; GitHub Pages should serve it without Jekyll.
await writeFile(new URL("../docs/.nojekyll", import.meta.url), "");
