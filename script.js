const STORAGE_KEY = "aurora-rush-save";
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const viewport = { width: window.innerWidth, height: window.innerHeight };

const ui = {
  scoreValue: document.getElementById("scoreValue"),
  distanceValue: document.getElementById("distanceValue"),
  multiplierValue: document.getElementById("multiplierValue"),
  coinValue: document.getElementById("coinValue"),
  bestValue: document.getElementById("bestValue"),
  missionTitle: document.getElementById("missionTitle"),
  missionProgress: document.getElementById("missionProgress"),
  powerupTray: document.getElementById("powerupTray"),
  comboNotice: document.getElementById("comboNotice"),
  startOverlay: document.getElementById("startOverlay"),
  pauseOverlay: document.getElementById("pauseOverlay"),
  gameOverOverlay: document.getElementById("gameOverOverlay"),
  pauseButton: document.getElementById("pauseButton"),
  startButton: document.getElementById("startButton"),
  resumeButton: document.getElementById("resumeButton"),
  restartButton: document.getElementById("restartButton"),
  menuButton: document.getElementById("menuButton"),
  gameOverTitle: document.getElementById("gameOverTitle"),
  gameOverSummary: document.getElementById("gameOverSummary"),
  resultNearMisses: document.getElementById("resultNearMisses"),
  resultCoins: document.getElementById("resultCoins"),
  resultMultiplier: document.getElementById("resultMultiplier"),
  resultMission: document.getElementById("resultMission"),
};

const LANES = [-1, 0, 1];
const segmentLength = 16;
const visibleDepth = 160;
const baseSpeed = 24;
const topSpeed = 42;
const laneSpacing = 1.25;
const playerBaseY = 0;

const palette = {
  skyTop: "#69c3ff",
  skyBottom: "#ff9d48",
  cityDark: "#482f8d",
  cityMid: "#ff9147",
  cityLight: "#ffd861",
  rail: "#c7ddf2",
  sleeper: "#5b4b6e",
  signalRed: "#ff5d5d",
  signalWhite: "#f6f8ff",
  gold: "#ffca3a",
  magnet: "#71f0c4",
  shield: "#67b7ff",
  double: "#c58cff",
  trainBody: "#eef4ff",
  trainStripe: "#ff625d",
  obstacle: "#ef4a4a",
  lowObstacle: "#ffffff",
  playerHood: "#ff9847",
  playerPants: "#3f2f96",
  playerShoes: "#ffffff",
  spark: "#fff3b2",
};

const missionPool = [
  { id: "coins", title: "Collecter 40 pièces", target: 40 },
  { id: "distance", title: "Parcourir 800 m", target: 800 },
  { id: "nearMiss", title: "Réussir 6 near misses", target: 6 },
];

const audio = {
  ctx: null,
  unlocked: false,
};

const state = {
  mode: "menu",
  time: 0,
  speed: baseSpeed,
  distance: 0,
  score: 0,
  coins: 0,
  bestScore: 0,
  mission: structuredClone(missionPool[0]),
  missionProgress: 0,
  maxMultiplier: 1,
  comboTimer: 0,
  comboText: "",
  nearMisses: 0,
  segments: [],
  particles: [],
  player: createPlayer(),
  lastFrame: 0,
  inputLock: 0,
};

loadMeta();
resizeCanvas();
setupEvents();
updateHud();
requestAnimationFrame(loop);

function createPlayer() {
  return {
    lane: 1,
    targetLane: 1,
    laneOffset: 0,
    y: 0,
    vy: 0,
    slideTimer: 0,
    jumpTimer: 0,
    shield: 0,
    magnet: 0,
    doubleScore: 0,
    dash: 0,
    animationTime: 0,
    justLanded: 0,
  };
}

function resetRun() {
  state.mode = "running";
  state.time = 0;
  state.speed = baseSpeed;
  state.distance = 0;
  state.score = 0;
  state.coins = 0;
  state.nearMisses = 0;
  state.comboTimer = 0;
  state.comboText = "";
  state.maxMultiplier = 1;
  state.particles = [];
  state.player = createPlayer();
  state.segments = [];
  state.mission = structuredClone(missionPool[(Math.random() * missionPool.length) | 0]);
  state.missionProgress = 0;

  let z = 28;
  while (z < visibleDepth + 40) {
    addSegment(z);
    z += segmentLength;
  }

  toggleOverlay(ui.startOverlay, false);
  toggleOverlay(ui.pauseOverlay, false);
  toggleOverlay(ui.gameOverOverlay, false);
  unlockAudio();
  updateHud();
}

function setupEvents() {
  window.addEventListener("resize", resizeCanvas);

  ui.startButton.addEventListener("click", resetRun);
  ui.restartButton.addEventListener("click", resetRun);
  ui.menuButton.addEventListener("click", () => {
    state.mode = "menu";
    toggleOverlay(ui.gameOverOverlay, false);
    toggleOverlay(ui.startOverlay, true);
  });
  ui.pauseButton.addEventListener("click", togglePause);
  ui.resumeButton.addEventListener("click", togglePause);

  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }

    if (event.key.toLowerCase() === "p") {
      togglePause();
      return;
    }

    if (state.mode !== "running") {
      return;
    }

    const key = event.key.toLowerCase();
    if (event.key === "ArrowLeft" || key === "q" || key === "a") {
      changeLane(-1);
    }
    if (event.key === "ArrowRight" || key === "d") {
      changeLane(1);
    }
    if (event.key === "ArrowUp" || key === "z" || key === "w" || event.code === "Space") {
      jump();
    }
    if (event.key === "ArrowDown" || key === "s") {
      slide();
    }
  });

  let pointerStart = null;

  const beginTouch = (x, y) => {
    pointerStart = { x, y };
  };

  const endTouch = (x, y) => {
    if (!pointerStart || state.mode !== "running") {
      pointerStart = null;
      return;
    }

    const dx = x - pointerStart.x;
    const dy = y - pointerStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < 28) {
      pointerStart = null;
      return;
    }

    if (absX > absY) {
      changeLane(dx > 0 ? 1 : -1);
    } else if (dy < 0) {
      jump();
    } else {
      slide();
    }

    pointerStart = null;
  };

  canvas.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    beginTouch(touch.clientX, touch.clientY);
  }, { passive: true });

  canvas.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    endTouch(touch.clientX, touch.clientY);
  }, { passive: true });

  canvas.addEventListener("mousedown", (event) => beginTouch(event.clientX, event.clientY));
  canvas.addEventListener("mouseup", (event) => endTouch(event.clientX, event.clientY));
}

function togglePause() {
  if (state.mode === "running") {
    state.mode = "paused";
    toggleOverlay(ui.pauseOverlay, true);
  } else if (state.mode === "paused") {
    state.mode = "running";
    toggleOverlay(ui.pauseOverlay, false);
  }
}

function loop(timestamp) {
  if (!state.lastFrame) {
    state.lastFrame = timestamp;
  }
  const dt = Math.min((timestamp - state.lastFrame) / 1000, 0.033);
  state.lastFrame = timestamp;

  if (state.mode === "running") {
    update(dt);
  }
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  state.time += dt;
  state.speed = Math.min(topSpeed, baseSpeed + state.distance / 220);
  state.distance += state.speed * dt;
  state.inputLock = Math.max(0, state.inputLock - dt);

  const player = state.player;
  player.animationTime += dt * (1.8 + state.speed * 0.03);
  player.justLanded = Math.max(0, player.justLanded - dt * 4);

  const desiredOffset = (player.targetLane - 1) * laneSpacing;
  player.laneOffset += (desiredOffset - player.laneOffset) * Math.min(1, dt * 14);
  if (Math.abs(desiredOffset - player.laneOffset) < 0.02) {
    player.laneOffset = desiredOffset;
    player.lane = player.targetLane;
  }

  if (player.slideTimer > 0) {
    player.slideTimer -= dt;
  }

  player.vy -= 30 * dt;
  player.y += player.vy * dt;
  if (player.y <= playerBaseY) {
    if (player.vy < -1) {
      player.justLanded = 1;
      addParticles(0, 0, 6, palette.spark);
      playSound(160, 0.06, "triangle");
    }
    player.y = playerBaseY;
    player.vy = 0;
    player.jumpTimer = 0;
  } else {
    player.jumpTimer += dt;
  }

  player.shield = Math.max(0, player.shield - dt);
  player.magnet = Math.max(0, player.magnet - dt);
  player.doubleScore = Math.max(0, player.doubleScore - dt);
  state.comboTimer = Math.max(0, state.comboTimer - dt);

  moveWorld(dt);
  maybeSpawnSegments();
  updateParticles(dt);
  updatePowerupUi();
  updateHud();
}

function moveWorld(dt) {
  for (const segment of state.segments) {
    segment.z -= state.speed * dt;
    for (const coin of segment.coins) {
      coin.z -= state.speed * dt;
      if (!coin.collected) {
        updateCoinMagnet(coin, dt);
        tryCollectCoin(coin);
      }
    }

    for (const obstacle of segment.obstacles) {
      obstacle.z -= state.speed * dt;
      if (!obstacle.passed) {
        evaluateObstacle(obstacle);
      }
    }

    if (segment.powerup && !segment.powerup.collected) {
      segment.powerup.z -= state.speed * dt;
      tryCollectPowerup(segment.powerup);
    }
  }

  state.segments = state.segments.filter((segment) => segment.z > -16);
}

function maybeSpawnSegments() {
  let furthest = state.segments.length ? state.segments[state.segments.length - 1].z : 28;
  while (furthest < visibleDepth + 32) {
    furthest += segmentLength;
    addSegment(furthest);
  }
}

function addSegment(zStart) {
  const difficulty = getDifficultyTier();
  const roll = Math.random();
  const segment = {
    z: zStart,
    type: "calm",
    obstacles: [],
    coins: [],
    powerup: null,
    scenery: createScenery(zStart),
  };

  if (roll < 0.3) {
    segment.type = "coins";
    populateCoinRibbon(segment);
  } else if (roll < 0.48) {
    segment.type = "switch";
    populateSwitchPattern(segment, difficulty);
  } else if (roll < 0.62) {
    segment.type = "jump";
    populateJumpPattern(segment, difficulty);
  } else if (roll < 0.74) {
    segment.type = "slide";
    populateSlidePattern(segment, difficulty);
  } else if (roll < 0.86) {
    segment.type = "train";
    populateTrainPattern(segment, difficulty);
  } else {
    segment.type = "combo";
    populateComboPattern(segment, difficulty);
  }

  if (Math.random() < 0.12) {
    addCoinsArc(segment, 1, zStart + 7, 5);
  }

  if (Math.random() < 0.08) {
    segment.powerup = createPowerup(zStart + 11);
  }

  state.segments.push(segment);
}

function populateCoinRibbon(segment) {
  const lane = (Math.random() * 3) | 0;
  for (let i = 0; i < 8; i += 1) {
    segment.coins.push(createCoin(lane, segment.z + 2 + i * 1.6, 0.55));
  }
  if (Math.random() < 0.5) {
    addCoinsArc(segment, lane, segment.z + 7, 6);
  }
}

function populateSwitchPattern(segment, difficulty) {
  const blockedLane = (Math.random() * 3) | 0;
  segment.obstacles.push(createObstacle("signal", blockedLane, segment.z + 8, "switch"));
  addCoinsLane(segment, blockedLane === 0 ? 2 : 0, segment.z + 4, 5);

  if (difficulty > 3 && Math.random() < 0.28) {
    const secondLane = blockedLane === 1 ? 2 : 1;
    segment.obstacles.push(createObstacle("crate", secondLane, segment.z + 13, "switch"));
  }
}

function populateJumpPattern(segment, difficulty) {
  const lane = (Math.random() * 3) | 0;
  segment.obstacles.push(createObstacle("barrierLow", lane, segment.z + 9, "jump"));
  addCoinsArc(segment, lane, segment.z + 9, 6);

  if (difficulty > 2 && Math.random() < 0.24) {
    const altLane = lane === 1 ? 0 : 1;
    segment.coins.push(createCoin(altLane, segment.z + 7, 0.5));
    segment.coins.push(createCoin(altLane, segment.z + 9, 0.5));
  }
}

function populateSlidePattern(segment, difficulty) {
  const lane = (Math.random() * 3) | 0;
  segment.obstacles.push(createObstacle("barrierHigh", lane, segment.z + 9, "slide"));
  addCoinsLane(segment, lane, segment.z + 5, 4, 0.38);

  if (difficulty > 3 && Math.random() < 0.22) {
    const blockedLane = lane === 2 ? 0 : 2;
    segment.obstacles.push(createObstacle("signal", blockedLane, segment.z + 13, "switch"));
  }
}

function populateTrainPattern(segment, difficulty) {
  const lane = (Math.random() * 3) | 0;
  const length = difficulty > 2 ? 8.4 : 6.8;
  segment.obstacles.push(createObstacle("train", lane, segment.z + 10, "switch", length));
  addCoinsLane(segment, lane === 0 ? 1 : 0, segment.z + 4, 5);

  if (difficulty > 4 && Math.random() < 0.28) {
    const secondLane = lane === 2 ? 1 : 2;
    segment.obstacles.push(createObstacle("barrierLow", secondLane, segment.z + 14, "jump"));
  }
}

function populateComboPattern(segment, difficulty) {
  const baseLane = (Math.random() * 3) | 0;
  segment.obstacles.push(createObstacle("signal", baseLane, segment.z + 7, "switch"));
  if (difficulty > 2) {
    segment.obstacles.push(createObstacle("barrierLow", (baseLane + 1) % 3, segment.z + 11.5, "jump"));
  }
  if (difficulty > 4) {
    segment.obstacles.push(createObstacle("barrierHigh", baseLane === 0 ? 2 : 0, segment.z + 14.5, "slide"));
  }
  addCoinsLane(segment, 1, segment.z + 3, 7);
}

function createScenery(zStart) {
  const variant = (Math.random() * 6) | 0;
  return {
    variant,
    leftHeight: 40 + Math.random() * 80,
    rightHeight: 40 + Math.random() * 80,
    leftColor: ["#5531ad", "#ff9349", "#ffd267", "#8b5dff"][variant % 4],
    rightColor: ["#40367f", "#ffb347", "#7456ff", "#fe7f5d"][(variant + 1) % 4],
    bridge: Math.random() < 0.22,
    tunnel: Math.random() < 0.12,
    arch: Math.random() < 0.28,
    cables: Math.random() < 0.45,
    z: zStart,
  };
}

function createCoin(lane, z, y) {
  return {
    lane,
    x: laneToWorld(lane),
    z,
    y,
    radius: 0.22,
    collected: false,
  };
}

function createPowerup(z) {
  const types = ["magnet", "shield", "double"];
  const lane = (Math.random() * 3) | 0;
  return {
    type: types[(Math.random() * types.length) | 0],
    lane,
    x: laneToWorld(lane),
    z,
    y: 0.65,
    collected: false,
  };
}

function createObstacle(kind, lane, z, action, length = 2.6) {
  const definitions = {
    barrierLow: { width: 0.86, height: 0.7, length: 0.6, color: palette.obstacle, action },
    barrierHigh: { width: 0.86, height: 1.5, length: 0.5, color: palette.signalWhite, action },
    signal: { width: 0.42, height: 1.8, length: 0.42, color: palette.signalRed, action },
    crate: { width: 0.74, height: 0.95, length: 0.8, color: "#d87939", action },
    train: { width: 1.12, height: 1.9, length, color: palette.trainBody, action },
  };

  return {
    kind,
    lane,
    x: laneToWorld(lane),
    z,
    nearMissAwarded: false,
    passed: false,
    ...definitions[kind],
  };
}

function laneToWorld(laneIndex) {
  return LANES[laneIndex] * laneSpacing;
}

function addCoinsLane(segment, lane, startZ, count, y = 0.6) {
  for (let i = 0; i < count; i += 1) {
    segment.coins.push(createCoin(lane, startZ + i * 1.55, y));
  }
}

function addCoinsArc(segment, lane, centerZ, count) {
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    const height = 0.55 + Math.sin(t * Math.PI) * 1.2;
    segment.coins.push(createCoin(lane, centerZ - 3 + i * 1.15, height));
  }
}

function getDifficultyTier() {
  if (state.distance < 250) {
    return 1;
  }
  if (state.distance < 650) {
    return 2;
  }
  if (state.distance < 1300) {
    return 3;
  }
  if (state.distance < 2200) {
    return 4;
  }
  return 5;
}

function changeLane(direction) {
  if (state.mode !== "running" || state.inputLock > 0) {
    return;
  }
  const nextLane = Math.max(0, Math.min(2, state.player.targetLane + direction));
  if (nextLane !== state.player.targetLane) {
    state.player.targetLane = nextLane;
    state.inputLock = 0.07;
    pulseCombo(direction < 0 ? "Dash gauche" : "Dash droite", 0.45);
    playSound(280, 0.045, "square");
  }
}

function jump() {
  const player = state.player;
  if (state.mode !== "running" || player.y > 0.01) {
    return;
  }
  player.vy = player.doubleScore > 0 ? 11.3 : 9.2;
  player.slideTimer = 0;
  playSound(520, 0.05, "triangle");
}

function slide() {
  const player = state.player;
  if (state.mode !== "running" || player.slideTimer > 0 || player.y > 0.2) {
    return;
  }
  player.slideTimer = 0.72;
  pulseCombo("Glissade", 0.4);
  playSound(180, 0.05, "sawtooth");
}

function evaluateObstacle(obstacle) {
  const laneDistance = Math.abs(state.player.laneOffset - laneToWorld(obstacle.lane));
  const sameLane = laneDistance < laneSpacing * 0.34;

  if (!obstacle.nearMissAwarded && Math.abs(obstacle.z) < 1.6 && !sameLane) {
    obstacle.nearMissAwarded = true;
    awardNearMiss();
  }

  if (obstacle.z < -obstacle.length) {
    obstacle.passed = true;
    return;
  }

  if (!sameLane) {
    return;
  }

  if (obstacle.z > 1.3 || obstacle.z < -1.0) {
    return;
  }

  const player = state.player;
  const isJumping = player.y > 0.52;
  const isSliding = player.slideTimer > 0.08;
  let avoided = false;

  if (obstacle.action === "jump" && isJumping) {
    avoided = true;
  }
  if (obstacle.action === "slide" && isSliding) {
    avoided = true;
  }
  if (obstacle.action === "switch" && player.lane !== obstacle.lane && Math.abs(player.laneOffset - laneToWorld(obstacle.lane)) > 0.45) {
    avoided = true;
  }

  if (obstacle.kind === "train" && player.dash > 0) {
    avoided = true;
  }

  if (avoided) {
    obstacle.passed = true;
    return;
  }

  crash();
  obstacle.passed = true;
}

function tryCollectCoin(coin) {
  const player = state.player;
  const dx = coin.x - player.laneOffset;
  const dz = coin.z;
  const dy = coin.y - (0.55 + player.y);
  if (Math.abs(dz) < 0.95 && Math.abs(dx) < 0.42 && Math.abs(dy) < 1.05) {
    coin.collected = true;
    state.coins += 1;
    state.score += 8 * getMultiplier();
    if (state.mission.id === "coins") {
      state.missionProgress += 1;
    }
    addParticles(coin.x, coin.y, 6, palette.gold);
    pulseCombo("+1 pièce", 0.25);
    playSound(760, 0.035, "sine");
  }
}

function updateCoinMagnet(coin, dt) {
  const player = state.player;
  if (player.magnet <= 0) {
    return;
  }
  const dz = Math.abs(coin.z);
  const dx = player.laneOffset - coin.x;
  if (dz < 10 && Math.abs(dx) < 2.3) {
    coin.x += dx * Math.min(1, dt * 6);
    coin.y += (0.62 + player.y - coin.y) * Math.min(1, dt * 5);
  }
}

function tryCollectPowerup(powerup) {
  const dx = powerup.x - state.player.laneOffset;
  if (Math.abs(powerup.z) < 1.0 && Math.abs(dx) < 0.45 && Math.abs(powerup.y - (0.6 + state.player.y)) < 1.1) {
    powerup.collected = true;
    activatePowerup(powerup.type);
  }
}

function activatePowerup(type) {
  if (type === "magnet") {
    state.player.magnet = 10;
    pulseCombo("Aimant activé", 0.9);
    addParticles(state.player.laneOffset, 0.6, 14, palette.magnet);
  }
  if (type === "shield") {
    state.player.shield = 12;
    pulseCombo("Bouclier prêt", 0.9);
    addParticles(state.player.laneOffset, 0.6, 14, palette.shield);
  }
  if (type === "double") {
    state.player.doubleScore = 12;
    pulseCombo("Score x2", 0.9);
    addParticles(state.player.laneOffset, 0.6, 14, palette.double);
  }
  vibrate([18, 12, 24]);
  playSound(320, 0.08, "sine");
}

function crash() {
  const player = state.player;
  if (player.shield > 0) {
    player.shield = 0;
    pulseCombo("Bouclier brisé", 0.9);
    addParticles(player.laneOffset, 0.6, 18, palette.signalRed);
    playSound(120, 0.12, "square");
    vibrate([24, 14, 24]);
    return;
  }

  state.mode = "gameover";
  state.bestScore = Math.max(state.bestScore, Math.floor(state.score));
  saveMeta();
  ui.gameOverTitle.textContent = state.distance > 1200 ? "Run impressionnante" : "Encore un essai ?";
  ui.gameOverSummary.textContent = `${Math.floor(state.score)} points • ${Math.floor(state.distance)} mètres • ${state.coins} pièces`;
  ui.resultNearMisses.textContent = state.nearMisses;
  ui.resultCoins.textContent = state.coins;
  ui.resultMultiplier.textContent = `x${state.maxMultiplier.toFixed(1)}`;
  ui.resultMission.textContent = `${Math.min(100, Math.round((state.missionProgress / state.mission.target) * 100))}%`;
  toggleOverlay(ui.gameOverOverlay, true);
  playSound(92, 0.18, "sawtooth");
  vibrate([40, 30, 50]);
}

function awardNearMiss() {
  state.nearMisses += 1;
  state.score += 18 * getMultiplier();
  if (state.mission.id === "nearMiss") {
    state.missionProgress += 1;
  }
  pulseCombo("Near miss +", 0.7);
  addParticles(state.player.laneOffset, 0.7, 10, palette.spark);
  playSound(880, 0.04, "triangle");
}

function getMultiplier() {
  const base = 1 + Math.min(3.5, state.distance / 950);
  const bonus = state.player.doubleScore > 0 ? 1 : 0;
  const combo = Math.min(1.5, state.nearMisses * 0.08);
  const total = +(base + bonus + combo).toFixed(1);
  state.maxMultiplier = Math.max(state.maxMultiplier, total);
  return total;
}

function updateHud() {
  state.score += state.speed * 0.09;
  if (state.mission.id === "distance") {
    state.missionProgress += state.speed * 0.09;
  }

  ui.scoreValue.textContent = Math.floor(state.score);
  ui.distanceValue.textContent = `${Math.floor(state.distance)} m`;
  ui.multiplierValue.textContent = `x${getMultiplier().toFixed(1)}`;
  ui.coinValue.textContent = state.coins;
  ui.bestValue.textContent = state.bestScore;
  ui.missionTitle.textContent = state.mission.title;
  ui.missionProgress.textContent = `${Math.min(state.mission.target, Math.floor(state.missionProgress))} / ${state.mission.target}`;
  ui.comboNotice.textContent = state.comboTimer > 0 ? state.comboText : `Vitesse ${Math.floor(state.speed)} km/h`;
}

function updatePowerupUi() {
  const chips = [];
  if (state.player.magnet > 0) {
    chips.push({ label: `Aimant ${state.player.magnet.toFixed(1)}s`, color: palette.magnet });
  }
  if (state.player.shield > 0) {
    chips.push({ label: `Bouclier ${state.player.shield.toFixed(1)}s`, color: palette.shield });
  }
  if (state.player.doubleScore > 0) {
    chips.push({ label: `Score x2 ${state.player.doubleScore.toFixed(1)}s`, color: palette.double });
  }

  ui.powerupTray.innerHTML = chips
    .map((chip) => `<div class="powerup-chip" style="box-shadow: 0 0 0 1px ${chip.color}55 inset;">${chip.label}</div>`)
    .join("");
}

function pulseCombo(text, duration) {
  state.comboText = text;
  state.comboTimer = duration;
}

function addParticles(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      z: 1 + Math.random() * 4,
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 1.8 + 0.4,
      life: 0.4 + Math.random() * 0.4,
      size: 2 + Math.random() * 4,
      color,
    });
  }
}

function updateParticles(dt) {
  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z -= state.speed * dt * 0.3;
    particle.vy -= dt * 3;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function render() {
  clearScene();
  drawBackdrop();
  drawRails();
  drawSegments();
  drawPlayer();
  drawParticles();
}

function clearScene() {
  ctx.clearRect(0, 0, viewport.width, viewport.height);
}

function drawBackdrop() {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(0.58, palette.skyBottom);
  gradient.addColorStop(1, "#261234");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const skylineY = viewport.height * 0.38;
  for (let i = 0; i < 14; i += 1) {
    const width = viewport.width * (0.03 + ((i * 13) % 7) * 0.01);
    const height = viewport.height * (0.12 + ((i * 17) % 9) * 0.02);
    const x = (i / 14) * viewport.width;
    ctx.fillStyle = i % 3 === 0 ? palette.cityDark : i % 3 === 1 ? palette.cityMid : palette.cityLight;
    ctx.globalAlpha = 0.22 + (i % 4) * 0.04;
    ctx.fillRect(x, skylineY - height, width, height);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(viewport.width * 0.76, viewport.height * 0.18, viewport.width * 0.085, 0, Math.PI * 2);
  ctx.fill();
}

function drawRails() {
  const horizon = viewport.height * 0.34;
  const bottom = viewport.height;
  const centerX = viewport.width / 2;
  const trackHalfTop = viewport.width * 0.04;
  const trackHalfBottom = viewport.width * 0.34;

  ctx.fillStyle = "#221730";
  ctx.beginPath();
  ctx.moveTo(centerX - trackHalfTop, horizon);
  ctx.lineTo(centerX + trackHalfTop, horizon);
  ctx.lineTo(centerX + trackHalfBottom, bottom);
  ctx.lineTo(centerX - trackHalfBottom, bottom);
  ctx.closePath();
  ctx.fill();

  for (let lane = 0; lane < 4; lane += 1) {
    const t = lane / 3;
    const topX = lerp(centerX - trackHalfTop, centerX + trackHalfTop, t);
    const bottomX = lerp(centerX - trackHalfBottom, centerX + trackHalfBottom, t);
    ctx.strokeStyle = lane === 0 || lane === 3 ? palette.rail : "rgba(210,227,247,0.45)";
    ctx.lineWidth = lane === 0 || lane === 3 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(topX, horizon);
    ctx.lineTo(bottomX, bottom);
    ctx.stroke();
  }

  for (let z = 3; z < visibleDepth; z += 4) {
    const near = projectPoint(0, 0, z);
    const left = projectPoint(-2.25, 0, z);
    const right = projectPoint(2.25, 0, z);
    ctx.strokeStyle = z % 8 === 3 ? "rgba(255,255,255,0.18)" : "rgba(91,75,110,0.65)";
    ctx.lineWidth = Math.max(1, near.scale * 8);
    ctx.beginPath();
    ctx.moveTo(left.x, near.y);
    ctx.lineTo(right.x, near.y);
    ctx.stroke();
  }
}

function drawSegments() {
  const drawables = [];

  for (const segment of state.segments) {
    drawScenery(segment.scenery, segment.z);
    for (const coin of segment.coins) {
      if (!coin.collected && coin.z > 1) {
        drawables.push({ kind: "coin", z: coin.z, entity: coin });
      }
    }
    for (const obstacle of segment.obstacles) {
      if (!obstacle.passed && obstacle.z > -obstacle.length) {
        drawables.push({ kind: "obstacle", z: obstacle.z, entity: obstacle });
      }
    }
    if (segment.powerup && !segment.powerup.collected && segment.powerup.z > 1) {
      drawables.push({ kind: "powerup", z: segment.powerup.z, entity: segment.powerup });
    }
  }

  drawables.sort((a, b) => b.z - a.z);
  for (const drawable of drawables) {
    if (drawable.kind === "coin") {
      drawCoin(drawable.entity);
    } else if (drawable.kind === "obstacle") {
      drawObstacle(drawable.entity);
    } else {
      drawPowerup(drawable.entity);
    }
  }
}

function drawScenery(scenery, segmentZ) {
  const leftNear = projectPoint(-4.2, 0, segmentZ + 2);
  const rightNear = projectPoint(4.2, 0, segmentZ + 2);
  const leftFar = projectPoint(-4.4, 0, segmentZ + segmentLength);
  const towerWidth = Math.max(8, leftNear.scale * 36);

  ctx.globalAlpha = 0.38;
  ctx.fillStyle = scenery.leftColor;
  ctx.fillRect(leftNear.x - towerWidth, leftNear.y - scenery.leftHeight * leftNear.scale * 0.46, towerWidth, scenery.leftHeight * leftNear.scale * 0.46);
  ctx.fillStyle = scenery.rightColor;
  ctx.fillRect(rightNear.x, rightNear.y - scenery.rightHeight * rightNear.scale * 0.46, towerWidth, scenery.rightHeight * rightNear.scale * 0.46);
  ctx.globalAlpha = 1;

  if (scenery.bridge && leftFar.scale > 0) {
    const y = lerp(leftFar.y, leftNear.y, 0.45) - 40 * leftNear.scale;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = Math.max(2, leftNear.scale * 8);
    ctx.beginPath();
    ctx.moveTo(leftNear.x - towerWidth * 0.3, y);
    ctx.lineTo(rightNear.x + towerWidth * 0.3, y);
    ctx.stroke();
  }

  if (scenery.arch) {
    const archCenter = projectPoint(0, 0, segmentZ + 11);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = Math.max(2, archCenter.scale * 10);
    ctx.beginPath();
    ctx.arc(archCenter.x, archCenter.y - archCenter.scale * 50, archCenter.scale * 90, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  if (scenery.cables) {
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i += 1) {
      const start = projectPoint(i * 1.5, 2.1, segmentZ + 2);
      const end = projectPoint(i * 1.5, 2.1, segmentZ + 16);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo((start.x + end.x) * 0.5, start.y + 18, end.x, end.y);
      ctx.stroke();
    }
  }
}

function drawCoin(coin) {
  const p = projectPoint(coin.x, coin.y, coin.z);
  const radius = Math.max(2, p.scale * 18);
  const glow = ctx.createRadialGradient(p.x, p.y, radius * 0.2, p.x, p.y, radius * 1.9);
  glow.addColorStop(0, "rgba(255,246,184,0.95)");
  glow.addColorStop(0.45, "rgba(255,210,58,0.82)");
  glow.addColorStop(1, "rgba(255,210,58,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.gold;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, radius * 0.88, radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(1, radius * 0.15);
  ctx.stroke();
}

function drawPowerup(powerup) {
  const p = projectPoint(powerup.x, powerup.y, powerup.z);
  const colors = { magnet: palette.magnet, shield: palette.shield, double: palette.double };
  const color = colors[powerup.type];
  const size = Math.max(5, p.scale * 24);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(state.time * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    const px = Math.cos(angle) * size;
    const py = Math.sin(angle) * size;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawObstacle(obstacle) {
  const p = projectPoint(obstacle.x, 0, obstacle.z);
  const width = Math.max(8, p.scale * obstacle.width * 58);
  const height = Math.max(12, p.scale * obstacle.height * 58);
  const length = Math.max(10, p.scale * obstacle.length * 60);
  const baseY = p.y;
  const telegraphAlpha = Math.max(0, Math.min(0.9, 1.2 - obstacle.z / 18));

  if (obstacle.z > 0) {
    ctx.globalAlpha = 0.16 * telegraphAlpha;
    ctx.fillStyle = obstacle.kind === "train" ? palette.signalRed : "#ffffff";
    roundRect(p.x - width * 0.78, baseY - 6, width * 1.56, 10, 8);
    ctx.fill();

    ctx.globalAlpha = 0.28 * telegraphAlpha;
    ctx.strokeStyle = palette.signalRed;
    ctx.lineWidth = Math.max(2, p.scale * 5);
    ctx.beginPath();
    ctx.moveTo(p.x - width * 0.7, baseY - height - 14);
    ctx.lineTo(p.x + width * 0.7, baseY - height - 14);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (obstacle.kind === "train") {
    ctx.fillStyle = obstacle.color;
    roundRect(p.x - width * 0.88, baseY - height, width * 1.76, height, 12);
    ctx.fill();
    ctx.fillStyle = palette.trainStripe;
    roundRect(p.x - width * 0.88, baseY - height * 0.72, width * 1.76, height * 0.18, 8);
    ctx.fill();
    ctx.fillStyle = "#88b7ff";
    roundRect(p.x - width * 0.7, baseY - height * 0.85, width * 1.4, height * 0.28, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(p.x - width * 0.88, baseY, width * 1.76, length * 0.24);
    ctx.strokeStyle = palette.signalRed;
    ctx.lineWidth = Math.max(2, p.scale * 7);
    ctx.beginPath();
    ctx.moveTo(p.x - width * 0.7, baseY - height * 0.45);
    ctx.lineTo(p.x + width * 0.7, baseY - height * 0.45);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = obstacle.color;
  if (obstacle.kind === "signal") {
    ctx.fillRect(p.x - width * 0.25, baseY - height, width * 0.5, height);
    ctx.fillStyle = palette.signalWhite;
    ctx.beginPath();
    ctx.arc(p.x, baseY - height + width * 0.7, width * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.signalRed;
    ctx.beginPath();
    ctx.arc(p.x, baseY - height + width * 0.7, width * 0.22, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  roundRect(p.x - width / 2, baseY - height, width, height, 10);
  ctx.fill();
  ctx.strokeStyle = obstacle.kind === "barrierHigh" ? palette.signalRed : "rgba(0,0,0,0.22)";
  ctx.lineWidth = Math.max(2, p.scale * 4);
  ctx.stroke();
  if (obstacle.kind === "barrierLow") {
    ctx.fillStyle = palette.lowObstacle;
    ctx.fillRect(p.x - width / 2, baseY - height * 0.68, width, height * 0.16);
    ctx.fillStyle = palette.signalRed;
    ctx.fillRect(p.x - width / 2, baseY - height * 0.38, width, height * 0.12);
  }
  if (obstacle.kind === "barrierHigh") {
    ctx.fillStyle = palette.signalRed;
    ctx.fillRect(p.x - width / 2, baseY - height * 0.78, width, height * 0.12);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillRect(p.x - width / 2, baseY - height * 0.52, width, height * 0.08);
  }
  if (obstacle.kind === "crate") {
    ctx.fillStyle = "rgba(255,255,255,0.36)";
    ctx.fillRect(p.x - width * 0.32, baseY - height * 0.78, width * 0.64, height * 0.1);
  }
}

function drawPlayer() {
  const bounce = Math.sin(state.player.animationTime * 8) * 4 * (state.player.y <= 0.01 ? 1 : 0.35);
  const laneShift = state.player.laneOffset * viewport.width * 0.08;
  const baseX = viewport.width / 2 + laneShift;
  const baseY = viewport.height * 0.82 - state.player.y * 92 - state.player.justLanded * 8 + bounce;
  const slide = state.player.slideTimer > 0.12 ? 1 : 0;
  const bodyTilt = (state.player.targetLane - 1 - state.player.laneOffset / laneSpacing) * 0.15;

  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(bodyTilt);

  if (state.player.shield > 0) {
    ctx.strokeStyle = "rgba(103,183,255,0.8)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, -48, 34 + Math.sin(state.time * 8) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.player.magnet > 0) {
    ctx.strokeStyle = "rgba(126,251,195,0.35)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -44, 46 + Math.sin(state.time * 10) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = palette.playerPants;
  roundRect(-16, -16 - slide * 10, 32, 38 - slide * 14, 12);
  ctx.fill();

  ctx.fillStyle = palette.playerHood;
  roundRect(-20, -58 - slide * 8, 40, 44 - slide * 16, 14);
  ctx.fill();

  ctx.fillStyle = "#ffe0c7";
  ctx.beginPath();
  ctx.arc(0, -68 - slide * 4, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-15, 8 - slide * 12, 12, 7);
  ctx.fillRect(3, 8 - slide * 12, 12, 7);

  ctx.fillStyle = palette.playerShoes;
  ctx.fillRect(-14, 15 - slide * 12, 12, 5);
  ctx.fillRect(2, 15 - slide * 12, 12, 5);

  ctx.fillStyle = "#ffd552";
  roundRect(10, -46 - slide * 8, 10, 18, 5);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    const p = projectPoint(particle.x, particle.y, Math.max(2, particle.z));
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, particle.size * p.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function projectPoint(x, y, z) {
  const safeZ = Math.max(1, z);
  const horizon = viewport.height * 0.34;
  const perspective = 1 / (safeZ * 0.028);
  return {
    x: viewport.width / 2 + x * viewport.width * 0.09 * perspective,
    y: horizon + (1 - y * 0.12) * viewport.height * 0.42 * perspective,
    scale: perspective,
  };
}

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(ratio, ratio);
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function toggleOverlay(element, visible) {
  element.classList.toggle("visible", visible);
}

function loadMeta() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      state.bestScore = saved.bestScore || 0;
    }
  } catch (error) {
    state.bestScore = 0;
  }
}

function saveMeta() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    bestScore: state.bestScore,
  }));
}

function unlockAudio() {
  if (audio.unlocked) {
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }
  audio.ctx = new AudioContextClass();
  audio.unlocked = true;
}

function playSound(frequency, duration, type) {
  if (!audio.unlocked || !audio.ctx) {
    return;
  }
  const now = audio.ctx.currentTime;
  const oscillator = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
