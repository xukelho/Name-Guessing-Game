"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { LEVELS, generateGrid, createGame, selectLetter, advanceAfterCelebration, replay } = require("./game.js");

function fixedRandom() { return 0.37; }
function complete(state) {
  const answer = LEVELS[state.levelIndex].answer;
  for (const letter of answer) {
    const tile = state.grid.find((candidate) => !state.selectedIds.includes(candidate.id) && candidate.letter === letter);
    assert.ok(tile, `existe uma peça disponível para a letra ${letter}`);
    state = selectLetter(state, tile.id);
  }
  return state;
}

test("as grelhas têm o tamanho definido e peças suficientes para cada letra da resposta", () => {
  LEVELS.forEach((level, index) => {
    const grid = generateGrid(index, fixedRandom);
    assert.equal(grid.length, level.rows * level.columns);
    assert.equal(new Set(grid.map((tile) => tile.id)).size, grid.length);
    assert.ok(grid.every((tile) => /^[A-Z]$/.test(tile.letter)));
    for (const letter of new Set(level.answer)) {
      assert.ok(grid.filter((tile) => tile.letter === letter).length >= [...level.answer].filter((c) => c === letter).length);
    }
  });
  assert.deepEqual(LEVELS.map(({ answer, rows, columns }) => [answer, rows, columns]), [
    ["COELHO", 3, 3], ["MACHADO", 4, 4], ["MIGUEL", 5, 5]
  ]);
});

test("uma escolha correta revela apenas a próxima posição e aceita qualquer peça duplicada", () => {
  let state = createGame(fixedRandom);
  const c = state.grid.find((tile) => tile.letter === "C");
  state = selectLetter(state, c.id);
  assert.equal(state.selectedIds.length, 1);
  const oTiles = state.grid.filter((tile) => tile.letter === "O" && !state.selectedIds.includes(tile.id));
  assert.equal(oTiles.length >= 2, true);
  state = selectLetter(state, oTiles[1].id);
  assert.equal(state.selectedIds.length, 2);
  assert.equal(selectLetter(state, oTiles[1].id), state);
});

test("uma peça de preenchimento disponível pode fornecer a letra seguinte", () => {
  let state = createGame(() => 14 / 26);
  const c = state.grid.find((tile) => tile.letter === "C");
  state = selectLetter(state, c.id);
  const oTiles = state.grid.filter((tile) => tile.letter === "O" && !state.selectedIds.includes(tile.id));
  assert.ok(oTiles.length > 2, "a fonte aleatória controlada criou peças de preenchimento correspondentes");
  const filler = oTiles[oTiles.length - 1];
  state = selectLetter(state, filler.id);
  assert.equal(state.selectedIds.length, 2);
  assert.equal(state.grid.find((tile) => tile.id === state.selectedIds[1]).letter, "O");
});

test("uma escolha errada reinicia o progresso sem alterar a grelha, mesmo sem progresso", () => {
  let state = createGame(fixedRandom);
  const grid = state.grid;
  const wrong = state.grid.find((tile) => tile.letter !== "C");
  const zeroReset = selectLetter(state, wrong.id);
  assert.deepEqual(zeroReset.selectedIds, []);
  assert.equal(zeroReset.grid, grid);
  state = selectLetter(state, state.grid.find((tile) => tile.letter === "C").id);
  const deliberateWrong = state.grid.find((tile) => tile.letter !== "O" && !state.selectedIds.includes(tile.id));
  const afterMistake = selectLetter(state, deliberateWrong.id);
  assert.deepEqual(afterMistake.selectedIds, []);
  assert.equal(afterMistake.grid, grid);
});

test("ignora peças inexistentes, já utilizadas ou escolhidas numa fase inválida", () => {
  let state = createGame(fixedRandom);
  assert.equal(selectLetter(state, "missing"), state);
  const c = state.grid.find((tile) => tile.letter === "C");
  state = selectLetter(state, c.id);
  assert.equal(selectLetter(state, c.id), state);
  state = complete({ ...state, selectedIds: [] });
  assert.equal(state.phase, "celebrating");
  assert.equal(selectLetter(state, state.grid[0].id), state);
});

test("cada palavra é concluída, os níveis avançam pela ordem certa e o último termina o jogo", () => {
  let state = createGame(fixedRandom);
  for (let index = 0; index < LEVELS.length; index += 1) {
    state = complete(state);
    assert.equal(state.phase, "celebrating");
    const same = state;
    state = advanceAfterCelebration(state, fixedRandom);
    assert.notEqual(state, same);
    assert.equal(state.phase, index === LEVELS.length - 1 ? "finished" : "playing");
    if (index < LEVELS.length - 1) assert.equal(state.levelIndex, index + 1);
  }
  assert.equal(advanceAfterCelebration(state), state);
});

test("recomeçar inicia o nível 1 com o estado reiniciado", () => {
  let state = createGame(fixedRandom);
  state = complete(state);
  state = advanceAfterCelebration(state, fixedRandom);
  const restarted = replay(fixedRandom);
  assert.equal(restarted.levelIndex, 0);
  assert.equal(restarted.phase, "playing");
  assert.deepEqual(restarted.selectedIds, []);
  assert.notEqual(restarted, state);
});
