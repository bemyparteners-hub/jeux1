const WORLD_STORAGE_KEY = "minicraft-simple-world-v1";

const BLOCK_TYPES = {
  grass: { name: "Herbe", color: 0x67b548, count: 18 },
  dirt: { name: "Terre", color: 0x8b5a2b, count: 28 },
  stone: { name: "Pierre", color: 0x7d7d7d, count: 22 },
  wood: { name: "Bois", color: 0x9b6a3c, count: 12 },
};

const HOTBAR_ORDER = ["grass", "dirt", "stone", "wood"];
const WORLD_WIDTH = 22;
const WORLD_DEPTH = 22;
const MAX_HEIGHT = 9;
const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.33;
const GRAVITY = 24;
const JUMP_VELOCITY = 8.5;
const WALK_SPEED = 5.4;

const canvas = document.querySelector("#game");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start-button");
const hotbarElement = document.querySelector("#hotbar");
const statusText = document.querySelector("#status-text");
const positionText = document.querySelector("#position-text");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8ff);
scene.fog = new THREE.Fog(0x87c8ff, 18, 44);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = "YXZ";

scene.add(new THREE.HemisphereLight(0xdff5ff, 0x4f3c23, 1.2));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
sunLight.position.set(12, 20, 8);
scene.add(sunLight);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const worldMap = new Map();
const blockMeshes = new Map();
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const raycaster = new THREE.Raycaster();

const materials = Object.fromEntries(
  Object.entries(BLOCK_TYPES).map(([type, data]) => [type, new THREE.MeshLambertMaterial({ color: data.color })])
);

const movement = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  wantsJump: false,
};

const player = {
  position: new THREE.Vector3(WORLD_WIDTH / 2, 10, WORLD_DEPTH / 2),
  velocity: new THREE.Vector3(),
  grounded: false,
  selectedBlock: "grass",
  inventory: HOTBAR_ORDER.reduce((result, key) => {
    result[key] = BLOCK_TYPES[key].count;
    return result;
  }, {}),
};

let pointerLocked = false;
let lastTimestamp = 0;

setupWorld();
renderHotbar();
bindEvents();
animate(0);

function setupWorld() {
  const saved = loadSavedWorld();

  if (saved) {
    restoreWorld(saved);
    player.inventory = { ...player.inventory, ...(saved.inventory || {}) };
    player.selectedBlock = saved.selectedBlock || player.selectedBlock;
  } else {
    generateWorld();
  }

  player.position.copy(findSpawnPoint());
  camera.position.copy(player.position);
  updateStatus("Monde genere et pret.");
}

function bindEvents() {
  window.addEventListener("resize", onResize);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  document.addEventListener("mousedown", handleMouseButtons);
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  startButton.addEventListener("click", () => canvas.requestPointerLock());
  canvas.addEventListener("click", () => {
    if (!pointerLocked) {
      canvas.requestPointerLock();
    }
  });
}

function generateWorld() {
  for (let x = 0; x < WORLD_WIDTH; x += 1) {
    for (let z = 0; z < WORLD_DEPTH; z += 1) {
      const height = getTerrainHeight(x, z);
      for (let y = 0; y <= height; y += 1) {
        let type = "stone";
        if (y === height) {
          type = "grass";
        } else if (y >= height - 2) {
          type = "dirt";
        }
        addBlock(x, y, z, type);
      }

      if (shouldSpawnTree(x, z, height)) {
        for (let trunkY = height + 1; trunkY <= height + 3; trunkY += 1) {
          addBlock(x, trunkY, z, "wood");
        }
      }
    }
  }
}

function restoreWorld(saved) {
  saved.blocks.forEach((block) => addBlock(block.x, block.y, block.z, block.type));
}

function findSpawnPoint() {
  const centerX = Math.floor(WORLD_WIDTH / 2);
  const centerZ = Math.floor(WORLD_DEPTH / 2);
  const surface = findTopSolid(centerX, centerZ);
  return new THREE.Vector3(centerX + 0.5, surface + PLAYER_HEIGHT + 0.2, centerZ + 0.5);
}

function animate(timestamp) {
  const delta = Math.min((timestamp - lastTimestamp) / 1000 || 0.016, 0.033);
  lastTimestamp = timestamp;
  updatePlayer(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updatePlayer(delta) {
  const horizontalVelocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  if (movement.forward) {
    horizontalVelocity.add(forward);
  }
  if (movement.backward) {
    horizontalVelocity.sub(forward);
  }
  if (movement.right) {
    horizontalVelocity.add(right);
  }
  if (movement.left) {
    horizontalVelocity.sub(right);
  }

  if (horizontalVelocity.lengthSq() > 0) {
    horizontalVelocity.normalize().multiplyScalar(WALK_SPEED * delta);
  }

  moveWithCollisions(horizontalVelocity.x, 0, 0);
  moveWithCollisions(0, 0, horizontalVelocity.z);

  player.velocity.y -= GRAVITY * delta;
  if (movement.wantsJump && player.grounded) {
    player.velocity.y = JUMP_VELOCITY;
    player.grounded = false;
  }
  movement.wantsJump = false;

  moveWithCollisions(0, player.velocity.y * delta, 0);
  camera.position.copy(player.position);
  positionText.textContent = `X: ${player.position.x.toFixed(1)} Y: ${player.position.y.toFixed(1)} Z: ${player.position.z.toFixed(1)}`;
}

function moveWithCollisions(deltaX, deltaY, deltaZ) {
  player.position.x += deltaX;
  if (intersectsWorld(player.position)) {
    player.position.x -= deltaX;
  }

  player.position.z += deltaZ;
  if (intersectsWorld(player.position)) {
    player.position.z -= deltaZ;
  }

  player.position.y += deltaY;
  if (intersectsWorld(player.position)) {
    if (deltaY < 0) {
      player.grounded = true;
    }
    player.position.y -= deltaY;
    player.velocity.y = 0;
  } else {
    player.grounded = false;
  }
}

function intersectsWorld(position) {
  const minX = Math.floor(position.x - PLAYER_RADIUS);
  const maxX = Math.floor(position.x + PLAYER_RADIUS);
  const minY = Math.floor(position.y - PLAYER_HEIGHT);
  const maxY = Math.floor(position.y - 0.05);
  const minZ = Math.floor(position.z - PLAYER_RADIUS);
  const maxZ = Math.floor(position.z + PLAYER_RADIUS);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (getBlock(x, y, z)) {
          return true;
        }
      }
    }
  }

  return false;
}

function handlePointerLockChange() {
  pointerLocked = document.pointerLockElement === canvas;
  overlay.classList.toggle("hidden", pointerLocked);
  updateStatus(pointerLocked ? "Exploration active." : "Pause. Cliquez pour reprendre.");
}

function handleMouseMove(event) {
  if (!pointerLocked) {
    return;
  }

  const sensitivity = 0.0023;
  camera.rotation.y -= event.movementX * sensitivity;
  camera.rotation.x -= event.movementY * sensitivity;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();

  if (key === "z" || key === "w") {
    movement.forward = true;
  }
  if (key === "s") {
    movement.backward = true;
  }
  if (key === "q" || key === "a") {
    movement.left = true;
  }
  if (key === "d") {
    movement.right = true;
  }
  if (event.code === "Space") {
    movement.wantsJump = true;
  }

  if (["1", "2", "3", "4"].includes(key)) {
    player.selectedBlock = HOTBAR_ORDER[Number(key) - 1];
    renderHotbar();
  }
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();

  if (key === "z" || key === "w") {
    movement.forward = false;
  }
  if (key === "s") {
    movement.backward = false;
  }
  if (key === "q" || key === "a") {
    movement.left = false;
  }
  if (key === "d") {
    movement.right = false;
  }
}

function handleMouseButtons(event) {
  if (!pointerLocked) {
    return;
  }

  const hit = getTargetedBlock();
  if (!hit) {
    return;
  }

  if (event.button === 0) {
    mineBlock(hit.block);
  }

  if (event.button === 2) {
    placeBlock(hit);
  }
}

function getTargetedBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersections = raycaster.intersectObjects([...blockMeshes.values()], false);
  if (intersections.length === 0) {
    return null;
  }

  const hit = intersections[0];
  return {
    block: hit.object.userData.block,
    normal: hit.face.normal.clone(),
  };
}

function mineBlock(block) {
  if (!block || block.y <= 0) {
    updateStatus("Le socle du monde ne peut pas etre casse.");
    return;
  }

  removeBlock(block.x, block.y, block.z);
  player.inventory[block.type] = (player.inventory[block.type] || 0) + 1;
  renderHotbar();
  saveWorld();
  updateStatus(`Bloc retire: ${BLOCK_TYPES[block.type].name}.`);
}

function placeBlock(hit) {
  const type = player.selectedBlock;
  if (!type || (player.inventory[type] || 0) <= 0) {
    updateStatus("Plus de blocs disponibles dans cet emplacement.");
    return;
  }

  const targetX = hit.block.x + Math.round(hit.normal.x);
  const targetY = hit.block.y + Math.round(hit.normal.y);
  const targetZ = hit.block.z + Math.round(hit.normal.z);

  if (targetY < 0 || targetY > MAX_HEIGHT + 6 || getBlock(targetX, targetY, targetZ)) {
    return;
  }

  addBlock(targetX, targetY, targetZ, type);
  if (intersectsWorld(player.position)) {
    removeBlock(targetX, targetY, targetZ);
    updateStatus("Impossible de poser un bloc sur le joueur.");
    return;
  }

  player.inventory[type] -= 1;
  renderHotbar();
  saveWorld();
  updateStatus(`Bloc pose: ${BLOCK_TYPES[type].name}.`);
}

function addBlock(x, y, z, type) {
  const key = blockKey(x, y, z);
  if (worldMap.has(key)) {
    return;
  }

  const mesh = new THREE.Mesh(blockGeometry, materials[type]);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData.block = { x, y, z, type };
  worldGroup.add(mesh);
  worldMap.set(key, { x, y, z, type });
  blockMeshes.set(key, mesh);
}

function removeBlock(x, y, z) {
  const key = blockKey(x, y, z);
  const mesh = blockMeshes.get(key);
  if (mesh) {
    worldGroup.remove(mesh);
  }
  worldMap.delete(key);
  blockMeshes.delete(key);
}

function getBlock(x, y, z) {
  return worldMap.get(blockKey(x, y, z));
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function findTopSolid(x, z) {
  for (let y = MAX_HEIGHT + 6; y >= 0; y -= 1) {
    if (getBlock(x, y, z)) {
      return y + 1;
    }
  }
  return 1;
}

function getTerrainHeight(x, z) {
  const hills = Math.sin(x * 0.42) * 1.6 + Math.cos(z * 0.33) * 1.8;
  const ripples = Math.sin((x + z) * 0.25) * 0.9;
  const noise = pseudoRandom(x * 13.5, z * 7.1) * 1.2;
  return THREE.MathUtils.clamp(Math.floor(3 + hills + ripples + noise), 2, MAX_HEIGHT);
}

function shouldSpawnTree(x, z, height) {
  if (height < 4) {
    return false;
  }
  const edgeMargin = x > 1 && z > 1 && x < WORLD_WIDTH - 2 && z < WORLD_DEPTH - 2;
  return edgeMargin && pseudoRandom(x * 2.1, z * 5.7) > 0.82;
}

function pseudoRandom(x, z) {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function renderHotbar() {
  hotbarElement.innerHTML = "";
  HOTBAR_ORDER.forEach((type, index) => {
    const slot = document.createElement("div");
    slot.className = `hotbar-slot ${player.selectedBlock === type ? "selected" : ""}`.trim();
    slot.innerHTML = `
      <span class="hotbar-index">${index + 1}</span>
      <span class="hotbar-name">${BLOCK_TYPES[type].name}</span>
      <span class="hotbar-count">${player.inventory[type] || 0}</span>
    `;
    hotbarElement.appendChild(slot);
  });
}

function updateStatus(message) {
  statusText.textContent = message;
}

function saveWorld() {
  const payload = {
    blocks: [...worldMap.values()],
    inventory: player.inventory,
    selectedBlock: player.selectedBlock,
  };
  localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(payload));
}

function loadSavedWorld() {
  const raw = localStorage.getItem(WORLD_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
