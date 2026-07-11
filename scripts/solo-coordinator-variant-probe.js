"use strict";

/**
 * Probe solitario G=1 con strategia coordinatore (durissima-global-planner)
 * su ciascuna variante opzionale Durissima.
 *
 * Uso: node scripts/solo-coordinator-variant-probe.js [L] [seeds]
 * Es:  node scripts/solo-coordinator-variant-probe.js 3 50
 */

const path = require("path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const L = Number(process.argv[2]) || 3;
const SEEDS = Number(process.argv[3]) || 50;

const VARIANTS = [
  {
    id: "core",
    label: "Core puro (no reshuffle)",
    opts: {
      drawOnlyAfterPlacement: true,
      durissimaVitaExtraEnabled: false,
      durissimaReserveEnabled: false
    }
  },
  {
    id: "n-reshuffle",
    label: "N reshuffle / vita extra (default prodotto)",
    opts: {
      drawOnlyAfterPlacement: true,
      durissimaVitaExtraEnabled: true,
      durissimaStrategicVitaExtra: true,
      durissimaSelectiveReshuffle: true
    }
  },
  {
    id: "reserve-n",
    label: "Pool riserva N",
    opts: {
      drawOnlyAfterPlacement: true,
      durissimaVitaExtraEnabled: false,
      durissimaReserveEnabled: true
    }
  },
  {
    id: "free-draw",
    label: "Free-draw + N reshuffle",
    opts: {
      durissimaCompetitiveDraw: true,
      durissimaVitaExtraEnabled: true,
      durissimaSelectiveReshuffle: true
    }
  },
  {
    id: "scarti-n",
    label: "Scarti N reshuffle",
    opts: {
      durissimaScartiNReshuffle: true
    }
  },
  {
    id: "hand-cap",
    label: "Hand-cap N + pesca competitiva",
    opts: {
      durissimaHandDrawCap: true,
      durissimaHandDrawCapFactor: 1,
      durissimaVitaExtraEnabled: false
    }
  },
  {
    id: "hand-cap-2n",
    label: "Hand-cap 2N + pesca competitiva",
    opts: {
      durissimaHandDrawCap: true,
      durissimaHandDrawCapFactor: 2,
      durissimaVitaExtraEnabled: false
    }
  },
  {
    id: "emerg-x3",
    label: "Core + budget pesca emergenza x3",
    opts: {
      drawOnlyAfterPlacement: true,
      durissimaVitaExtraEnabled: false,
      durissimaEmergencyDrawBudget: 3
    }
  },
  {
    id: "after-x3",
    label: "Core + budget pesca dopo posata x3",
    opts: {
      drawOnlyAfterPlacement: true,
      durissimaVitaExtraEnabled: false,
      durissimaAfterPlayDrawBudget: 3
    }
  },
  {
    id: "planner-g-core",
    label: "[baseline] Planner G + core (no coordinatore effettivo)",
    strategy: "durissima-planner",
    opts: {
      drawOnlyAfterPlacement: true,
      durissimaVitaExtraEnabled: false
    }
  },
  {
    id: "planner-g-vita",
    label: "[baseline] Planner G + N reshuffle",
    strategy: "durissima-planner",
    opts: {
      drawOnlyAfterPlacement: true,
      durissimaVitaExtraEnabled: true
    }
  }
];

function coordActiveForSetup(variant) {
  const state = core.setupGame(deck, {
    size: L,
    players: 1,
    random: core.mulberry32(1),
    durissimaMater: true,
    randomizeTurnOrder: true,
    ...variant.opts
  });
  return core.gnUseCoordinatedSoloPlanner(state);
}

function runVariant(variant) {
  const strategy = variant.strategy || "durissima-global-planner";
  const coord = strategy === "durissima-global-planner" ? coordActiveForSetup(variant) : false;
  let ok = 0;
  let vitaSum = 0;
  let emergSum = 0;
  let afterSum = 0;
  let recycleSum = 0;
  let turnSum = 0;
  let boardSum = 0;

  for (let s = 0; s < SEEDS; s++) {
    const random = core.mulberry32(core.hashSeed(`solo-var:${L}:${variant.id}:${s}`));
    const r = core.simulateGame(deck, {
      size: L,
      players: 1,
      random,
      strategies: [strategy],
      durissimaMater: true,
      randomizeTurnOrder: true,
      ...variant.opts
    });
    if (r.status === "success") ok++;
    turnSum += r.turns || 0;
    boardSum += (r.board || []).length;
    vitaSum += r.durissimaVitaExtraUsed || 0;
    emergSum += r.durissimaEmergencyDrawsUsed || 0;
    afterSum += r.durissimaAfterPlayDrawsUsed || 0;
    recycleSum += r.durissimaDiscardRecyclesUsed || 0;
  }

  const pct = (100 * ok / SEEDS).toFixed(1);
  const coordTag = strategy === "durissima-global-planner"
    ? (coord ? "COORD si" : "COORD no (fallback team/planner)")
    : "legacy G";
  console.log(
    `${variant.id.padEnd(16)} | ${pct.padStart(5)}% (${ok}/${SEEDS}) | ${coordTag}` +
    ` | vita/med ${(vitaSum / SEEDS).toFixed(2)}` +
    ` | emerg ${(emergSum / SEEDS).toFixed(2)}` +
    ` | after ${(afterSum / SEEDS).toFixed(2)}` +
    ` | ricicli ${(recycleSum / SEEDS).toFixed(2)}` +
    ` | board/med ${(boardSum / SEEDS).toFixed(1)}` +
    ` | turni/med ${(turnSum / SEEDS).toFixed(1)}`
  );
  console.log(`  ${variant.label}`);
}

const deal = core.computeInitialDeal(L, 1);
process.stderr.write(
  `\nSolitario ${L}x1 · coordinatore TG · ${SEEDS} seed/variante` +
  ` · mano ${deal.cardsPerPlayer} tallone ${deal.drawCount}\n\n`
);
console.log("variante         | win%  (ok/N)   | motore          | metriche");
console.log("-".repeat(95));

for (const v of VARIANTS) {
  runVariant(v);
}

process.stderr.write("\nProbe completata.\n");