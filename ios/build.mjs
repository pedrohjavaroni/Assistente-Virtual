// Gera ios/raccoon-ia.html (a versão publicada no claude.ai) a partir do guaxinim compartilhado.
// Uso: node ios/build.mjs
import fs from "node:fs";
import { RACCOON_SVG } from "../public/raccoon.js";
const here = new URL(".", import.meta.url);
const css = fs.readFileSync(new URL("../public/raccoon.css", here), "utf8");
const tpl = fs.readFileSync(new URL("template.html", here), "utf8");
fs.writeFileSync(new URL("raccoon-ia.html", here), tpl.replace("__RCCSS__", css).replace("__SVG__", RACCOON_SVG.trim()));
console.log("ok: ios/raccoon-ia.html");
