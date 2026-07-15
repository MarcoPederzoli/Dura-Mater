"use strict";
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('./mpcards-core.js', 'utf8');
const ctx = { console, require, globalThis: {}, process, Buffer, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(code, ctx, {filename: 'core'});
const core = ctx.globalThis.MPCardsCore;
const deck = core.simulationDeck();

function oneSeed(n, g, seed) {
  const random = core.mulberry32(core.hashSeed('5x5quick:' + g + ':' + seed));
  const strategies = Array.from({ length: g }, () => 'durissima-global-planner');
  const state = core.setupGame(deck, {
    size: n, players: g, random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true,
    strategies
  });
  const draw0 = (state.drawPile || []).length;
  const t0 = Date.now();
  let guard = 0;
  const MAXT = 60000;
  while (state.status === 'playing' && guard++ < 25000) {
    if (Date.now() - t0 > MAXT) break;
    const step = core.botStep(state, strategies, random);
    if (!step || (!step.played && !step.passed && !step.ended && !step.lost)) break;
  }
  const ms = Date.now() - t0;
  const placed = state.board.length;
  const ok = placed >= n*n;
  const nodes = (state._gnPlannerSearch && state._gnPlannerSearch.stats && state._gnPlannerSearch.stats.nodes) || 0;
  console.log('5x' + g + ' seed' + seed + ': tallone0=' + draw0 + ' placed=' + placed + '/25 ' + (ok ? 'SUCCESS' : 'STALL') + '  ' + ms + 'ms  nodes=' + nodes);
  return {g, placed, ok, ms, nodes};
}

console.log('=== Quick 5x5 G>5 tests (1-2 seeds each) ===');
oneSeed(5,6,0);
oneSeed(5,6,1);
oneSeed(5,7,0);
oneSeed(5,7,1);
oneSeed(5,8,0);
oneSeed(5,8,1);

console.log('\n=== Reference 5x5 G=5 ===');
oneSeed(5,5,0);
oneSeed(5,5,1);
