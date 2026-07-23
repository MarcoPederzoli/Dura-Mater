"use strict";

/**
 * Genera durissima-coordinator-browser.js per il gioco in browser.
 * Uso: node scripts/build-coordinator-browser.js
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "durissima-coordinator-browser.js");

function read(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

function transformCountLib(src) {
  return src
    .replace(/^"use strict";\r?\n/, "")
    .replace(/const path = require\("node:path"\);\r?\n/g, "")
    .replace(/require\(path\.join\(__dirname, "\.\.", "mpcards-core\.js"\)\);\r?\n/g, "")
    .replace(/const core = globalThis\.MPCardsCore;\r?\n/g, "")
    .replace(/module\.exports = \{([\s\S]*?)\};\s*$/m, "const DeckGridSolutionCountLib = {$1};");
}

function transformMatrixSolver(src) {
  return src
    .replace(/^"use strict";\r?\n/, "")
    .replace(/const path = require\("node:path"\);\r?\n/g, "")
    .replace(/const \{ Worker \} = require\("worker_threads"\);\r?\n/g, "")
    .replace(/const os = require\("os"\);\r?\n/g, "")
    .replace(/const countLib = require\("\.\/deck-grid-solution-count-lib"\);\r?\n/g, "")
    .replace(/require\(path\.join\(__dirname, "\.\.", "mpcards-core\.js"\)\);\r?\n/g, "")
    .replace(/const core = globalThis\.MPCardsCore;\r?\n/g, "")
    .replace(
      /const \{ findOneSolutionForSize, buildNeighbors \} = countLib;\r?\n/g,
      "const { findOneSolutionForSize, buildNeighbors } = DeckGridSolutionCountLib;\n"
    )
    .replace(/module\.exports = \{([\s\S]*?)\};\s*$/m, "const DurissimaMatrixSolver = {$1};")
    .replace(/if \(require\.main === module\) \{[\s\S]*$/m, "");
}

function transformOracle(src) {
  let code = src
    .replace(/^"use strict";\r?\n/, "")
    .replace(/const matrixSolver = require\("\.\/durissima-matrix-solver"\);\r?\n/g, "const matrixSolver = globalThis.DurissimaMatrixSolver;\n")
    .replace(/const gnLib = require\("\.\/durissima-gn-solver-lib"\);\r?\n/g, "")
    .replace(/function buildDeal[\s\S]*?\}\r?\n\r?\n/, "")
    .replace(/^module\.exports\.\w+ = \w+;\r?\n/gm, "")
    .replace(/\/\/ CLI for quick test[\s\S]*$/m, "");

  return `${code}\nconst DurissimaGnDecoupledOracle = { findPerfectPlanForDeal, isAssemblyPlayable, computePlayersForBursts };`;
}

const header = `/* eslint-disable */
/**
 * Solver coordinatore Durissima per browser — generato da scripts/build-coordinator-browser.js
 * Non modificare a mano: rigenerare con \`node scripts/build-coordinator-browser.js\`
 */
(function () {
  "use strict";
  if (!globalThis.MPCardsCore) {
    console.warn("[Durissima browser] MPCardsCore non caricato — coordinatore disabilitato.");
    return;
  }
  const core = globalThis.MPCardsCore;

`;

const footer = `
  globalThis.__DM_COORDINATOR_BROWSER__ = true;
})();
`;

function wrapBlock(code, exportLine) {
  return `{\n${code}\n${exportLine}\n}`;
}

const body = [
  wrapBlock(
    transformCountLib(read("deck-grid-solution-count-lib.js")),
    "globalThis.DeckGridSolutionCountLib = DeckGridSolutionCountLib;"
  ),
  wrapBlock(
    transformMatrixSolver(read("durissima-matrix-solver.js")),
    "globalThis.DurissimaMatrixSolver = DurissimaMatrixSolver;"
  ),
  wrapBlock(
    transformOracle(read("durissima-gn-decoupled-oracle.js")),
    "globalThis.DurissimaGnDecoupledOracle = DurissimaGnDecoupledOracle;"
  )
].join("\n\n");

fs.writeFileSync(outPath, header + body + footer, "utf8");
process.stdout.write(`Scritto ${outPath} (${Math.round(fs.statSync(outPath).size / 1024)} KB)\n`);