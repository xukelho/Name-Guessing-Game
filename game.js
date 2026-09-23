(function (root) {
  "use strict";

  const LEVELS = Object.freeze([
    Object.freeze({ answer: "COELHO", rows: 3, columns: 3 }),
    Object.freeze({ answer: "MACHADO", rows: 4, columns: 4 }),
    Object.freeze({ answer: "MIGUEL", rows: 5, columns: 5 })
  ]);
  const CELEBRATION_MS = 2000;
  const MOVE_MS = 210;

  function shuffle(items, random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function generateGrid(levelIndex, random = Math.random) {
    const level = LEVELS[levelIndex];
    if (!level) throw new RangeError("Nível desconhecido");
    const letters = Array.from(level.answer);
    while (letters.length < level.rows * level.columns) {
      letters.push(String.fromCharCode(65 + Math.floor(random() * 26)));
    }
    return shuffle(letters.map((letter, index) => ({ id: `tile-${index}`, letter })), random);
  }

  function createGame(random = Math.random) {
    return { levelIndex: 0, grid: generateGrid(0, random), selectedIds: [], phase: "playing" };
  }

  function selectLetter(state, tileId) {
    if (!state || state.phase !== "playing" || !tileId) return state;
    const tile = state.grid.find((entry) => entry.id === tileId);
    if (!tile || state.selectedIds.includes(tileId)) return state;
    const answer = LEVELS[state.levelIndex].answer;
    const progress = state.selectedIds.length;
    if (tile.letter !== answer[progress]) return { ...state, selectedIds: [] };
    const selectedIds = state.selectedIds.concat(tileId);
    return { ...state, selectedIds, phase: selectedIds.length === answer.length ? "celebrating" : "playing" };
  }

  function advanceAfterCelebration(state, random = Math.random) {
    if (!state || state.phase !== "celebrating") return state;
    const nextIndex = state.levelIndex + 1;
    if (nextIndex >= LEVELS.length) return { ...state, phase: "finished" };
    return { levelIndex: nextIndex, grid: generateGrid(nextIndex, random), selectedIds: [], phase: "playing" };
  }

  function replay(random = Math.random) {
    return createGame(random);
  }

  const model = { LEVELS, generateGrid, createGame, selectLetter, advanceAfterCelebration, replay };
  if (typeof module === "object" && module.exports) module.exports = model;
  if (!root || !root.document) return;

  const doc = root.document;
  const gridElement = doc.getElementById("letter-grid");
  const slotsElement = doc.getElementById("answer-slots");
  const levelHeading = doc.getElementById("level-heading");
  const gameElement = doc.getElementById("game");
  const finalElement = doc.getElementById("final-result");
  const statusElement = doc.getElementById("game-status");
  const replayButton = doc.getElementById("replay");
  const canvas = doc.getElementById("fireworks");
  const context = canvas.getContext("2d");
  const reduceMotion = root.matchMedia("(prefers-reduced-motion: reduce)");

  let state = createGame();
  let inputLocked = false;
  let gameGeneration = 0;
  let timers = new Set();
  let frameId = 0;
  let particles = [];

  function later(callback, delay) {
    const generation = gameGeneration;
    const timer = root.setTimeout(() => {
      timers.delete(timer);
      if (generation === gameGeneration) callback();
    }, delay);
    timers.add(timer);
    return timer;
  }

  function clearEffects() {
    for (const timer of timers) root.clearTimeout(timer);
    timers.clear();
    if (frameId) root.cancelAnimationFrame(frameId);
    frameId = 0;
    particles = [];
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    doc.querySelectorAll(".traveling-tile").forEach((node) => node.remove());
    inputLocked = false;
  }

  function announce(message) { statusElement.textContent = message; }

  function render() {
    const level = LEVELS[state.levelIndex];
    gameElement.hidden = state.phase === "finished";
    finalElement.hidden = state.phase !== "finished";
    levelHeading.textContent = `Nível ${state.levelIndex + 1} de ${LEVELS.length}`;
    gridElement.style.setProperty("--grid-columns", level.columns);
    gridElement.setAttribute("aria-label", `Letras disponíveis, ${level.rows} linhas por ${level.columns} colunas`);
    slotsElement.replaceChildren();
    Array.from(level.answer).forEach((_, index) => {
      const slot = doc.createElement("li");
      slot.className = "answer-slot";
      slot.setAttribute("aria-label", state.selectedIds[index] ? `Letra ${index + 1} descoberta` : `Letra ${index + 1} por descobrir`);
      slot.textContent = state.selectedIds[index]
        ? state.grid.find((tile) => tile.id === state.selectedIds[index]).letter
        : "_";
      slotsElement.append(slot);
    });
    gridElement.replaceChildren();
    state.grid.forEach((tile, index) => {
      const row = Math.floor(index / level.columns) + 1;
      const column = (index % level.columns) + 1;
      if (state.selectedIds.includes(tile.id)) {
        const placeholder = doc.createElement("span");
        placeholder.className = "letter-tile is-consumed";
        placeholder.setAttribute("aria-hidden", "true");
        gridElement.append(placeholder);
        return;
      }
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "letter-tile";
      button.textContent = tile.letter;
      button.setAttribute("aria-label", `Letra ${tile.letter}, linha ${row}, coluna ${column}`);
      button.disabled = inputLocked || state.phase !== "playing";
      button.dataset.tileId = tile.id;
      button.addEventListener("click", () => handleTile(tile, button));
      gridElement.append(button);
    });
  }

  function focusAvailableTile() {
    const next = gridElement.querySelector("button:not(:disabled)");
    if (next) next.focus();
  }

  function animateTravel(source, slotIndex, completion) {
    if (reduceMotion.matches) { completion(); return; }
    const target = slotsElement.children[slotIndex];
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.classList.add("traveling-tile");
    ghost.removeAttribute("data-tile-id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.tabIndex = -1;
    ghost.disabled = true;
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    ghost.style.width = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    ghost.style.visibility = "visible";
    doc.body.append(ghost);
    const animation = ghost.animate([
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(.62)` }
    ], { duration: MOVE_MS, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" });
    animation.onfinish = () => { ghost.remove(); completion(); };
    animation.oncancel = () => ghost.remove();
  }

  function handleTile(tile, button) {
    if (inputLocked || state.phase !== "playing") return;
    const answer = LEVELS[state.levelIndex].answer;
    const isCorrect = tile.letter === answer[state.selectedIds.length];
    const before = button.getBoundingClientRect();
    const previousProgress = state.selectedIds.length;
    const next = selectLetter(state, tile.id);
    if (next === state) return;
    if (!isCorrect) {
      state = next;
      render();
      const restored = gridElement.querySelector(`[data-tile-id="${tile.id}"]`);
      if (restored) {
        restored.classList.add("is-error");
        later(() => restored.isConnected && restored.classList.remove("is-error"), 360);
      }
      announce("Tenta novamente. O progresso foi reiniciado.");
      focusAvailableTile();
      return;
    }

    inputLocked = true;
    state = next;
    render();
    const slot = slotsElement.children[previousProgress];
    const fromButton = doc.createElement("button");
    fromButton.className = "letter-tile";
    fromButton.textContent = tile.letter;
    fromButton.setAttribute("aria-hidden", "true");
    fromButton.disabled = true;
    fromButton.style.position = "fixed";
    fromButton.style.left = `${before.left}px`;
    fromButton.style.top = `${before.top}px`;
    fromButton.style.width = `${before.width}px`;
    fromButton.style.height = `${before.height}px`;
    fromButton.style.visibility = "hidden";
    doc.body.append(fromButton);
    announce(`Letra ${tile.letter} descoberta. ${state.selectedIds.length} de ${answer.length} letras encontradas.`);
    animateTravel(fromButton, previousProgress, () => {
      fromButton.remove();
      if (state.phase === "celebrating") {
        startCelebration();
        return;
      }
      inputLocked = false;
      render();
      focusAvailableTile();
    });
  }

  function resizeCanvas() {
    const ratio = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(root.innerWidth * ratio);
    canvas.height = Math.floor(root.innerHeight * ratio);
    canvas.style.width = `${root.innerWidth}px`;
    canvas.style.height = `${root.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function startCelebration() {
    announce("Nível concluído!");
    if (!reduceMotion.matches) launchFireworks();
    later(() => {
      stopFireworks();
      state = advanceAfterCelebration(state);
      inputLocked = false;
      if (state.phase === "finished") {
        render();
        announce("Miguel Machado Coelho. Parabens! Conseguiste descubrir o nome");
        replayButton.focus();
      } else {
        render();
        announce(`Nível ${state.levelIndex + 1} de ${LEVELS.length}. Descobre o nome, uma letra de cada vez.`);
        levelHeading.focus();
      }
    }, CELEBRATION_MS);
  }

  function launchFireworks() {
    resizeCanvas();
    const colors = ["#ff5577", "#ffbc42", "#41b9a4", "#7b61d1", "#4d9df0"];
    const bursts = Array.from({ length: 5 }, (_, i) => ({
      x: root.innerWidth * (.15 + i * .17), y: root.innerHeight * (.2 + (i % 2) * .17),
      particles: Array.from({ length: 28 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 4;
        return { x: 0, y: 0, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 35 + Math.random() * 30, color: colors[Math.floor(Math.random() * colors.length)] };
      })
    }));
    particles = bursts.flatMap((burst) => burst.particles.map((particle) => ({ ...particle, x: burst.x, y: burst.y })));
    const draw = () => {
      context.clearRect(0, 0, root.innerWidth, root.innerHeight);
      particles = particles.filter((particle) => particle.life > 0);
      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += .035;
        particle.life -= 1;
        context.globalAlpha = Math.min(1, particle.life / 18);
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, 3.2, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      if (particles.length) frameId = root.requestAnimationFrame(draw);
    };
    frameId = root.requestAnimationFrame(draw);
  }

  function stopFireworks() {
    if (frameId) root.cancelAnimationFrame(frameId);
    frameId = 0;
    particles = [];
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  replayButton.addEventListener("click", () => {
    gameGeneration += 1;
    clearEffects();
    state = replay();
    announce("Descobre o nome, uma letra de cada vez.");
    render();
    focusAvailableTile();
  });

  root.addEventListener("resize", resizeCanvas);
  render();
})(typeof window === "object" ? window : null);
