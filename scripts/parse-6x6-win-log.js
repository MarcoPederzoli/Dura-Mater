"use strict";
/**
 * Ricostruisce la vittoria solitaria 6x6 da log UI (ordine: piu' recente in alto).
 * Uso: node scripts/parse-6x6-win-log.js
 */
const fs = require("fs");
const path = require("path");

const log = `Biancaneve gioca 456 in (-5, 1).
Biancaneve gioca 486 in (-5, 2).
Fine turno (nessuna altra posa).
Biancaneve gioca 478 in (-4, 1).
Biancaneve gioca 688 in (-4, 2).
Fine turno (nessuna altra posa).
Biancaneve gioca 637 in (-1, -3).
Biancaneve gioca 247 in (0, -3).
Fine turno (nessuna altra posa).
Biancaneve gioca 356 in (0, 1).
Biancaneve gioca 336 in (0, 2).
Biancaneve chiude il turno.
Biancaneve gioca 586 in (-5, -3).
Biancaneve chiude il turno.
Biancaneve gioca 687 in (-5, -2).
Fine turno (nessuna altra posa).
Biancaneve gioca 238 in (-3, 2).
Biancaneve gioca 675 in (-5, -1).
Biancaneve chiude il turno.
Biancaneve gioca 663 in (-2, -3).
Fine turno (nessuna altra posa).
Biancaneve gioca 674 in (-3, -3).
Biancaneve gioca 554 in (-4, -3).
Biancaneve chiude il turno.
Biancaneve gioca 655 in (-4, -2).
Biancaneve IDEA (jolly): 666 in (-5, 0). Biancaneve chiude il turno.
Biancaneve gioca 538 in (-2, 1). IDEA: puo' posare una quinta carta jolly.
Biancaneve gioca 564 in (-2, -2).
Biancaneve gioca 467 in (0, -2).
Biancaneve gioca 577 in (-1, -2).
Biancaneve chiude il turno.
Biancaneve gioca 428 in (-3, 1).
Biancaneve chiude il turno.
Biancaneve gioca 684 in (-3, -2).
Biancaneve chiude il turno.
Biancaneve gioca 437 in (-2, 2).
Biancaneve chiude il turno.
Biancaneve gioca 367 in (-1, 2).
Biancaneve chiude il turno.
Biancaneve gioca 348 in (-1, 1).
Fine turno (nessuna altra posa).
Biancaneve gioca 445 in (-4, -1).
Biancaneve gioca 575 in (-4, 0).
Fine turno (nessuna altra posa).
Biancaneve gioca 646 in (-3, -1).
Biancaneve gioca 678 in (-3, 0).
Fine turno (nessuna altra posa).
Biancaneve gioca 548 in (-2, -1).
Biancaneve gioca 118 in (-2, 0).
Fine turno (nessuna altra posa).
Biancaneve gioca 587 in (-1, -1).
Biancaneve gioca 227 in (0, -1).
Fine turno (nessuna altra posa).
Biancaneve gioca 588 in (-1, 0).
Fine turno (nessuna altra posa).
Biancaneve gioca 328 in (0, 0).
Inizio partita`;

const lines = log
  .trim()
  .split(/\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .reverse();

const events = [];
for (const line of lines) {
  if (/^Inizio partita/i.test(line)) {
    events.push({ t: "start" });
    continue;
  }
  const mIdea = line.match(/IDEA \(jolly\):\s*(\d+)\s+in\s+\((-?\d+),\s*(-?\d+)\)/i);
  if (mIdea) {
    events.push({
      t: "place",
      code: mIdea[1].padStart(3, "0"),
      x: +mIdea[2],
      y: +mIdea[3],
      idea: true
    });
    // Stessa riga UI: «IDEA (jolly): … Biancaneve chiude il turno.»
    if (/chiude il turno|Fine turno/i.test(line)) {
      events.push({ t: "endTurn", forced: /Fine turno/i.test(line) });
    }
    continue;
  }
  const m = line.match(/gioca\s+(\d+)\s+in\s+\((-?\d+),\s*(-?\d+)\)/i);
  if (m) {
    events.push({
      t: "place",
      code: m[1].padStart(3, "0"),
      x: +m[2],
      y: +m[3],
      idea: false,
      ideaOffer: /IDEA:\s*puo/i.test(line)
    });
    if (/chiude il turno|Fine turno/i.test(line) && !/IDEA:\s*puo/i.test(line)) {
      events.push({ t: "endTurn", forced: /Fine turno/i.test(line) });
    }
    continue;
  }
  if (/chiude il turno|Fine turno/i.test(line)) {
    events.push({ t: "endTurn", forced: /Fine turno/i.test(line) });
    continue;
  }
  events.push({ t: "other", line });
}

const board = new Map();
const order = [];
let turnIdx = 1;
let placementsThisTurn = [];
const turns = [];

function flushTurn(forced) {
  if (placementsThisTurn.length || forced) {
    turns.push({
      turn: turnIdx,
      places: placementsThisTurn.slice(),
      forcedEnd: !!forced
    });
    turnIdx++;
    placementsThisTurn = [];
  }
}

for (const e of events) {
  if (e.t === "start") continue;
  if (e.t === "place") {
    const key = `${e.x},${e.y}`;
    if (board.has(key)) {
      console.warn("OVERWRITE", key, board.get(key), "->", e.code);
    }
    board.set(key, { code: e.code, idea: !!e.idea });
    order.push(e);
    placementsThisTurn.push(e);
    continue;
  }
  if (e.t === "endTurn") flushTurn(e.forced);
}
flushTurn(false);

const xs = [...board.keys()].map((k) => +k.split(",")[0]);
const ys = [...board.keys()].map((k) => +k.split(",")[1]);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);

const report = [];
function out(s = "") {
  report.push(s);
  console.log(s);
}

out("# Ricostruzione log — solitario 6x6 (Biancaneve)");
out("");
out("Log UI: eventi dal piu' recente al piu' vecchio; ricostruzione in ordine cronologico.");
out("Seed: non presente nel log.");
out("");
out(`Celle: ${board.size} | bbox x=[${minX}..${maxX}] y=[${minY}..${maxY}] | ${maxX - minX + 1}x${maxY - minY + 1}`);
out(`Codici unici: ${new Set([...board.values()].map((v) => v.code)).size}`);
const ideas = [...board.entries()].filter(([, v]) => v.idea);
out(`Jolly Idea: ${ideas.map(([k, v]) => `${v.code} @ (${k})`).join(", ") || "(nessuno)"}`);
out("");
out("## Griglia finale (codice; J = ideaBlind)");
out("");
out("```");
// y crescente verso il basso (come coordinate del log)
let header = "     ";
for (let x = minX; x <= maxX; x++) header += String(x).padStart(6);
out(header);
for (let y = minY; y <= maxY; y++) {
  let row = `y=${String(y).padStart(3)}`;
  for (let x = minX; x <= maxX; x++) {
    const v = board.get(`${x},${y}`);
    row += v ? (v.idea ? ` J${v.code}` : `  ${v.code}`) : "   ·  ";
  }
  out(row);
}
out("```");
out("");
out("## Sequenza cronologica delle pose");
out("");
order.forEach((e, i) => {
  out(
    `${String(i + 1).padStart(2)}. ${e.idea ? "IDEA" : "    "} ${e.code} @ (${e.x}, ${e.y})${
      e.ideaOffer ? "  [offerta Idea dopo questa posa — log]" : ""
    }`
  );
});
out("");
out("## Turni");
out("");
const lens = turns.map((t) => t.places.length);
out(`Numero turni: ${turns.length}`);
out(`Carte/turno: ${lens.join(", ")}`);
out(`Max catena: ${Math.max(...lens)}`);
out(
  `Fine forzata (nessuna altra posa): ${turns.filter((t) => t.forcedEnd).length} · Chiudi volontario: ${
    turns.filter((t) => !t.forcedEnd).length
  }`
);
out("");
for (const t of turns) {
  const codes = t.places
    .map((p) => (p.idea ? `J${p.code}` : p.code) + `:(${p.x},${p.y})`)
    .join(" → ");
  out(
    `- T${t.turn} (${t.places.length} pose${t.forcedEnd ? ", fine auto" : ", chiude"}): ${codes || "(vuoto)"}`
  );
}

// Nota sul log Idea "corrotto": 538 con offerta Idea ma 538 non e' 4a del turno
out("");
out("## Note sul log Idea");
out("");
out(
  "Turno Idea (cronologico): quattro pose 577 → 467 → 564 → 538 (log: offerta quinta), poi **jolly 666 @ (-5,0)** e chiusura turno."
);
out(
  "Il jolly 666 e' sul bordo sinistro della griglia finale (colonna x=-5, riga y=0), come buco topologico verso il packing del lato ovest."
);

const long = turns.filter((t) => t.places.length >= 4);
out("");
out(`Turni con >=4 pose: ${long.map((t) => `T${t.turn}:${t.places.length}`).join(", ") || "nessuno"}`);

const outPath = path.join(__dirname, "..", "results", "human-6x6-win-log-reconstruction.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, report.join("\n") + "\n", "utf8");
console.log("\nWrote", outPath);
