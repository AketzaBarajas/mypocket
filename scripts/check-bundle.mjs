// Comprueba el presupuesto de JS inicial tras `pnpm build`: la suma en gzip del
// script de entrada y de todo lo que index.html precarga (sin contar el WASM)
// no debe superar 350 kB. Uso: `pnpm check:bundle`.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 350;
const dist = new URL("../dist/", import.meta.url);

let html;
try {
  html = await readFile(new URL("index.html", dist), "utf8");
} catch {
  process.stderr.write("No existe dist/index.html. Ejecuta antes `pnpm build`.\n");
  process.exit(1);
}

const files = [
  ...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])),
];
let total = 0;
const rows = [];
for (const file of files) {
  const size = gzipSync(await readFile(new URL(file, dist)), { level: 9 }).length;
  total += size;
  rows.push([size, file]);
}

rows.sort((a, b) => b[0] - a[0]);
for (const [size, file] of rows.slice(0, 6)) {
  process.stdout.write(`${(size / 1024).toFixed(1).padStart(7)} kB  ${file}\n`);
}
const totalKb = total / 1024;
process.stdout.write(
  `${totalKb.toFixed(1).padStart(7)} kB  JS inicial en gzip (${files.length} archivos, presupuesto ${BUDGET_KB} kB)\n`,
);
if (totalKb > BUDGET_KB) {
  process.stderr.write(`Se pasa del presupuesto en ${(totalKb - BUDGET_KB).toFixed(1)} kB.\n`);
  process.exit(1);
}
process.stdout.write(`Dentro del presupuesto. dist: ${fileURLToPath(dist)}\n`);
