const STORAGE_KEY = "village-ascendant-save";

const buildingDefinitions = [
  {
    id: "house",
    name: "Maison",
    description: "Accueille de nouveaux habitants et soutient la croissance du village.",
    cost: { wood: 18, stone: 8, food: 6, gold: 0 },
    produces: {},
    consumes: {},
    housing: 4,
  },
  {
    id: "farm",
    name: "Ferme",
    description: "Produit de la nourriture pour nourrir la population.",
    cost: { wood: 14, stone: 4, food: 0, gold: 4 },
    produces: { food: 12 },
    consumes: {},
    housing: 0,
  },
  {
    id: "lumberMill",
    name: "Scierie",
    description: "Transforme le travail local en production de bois.",
    cost: { wood: 10, stone: 10, food: 0, gold: 6 },
    produces: { wood: 9 },
    consumes: { food: 1 },
    housing: 0,
  },
  {
    id: "quarry",
    name: "Carriere",
    description: "Extrait de la pierre pour les batiments avances.",
    cost: { wood: 12, stone: 6, food: 0, gold: 8 },
    produces: { stone: 7 },
    consumes: { food: 1 },
    housing: 0,
  },
  {
    id: "mine",
    name: "Mine",
    description: "Produit de l'or mais demande des reserves solides.",
    cost: { wood: 16, stone: 18, food: 0, gold: 10 },
    produces: { gold: 6 },
    consumes: { food: 2 },
    housing: 0,
  },
  {
    id: "market",
    name: "Marche",
    description: "Stimule les echanges et attire plus de population.",
    cost: { wood: 20, stone: 14, food: 10, gold: 12 },
    produces: { gold: 4 },
    consumes: { food: 2 },
    housing: 2,
  },
];

const resourceMetadata = {
  wood: { label: "Bois", icon: "Bois" },
  stone: { label: "Pierre", icon: "Pierre" },
  food: { label: "Nourriture", icon: "Nourriture" },
  gold: { label: "Or", icon: "Or" },
};

const ageThresholds = [
  { level: 1, label: "Age des pionniers", population: 0, buildings: 0 },
  { level: 2, label: "Village installe", population: 14, buildings: 6 },
  { level: 3, label: "Bourg en essor", population: 30, buildings: 12 },
  { level: 4, label: "Ville naissante", population: 55, buildings: 20 },
];

const initialState = {
  day: 1,
  population: 6,
  resources: {
    wood: 70,
    stone: 40,
    food: 55,
    gold: 25,
  },
  buildings: {
    house: 2,
    farm: 1,
    lumberMill: 0,
    quarry: 0,
    mine: 0,
    market: 0,
  },
  history: [],
  lastProduction: {},
};

let state = loadState();

const elements = {
  dayValue: document.querySelector("#day-value"),
  populationValue: document.querySelector("#population-value"),
  housingValue: document.querySelector("#housing-value"),
  levelValue: document.querySelector("#level-value"),
  ageBadge: document.querySelector("#age-badge"),
  resourceGrid: document.querySelector("#resource-grid"),
  buildingsList: document.querySelector("#buildings-list"),
  productionSummary: document.querySelector("#production-summary"),
  eventLog: document.querySelector("#event-log"),
  nextDayBtn: document.querySelector("#next-day-btn"),
  saveBtn: document.querySelector("#save-btn"),
  resetBtn: document.querySelector("#reset-btn"),
  buildingTemplate: document.querySelector("#building-card-template"),
};

elements.nextDayBtn.addEventListener("click", advanceDay);
elements.saveBtn.addEventListener("click", () => {
  saveState();
  addHistoryEntry("Sauvegarde", "La partie a ete enregistree en local.", "good");
  render();
});
elements.resetBtn.addEventListener("click", resetGame);

render();

function render() {
  const totalHousing = getHousingCapacity();
  const age = getCurrentAge();

  elements.dayValue.textContent = state.day;
  elements.populationValue.textContent = state.population;
  elements.housingValue.textContent = `${state.population} / ${totalHousing}`;
  elements.levelValue.textContent = age.level;
  elements.ageBadge.textContent = age.label;

  renderResources();
  renderBuildings();
  renderProductionSummary();
  renderHistory();
}

function renderResources() {
  elements.resourceGrid.innerHTML = "";

  Object.entries(resourceMetadata).forEach(([key, metadata]) => {
    const card = document.createElement("article");
    card.className = "resource-card";
    card.innerHTML = `
      <span class="resource-label">${metadata.label}</span>
      <strong class="resource-value">${Math.floor(state.resources[key])}</strong>
    `;
    elements.resourceGrid.appendChild(card);
  });
}

function renderBuildings() {
  elements.buildingsList.innerHTML = "";

  buildingDefinitions.forEach((building) => {
    const fragment = elements.buildingTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".building-card");
    const name = fragment.querySelector(".building-name");
    const description = fragment.querySelector(".building-description");
    const count = fragment.querySelector(".building-count");
    const effects = fragment.querySelector(".building-effects");
    const cost = fragment.querySelector(".building-cost");
    const button = fragment.querySelector(".build-button");

    name.textContent = building.name;
    description.textContent = building.description;
    count.textContent = `x${state.buildings[building.id]}`;
    effects.innerHTML = `
      <strong>Effets :</strong> ${formatEffects(building)}
    `;
    cost.innerHTML = `
      <strong>Cout :</strong> ${formatResources(building.cost)}
    `;
    button.disabled = !canAfford(building.cost);
    button.textContent = button.disabled ? "Ressources insuffisantes" : `Construire ${building.name}`;
    button.addEventListener("click", () => constructBuilding(building.id));

    if (!canAfford(building.cost)) {
      card.classList.add("disabled");
    }

    elements.buildingsList.appendChild(fragment);
  });
}

function renderProductionSummary() {
  elements.productionSummary.innerHTML = "";
  const summary = state.lastProduction;

  if (!summary || Object.keys(summary).length === 0) {
    elements.productionSummary.innerHTML = `
      <article class="summary-item">Passez au jour suivant pour voir les gains et pertes de la journee.</article>
    `;
    return;
  }

  Object.entries(resourceMetadata).forEach(([key, metadata]) => {
    const item = document.createElement("article");
    item.className = "summary-item";
    const amount = Math.round(summary[key] || 0);
    const prefix = amount >= 0 ? "+" : "";
    item.textContent = `${metadata.label}: ${prefix}${amount}`;
    elements.productionSummary.appendChild(item);
  });
}

function renderHistory() {
  elements.eventLog.innerHTML = "";

  const entries = state.history.length > 0 ? state.history : [{
    title: "Bienvenue",
    description: "Votre village attend vos premieres decisions.",
    type: "good",
    day: state.day,
  }];

  entries
    .slice()
    .reverse()
    .forEach((entry) => {
      const article = document.createElement("article");
      article.className = `event-entry ${entry.type || ""}`.trim();
      article.innerHTML = `
        <strong>Jour ${entry.day}</strong>${entry.title}<br>
        <span>${entry.description}</span>
      `;
      elements.eventLog.appendChild(article);
    });
}

function constructBuilding(buildingId) {
  const building = buildingDefinitions.find((item) => item.id === buildingId);
  if (!building || !canAfford(building.cost)) {
    return;
  }

  spendResources(building.cost);
  state.buildings[buildingId] += 1;
  addHistoryEntry(
    "Construction",
    `${building.name} ajoute. Le village se developpe progressivement.`,
    "good"
  );
  saveState();
  render();
}

function advanceDay() {
  state.day += 1;

  const resourceDelta = {
    wood: 0,
    stone: 0,
    food: 0,
    gold: 0,
  };

  buildingDefinitions.forEach((building) => {
    const count = state.buildings[building.id];
    applyResourceMap(resourceDelta, building.produces, count);
    applyResourceMap(resourceDelta, building.consumes, -count);
  });

  const populationFoodCost = Math.ceil(state.population * 1.1);
  resourceDelta.food -= populationFoodCost;

  const housingCapacity = getHousingCapacity();
  const availableHousing = Math.max(0, housingCapacity - state.population);
  const foodBuffer = state.resources.food + resourceDelta.food;

  if (foodBuffer > state.population * 2 && availableHousing > 0) {
    const growth = Math.min(availableHousing, Math.max(1, Math.floor(state.population * 0.12)));
    state.population += growth;
    addHistoryEntry("Nouvelle famille", `${growth} habitants rejoignent le village.`, "good");
  } else if (foodBuffer < 0) {
    const loss = Math.min(state.population - 1, Math.max(1, Math.ceil(Math.abs(foodBuffer) / 6)));
    state.population -= loss;
    addHistoryEntry("Disette", `${loss} habitants quittent le village faute de nourriture.`, "warning");
  }

  Object.keys(state.resources).forEach((key) => {
    state.resources[key] = Math.max(0, state.resources[key] + resourceDelta[key]);
  });

  handleRandomEvent();
  state.lastProduction = resourceDelta;
  saveState();
  render();
}

function handleRandomEvent() {
  const roll = Math.random();

  if (roll < 0.18) {
    const eventPool = [
      {
        title: "Tempete",
        description: "Des toits s'abiment et quelques reserves de bois sont perdues.",
        apply: () => { state.resources.wood = Math.max(0, state.resources.wood - 12); },
        type: "warning",
      },
      {
        title: "Bonne recolte",
        description: "Les champs ont ete genereux. Les reserves de nourriture augmentent.",
        apply: () => { state.resources.food += 18; },
        type: "good",
      },
      {
        title: "Marchands de passage",
        description: "Des marchands laissent quelques pieces d'or en ville.",
        apply: () => { state.resources.gold += 10; },
        type: "good",
      },
      {
        title: "Veine de pierre",
        description: "Une nouvelle poche de pierre est decouverte pres de la carriere.",
        apply: () => { state.resources.stone += 14; },
        type: "good",
      },
    ];

    const selectedEvent = eventPool[Math.floor(Math.random() * eventPool.length)];
    selectedEvent.apply();
    addHistoryEntry(selectedEvent.title, selectedEvent.description, selectedEvent.type);
    return;
  }

  addHistoryEntry("Jour paisible", "La journee se termine sans incident majeur.", "good");
}

function resetGame() {
  if (!window.confirm("Reinitialiser la partie ?")) {
    return;
  }

  state = structuredClone(initialState);
  saveState();
  render();
}

function canAfford(cost) {
  return Object.entries(cost).every(([resource, amount]) => state.resources[resource] >= amount);
}

function spendResources(cost) {
  Object.entries(cost).forEach(([resource, amount]) => {
    state.resources[resource] -= amount;
  });
}

function applyResourceMap(target, values, multiplier = 1) {
  Object.entries(values).forEach(([resource, amount]) => {
    target[resource] += amount * multiplier;
  });
}

function getHousingCapacity() {
  return buildingDefinitions.reduce((total, building) => {
    return total + (building.housing || 0) * state.buildings[building.id];
  }, 0);
}

function getCurrentAge() {
  const totalBuildings = Object.values(state.buildings).reduce((sum, count) => sum + count, 0);
  return ageThresholds.reduce((current, age) => {
    if (state.population >= age.population && totalBuildings >= age.buildings) {
      return age;
    }
    return current;
  }, ageThresholds[0]);
}

function formatEffects(building) {
  const parts = [];

  if (Object.keys(building.produces).length > 0) {
    parts.push(`Produit ${formatResources(building.produces)}`);
  }

  if (Object.keys(building.consumes).length > 0) {
    parts.push(`Consomme ${formatResources(building.consumes)}`);
  }

  if (building.housing > 0) {
    parts.push(`Logement +${building.housing}`);
  }

  return parts.join(" | ");
}

function formatResources(resourceMap) {
  return Object.entries(resourceMap)
    .map(([resource, amount]) => `${resourceMetadata[resource].label} ${amount}`)
    .join(", ");
}

function addHistoryEntry(title, description, type = "") {
  state.history.push({
    day: state.day,
    title,
    description,
    type,
  });

  if (state.history.length > 12) {
    state.history = state.history.slice(-12);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const rawSave = localStorage.getItem(STORAGE_KEY);

  if (!rawSave) {
    return structuredClone(initialState);
  }

  try {
    const parsed = JSON.parse(rawSave);
    return {
      ...structuredClone(initialState),
      ...parsed,
      resources: {
        ...structuredClone(initialState.resources),
        ...(parsed.resources || {}),
      },
      buildings: {
        ...structuredClone(initialState.buildings),
        ...(parsed.buildings || {}),
      },
      history: Array.isArray(parsed.history) ? parsed.history : [],
      lastProduction: parsed.lastProduction || {},
    };
  } catch (error) {
    return structuredClone(initialState);
  }
}
