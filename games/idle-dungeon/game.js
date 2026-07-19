const SAVE_KEY = "idle-dungeon-save-v1";
const TICK_MS = 500;

const ENEMY_NAMES = [
  "Rat Swarm", "Cave Slime", "Skeleton", "Goblin", "Bandit",
  "Giant Spider", "Wraith", "Ogre", "Dark Cultist", "Stone Golem",
  "Wyvern", "Lich", "Shadow Knight", "Chimera", "Demon Lord",
];

const UPGRADE_DEFS = {
  hp:   { base: 10, growth: 1.15, hpBonus: 10 },
  atk:  { base: 10, growth: 1.15, atkBonus: 1.5 },
  def:  { base: 10, growth: 1.15, defBonus: 1 },
  luck: { base: 15, growth: 1.18, luckBonus: 0.02 },
};

function defaultMeta() {
  return {
    essence: 0,
    bestFloor: 0,
    upg: { hp: 0, atk: 0, def: 0, luck: 0 },
  };
}

let meta = defaultMeta();
let run = null;       // active run state, null when no run in progress
let running = false;  // ticking?
let speed = 1;
let timer = null;

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      meta = Object.assign(defaultMeta(), parsed.meta || {});
      meta.upg = Object.assign({ hp: 0, atk: 0, def: 0, luck: 0 }, meta.upg);
    }
  } catch (e) {
    meta = defaultMeta();
  }
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ meta }));
}

function upgradeCost(type) {
  const def = UPGRADE_DEFS[type];
  return Math.floor(def.base * Math.pow(def.growth, meta.upg[type]));
}

function baseHeroStats() {
  return {
    maxHp: 30 + meta.upg.hp * UPGRADE_DEFS.hp.hpBonus,
    atk: 5 + meta.upg.atk * UPGRADE_DEFS.atk.atkBonus,
    def: 2 + meta.upg.def * UPGRADE_DEFS.def.defBonus,
  };
}

function luckBonus() {
  return meta.upg.luck * UPGRADE_DEFS.luck.luckBonus;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- Run lifecycle ----------

function startRun() {
  const base = baseHeroStats();
  run = {
    floor: 0,
    hero: {
      level: 1,
      xp: 0,
      xpNext: 20,
      maxHp: base.maxHp,
      hp: base.maxHp,
      atk: base.atk,
      def: base.def,
      gold: 0,
    },
    enemy: null,
    floorType: null,
    floorCleared: true, // triggers nextFloor() on first tick
    ended: false,
  };
  clearLog();
  log(`A new hero descends into the dungeon.`, "floor");
  render();
  setRunning(true);
}

function endRun() {
  run.ended = true;
  const earned = Math.max(1, Math.floor(run.floor * 2 + run.hero.level * 3));
  meta.essence += earned;
  if (run.floor > meta.bestFloor) meta.bestFloor = run.floor;
  log(`You perished on floor ${run.floor}. Earned ${earned}✨ essence.`, "death");
  save();
  setRunning(false);
  render();
}

function setRunning(on) {
  running = on;
  document.getElementById("btnStart").disabled = on;
  document.getElementById("btnPause").disabled = !on;
  document.getElementById("btnPause").textContent = "Pause";
  if (timer) { clearInterval(timer); timer = null; }
  if (on) timer = setInterval(gameLoop, TICK_MS);
}

function togglePause() {
  if (!run || run.ended) return;
  if (timer) {
    clearInterval(timer);
    timer = null;
    document.getElementById("btnPause").textContent = "Resume";
  } else {
    timer = setInterval(gameLoop, TICK_MS);
    document.getElementById("btnPause").textContent = "Pause";
  }
}

function gameLoop() {
  for (let i = 0; i < speed; i++) {
    tick();
    if (!run || run.ended) break;
  }
  render();
  save();
}

function tick() {
  if (!run || run.ended) return;
  if (run.enemy) {
    combatRound();
  } else if (run.floorCleared) {
    nextFloor();
  }
}

// ---------- Floor generation ----------

function nextFloor() {
  run.floor++;
  run.floorCleared = false;
  const r = Math.random();
  let type;
  if (run.floor > 1 && r < 0.15) type = "elite";
  else if (r < 0.30) type = "treasure";
  else if (r < 0.40) type = "shrine";
  else type = "normal";

  run.floorType = type;

  if (type === "normal" || type === "elite") {
    run.enemy = makeEnemy(run.floor, type === "elite");
    log(`Floor ${run.floor}: a ${run.enemy.name} appears!`, "floor");
  } else if (type === "treasure") {
    const reward = Math.round(run.floor * 3 + rand(0, 5));
    run.hero.gold += reward;
    log(`Floor ${run.floor}: found a treasure room — +${reward}💰 gold.`, "gold");
    run.floorCleared = true;
  } else if (type === "shrine") {
    run.hero.hp = run.hero.maxHp;
    log(`Floor ${run.floor}: a shrine restores you to full health.`, "loot");
    run.floorCleared = true;
  }
}

function makeEnemy(floor, elite) {
  const mult = elite ? 1.8 : 1;
  const hp = Math.round((10 + floor * 4) * mult);
  const atk = Math.round((2 + floor * 1.1) * (elite ? 1.5 : 1) * 10) / 10;
  const def = Math.round(floor * 0.4 * (elite ? 1.3 : 1) * 10) / 10;
  const name = (elite ? "Elite " : "") + pick(ENEMY_NAMES);
  return { name, hp, maxHp: hp, atk, def, elite };
}

// ---------- Combat ----------

function combatRound() {
  const h = run.hero;
  const e = run.enemy;

  let heroDmg = Math.max(1, Math.round(h.atk - e.def * 0.4 + rand(-1, 2)));
  const critChance = 0.05 + luckBonus();
  const isCrit = Math.random() < critChance;
  if (isCrit) heroDmg = Math.round(heroDmg * 1.8);
  e.hp -= heroDmg;
  log(`You hit ${e.name} for ${heroDmg}${isCrit ? " — CRIT!" : ""}.`, isCrit ? "crit" : "hit");

  if (e.hp <= 0) {
    defeatEnemy();
    return;
  }

  const enemyDmg = Math.max(1, Math.round(e.atk - h.def * 0.4 + rand(-1, 2)));
  h.hp -= enemyDmg;
  log(`${e.name} hits you for ${enemyDmg}.`, "hit");

  if (h.hp <= 0) {
    h.hp = 0;
    endRun();
  }
}

function defeatEnemy() {
  const e = run.enemy;
  const h = run.hero;
  const goldReward = Math.round((e.elite ? 8 : 3) + run.floor * (e.elite ? 1.5 : 0.7));
  const xpReward = Math.round((e.elite ? 12 : 6) + run.floor * (e.elite ? 2 : 1));
  h.gold += goldReward;
  log(`You defeated ${e.name}! +${goldReward}💰 +${xpReward}xp`, "loot");
  gainXp(xpReward);

  const lootChance = (e.elite ? 0.55 : 0.25) + luckBonus();
  if (Math.random() < lootChance) {
    const statType = pick(["atk", "def", "maxHp"]);
    if (statType === "atk") {
      const bonus = Math.round((0.5 + run.floor * 0.15) * 10) / 10;
      h.atk += bonus;
      log(`Found a weapon shard: +${bonus} ATK for this run.`, "loot");
    } else if (statType === "def") {
      const bonus = Math.round((0.4 + run.floor * 0.12) * 10) / 10;
      h.def += bonus;
      log(`Found armor plating: +${bonus} DEF for this run.`, "loot");
    } else {
      const bonus = Math.round(3 + run.floor * 1.2);
      h.maxHp += bonus;
      h.hp += bonus;
      log(`Found a vitality charm: +${bonus} Max HP for this run.`, "loot");
    }
  }

  run.enemy = null;
  run.floorCleared = true;
}

function gainXp(amount) {
  const h = run.hero;
  h.xp += amount;
  while (h.xp >= h.xpNext) {
    h.xp -= h.xpNext;
    h.level++;
    h.xpNext = Math.round(h.xpNext * 1.25);
    h.maxHp += 5;
    h.atk += 1;
    h.def += 0.5;
    h.hp = h.maxHp;
    log(`Level up! You are now level ${h.level}. Fully healed.`, "level");
  }
}

// ---------- Meta upgrades ----------

function buyUpgrade(type) {
  const cost = upgradeCost(type);
  if (meta.essence < cost) return;
  meta.essence -= cost;
  meta.upg[type]++;
  save();
  render();
}

function resetSave() {
  if (!confirm("Reset all progress? This cannot be undone.")) return;
  meta = defaultMeta();
  run = null;
  setRunning(false);
  clearLog();
  save();
  render();
}

// ---------- Logging ----------

function clearLog() {
  document.getElementById("log").innerHTML = "";
}

function log(msg, cls) {
  const logEl = document.getElementById("log");
  const entry = document.createElement("div");
  entry.className = "log-entry" + (cls ? " " + cls : "");
  entry.textContent = msg;
  logEl.prepend(entry);
  while (logEl.children.length > 60) {
    logEl.removeChild(logEl.lastChild);
  }
}

// ---------- Rendering ----------

function render() {
  // Hero panel
  const h = run ? run.hero : Object.assign({ level: 1, xp: 0, xpNext: 20, gold: 0 }, baseHeroStats(), { hp: baseHeroStats().maxHp });
  document.getElementById("heroLevel").textContent = h.level;
  document.getElementById("heroAtk").textContent = round1(h.atk);
  document.getElementById("heroDef").textContent = round1(h.def);
  document.getElementById("heroGold").textContent = h.gold;
  document.getElementById("heroFloor").textContent = run ? run.floor : 0;

  const hpPct = Math.max(0, (h.hp / h.maxHp) * 100);
  document.getElementById("hpFill").style.width = hpPct + "%";
  document.getElementById("hpLabel").textContent = `${Math.max(0, Math.round(h.hp))} / ${Math.round(h.maxHp)} HP`;

  const xpPct = Math.min(100, (h.xp / h.xpNext) * 100);
  document.getElementById("xpFill").style.width = xpPct + "%";
  document.getElementById("xpLabel").textContent = `${h.xp} / ${h.xpNext} XP`;

  // Dungeon panel
  const banner = document.getElementById("floorBanner");
  const enemyCard = document.getElementById("enemyCard");
  if (!run) {
    banner.textContent = "Press Start Run to descend.";
    enemyCard.classList.add("hidden");
  } else if (run.ended) {
    banner.textContent = `Run ended on floor ${run.floor}. Spend essence, then start again.`;
    enemyCard.classList.add("hidden");
  } else if (run.enemy) {
    banner.textContent = `Floor ${run.floor}`;
    enemyCard.classList.remove("hidden");
    const e = run.enemy;
    document.getElementById("enemyName").textContent = e.name;
    document.getElementById("enemyAtk").textContent = e.atk;
    document.getElementById("enemyDef").textContent = e.def;
    const ePct = Math.max(0, (e.hp / e.maxHp) * 100);
    document.getElementById("enemyHpFill").style.width = ePct + "%";
    document.getElementById("enemyHpLabel").textContent = `${Math.max(0, Math.round(e.hp))} / ${e.maxHp} HP`;
  } else {
    banner.textContent = `Floor ${run.floor}`;
    enemyCard.classList.add("hidden");
  }

  // Meta panel
  document.getElementById("essenceCount").textContent = meta.essence;
  document.getElementById("bestFloor").textContent = meta.bestFloor;
  document.getElementById("lvHp").textContent = meta.upg.hp;
  document.getElementById("lvAtk").textContent = meta.upg.atk;
  document.getElementById("lvDef").textContent = meta.upg.def;
  document.getElementById("lvLuck").textContent = meta.upg.luck;
  document.getElementById("costHp").textContent = upgradeCost("hp");
  document.getElementById("costAtk").textContent = upgradeCost("atk");
  document.getElementById("costDef").textContent = upgradeCost("def");
  document.getElementById("costLuck").textContent = upgradeCost("luck");

  document.querySelectorAll(".upg-btn").forEach((btn) => {
    const type = btn.dataset.type;
    btn.disabled = meta.essence < upgradeCost(type);
  });

  // Start button re-enables after death
  document.getElementById("btnStart").disabled = running;
  document.getElementById("btnStart").textContent = run && !run.ended ? "Run In Progress" : "Start Run";
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ---------- Wiring ----------

function init() {
  load();

  document.getElementById("btnStart").addEventListener("click", startRun);
  document.getElementById("btnPause").addEventListener("click", togglePause);
  document.getElementById("btnReset").addEventListener("click", resetSave);

  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      speed = parseInt(btn.dataset.speed, 10);
      document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.querySelectorAll(".upg-btn").forEach((btn) => {
    btn.addEventListener("click", () => buyUpgrade(btn.dataset.type));
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
