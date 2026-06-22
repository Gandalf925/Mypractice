export const BASE_RESOURCES = Object.freeze(['wood', 'stone', 'fiber']);
export const ORE_RESOURCES = Object.freeze(['copperOre', 'tinOre', 'ironOre']);
export const PROCESSED_RESOURCES = Object.freeze([
  'timber', 'rope', 'cutStone', 'charcoal', 'copperIngot', 'tinIngot',
  'bronzeIngot', 'ironBloom', 'wroughtIron'
]);
export const RESOURCE_KEYS = Object.freeze([...BASE_RESOURCES, ...ORE_RESOURCES, ...PROCESSED_RESOURCES]);

export const RESOURCE_LABELS = Object.freeze({
  wood: '木材', stone: '石材', fiber: '繊維',
  copperOre: '銅鉱石', tinOre: '錫鉱石', ironOre: '鉄鉱石',
  timber: '加工木材', rope: '縄', cutStone: '切石', charcoal: '木炭',
  copperIngot: '銅塊', tinIngot: '錫塊', bronzeIngot: '青銅塊',
  ironBloom: '鉄塊', wroughtIron: '鍛鉄'
});

export const INITIAL_RESOURCES = Object.freeze({ wood: 150, stone: 100, fiber: 70 });

export const CIVILIZATIONS = Object.freeze([
  { level: 0, name: '原始集落', central: '中央焚火', slots: 2, graceMinutes: 0, capacity: { base: 300, processed: 0, ore: 0, metal: 0 }, unlocks: ['barrier0', 'single0', 'area0', 'slow0', 'repair0'] },
  { level: 1, name: '定住集落', central: '集会小屋', slots: 5, graceMinutes: 15, capacity: { base: 800, processed: 200, ore: 0, metal: 0 }, unlocks: ['storehouse1', 'carpentry', 'ropeworks', 'stonecutter', 'barrier1', 'single1', 'area1', 'slow1', 'repair1'] },
  { level: 2, name: '石工集落', central: '石造集会所', slots: 10, graceMinutes: 15, capacity: { base: 1500, processed: 500, ore: 300, metal: 300 }, unlocks: ['storehouse2', 'charcoalKiln', 'copperFurnace', 'tinFurnace', 'trialBronzeFurnace', 'barrier2', 'gate2', 'single2', 'area2', 'slow2', 'repair2'] },
  { level: 3, name: '青銅砦', central: '青銅の砦', slots: 14, graceMinutes: 15, capacity: { base: 3000, processed: 1000, ore: 500, metal: 500 }, unlocks: ['storehouse3', 'bronzeWorkshop', 'bloomery', 'forge', 'barrier3', 'gate3', 'single3', 'area3', 'slow3', 'repair3'] },
  { level: 4, name: '鉄器都市', central: '鉄の城館', slots: 16, graceMinutes: 0, capacity: { base: 6000, processed: 2000, ore: 1000, metal: 1000 }, unlocks: ['storehouse4', 'barrier4', 'gate4', 'single4', 'area4', 'slow4', 'repair4'] }
]);

export const CIVILIZATION_PROJECTS = Object.freeze({
  1: { target: 1, durationSec: 600, contributions: { wood: 180, stone: 110, fiber: 80 }, buildings: { barrier0: 2, single0: 1, otherDefense0: 1 }, progress: { totalKills: 30, totalCampsCaptured: 1, cityHpStreak: { threshold: 50, seconds: 300 } } },
  2: { target: 2, durationSec: 1800, contributions: { wood: 260, stone: 220, fiber: 120, timber: 24, rope: 12, cutStone: 30 }, buildings: { storehouse1: 1, carpentry: 1, ropeworks: 1, stonecutter: 1, upgradedDefenses: 3, upgradedDefenseKinds: 2 }, progress: { totalKills: 100, totalCampsCaptured: 3, totalRepairHpPaid: 200, totalProduced: 30, cityHpStreak: { threshold: 60, seconds: 900 } } },
  3: { target: 3, durationSec: 7200, contributions: { wood: 350, stone: 400, fiber: 180, timber: 40, rope: 20, cutStone: 50, charcoal: 50, bronzeIngot: 24 }, buildings: { storehouse2: 1, charcoalKiln: 1, copperFurnace: 1, tinFurnace: 1, trialBronzeFurnace: 1, barrier2: 3, gate2: 1 }, progress: { totalKills: 250, totalCampsCaptured: 6, copperCampsCaptured: 1, tinCampsCaptured: 1, selfProducedBronze: 24, perfectWaveStreak: 3 } },
  4: { target: 4, durationSec: 28800, contributions: { wood: 500, stone: 650, fiber: 250, timber: 60, rope: 30, cutStone: 80, charcoal: 100, bronzeIngot: 40, wroughtIron: 30 }, buildings: { storehouse3: 1, bronzeWorkshop: 1, bloomery: 1, forge: 1, gate3: 1, bronzeDefenses: 4, bronzeDefenseKinds: 3, wallAtLeast2: 4 }, progress: { totalKills: 500, totalCampsCaptured: 12, siegeCaptainsDefeated: 3, ironCampsCaptured: 2, selfProducedWroughtIron: 30, simultaneousOutposts: 3, perfectWaveStreak: 5, cityHpStreak: { threshold: 70, seconds: 1800 } } }
});

export const PRODUCTION_RECIPES = Object.freeze({
  timber: { name: '加工木材', building: 'carpentry', input: { wood: 10 }, output: { timber: 1 }, seconds: 60, level: 1 },
  rope: { name: '縄', building: 'ropeworks', input: { fiber: 8 }, output: { rope: 1 }, seconds: 60, level: 1 },
  cutStone: { name: '切石', building: 'stonecutter', input: { stone: 12 }, output: { cutStone: 1 }, seconds: 90, level: 1 },
  charcoal: { name: '木炭', building: 'charcoalKiln', input: { wood: 8 }, output: { charcoal: 1 }, seconds: 120, level: 2 },
  copperIngot: { name: '銅塊', building: 'copperFurnace', input: { copperOre: 6, charcoal: 2 }, output: { copperIngot: 1 }, seconds: 180, level: 2 },
  tinIngot: { name: '錫塊', building: 'tinFurnace', input: { tinOre: 4, charcoal: 2 }, output: { tinIngot: 1 }, seconds: 180, level: 2 },
  trialBronze: { name: '試験青銅', building: 'trialBronzeFurnace', input: { copperIngot: 3, tinIngot: 1, charcoal: 2 }, output: { bronzeIngot: 2 }, seconds: 420, level: 2, projectOnly: true },
  bronzeIngot: { name: '青銅塊', building: 'bronzeWorkshop', input: { copperIngot: 3, tinIngot: 1, charcoal: 2 }, output: { bronzeIngot: 4 }, seconds: 300, level: 3 },
  ironBloom: { name: '鉄塊', building: 'bloomery', input: { ironOre: 8, charcoal: 4 }, output: { ironBloom: 1 }, seconds: 300, level: 3 },
  wroughtIron: { name: '鍛鉄', building: 'forge', input: { ironBloom: 1, charcoal: 2 }, output: { wroughtIron: 1 }, seconds: 240, level: 3 }
});

export const SETTLEMENT_BUILDINGS = Object.freeze({
  storehouse1: { name: '簡易倉庫', level: 1, cost: { timber: 8, rope: 3, stone: 20 }, capacityBonus: { base: 400, processed: 100 } },
  carpentry: { name: '木工場', level: 1, cost: { wood: 80, stone: 30, fiber: 20 } },
  ropeworks: { name: '縄工房', level: 1, cost: { wood: 50, stone: 20, fiber: 50 } },
  stonecutter: { name: '石切場', level: 1, cost: { wood: 45, stone: 70, fiber: 15 } },
  storehouse2: { name: '石造倉庫', level: 2, cost: { timber: 15, cutStone: 25, rope: 5 }, capacityBonus: { base: 800, processed: 300, ore: 150, metal: 100 } },
  charcoalKiln: { name: '炭焼き窯', level: 2, cost: { cutStone: 12, timber: 6, rope: 2 } },
  copperFurnace: { name: '銅炉', level: 2, cost: { cutStone: 18, timber: 8, charcoal: 10 } },
  tinFurnace: { name: '錫炉', level: 2, cost: { cutStone: 16, timber: 7, charcoal: 8 } },
  trialBronzeFurnace: { name: '試験青銅炉', level: 2, cost: { cutStone: 15, timber: 8, charcoal: 10 }, limit: 1 },
  storehouse3: { name: '青銅倉庫', level: 3, cost: { cutStone: 30, timber: 18, bronzeIngot: 12 }, capacityBonus: { base: 1500, processed: 500, ore: 250, metal: 250 } },
  bronzeWorkshop: { name: '青銅工房', level: 3, cost: { cutStone: 24, timber: 14, bronzeIngot: 10 } },
  bloomery: { name: '塊鉄炉', level: 3, cost: { cutStone: 30, timber: 12, bronzeIngot: 8, charcoal: 20 } },
  forge: { name: '鍛冶場', level: 3, cost: { cutStone: 26, timber: 16, bronzeIngot: 10, charcoal: 15 } },
  storehouse4: { name: '鉄器倉庫', level: 4, cost: { cutStone: 45, timber: 24, wroughtIron: 16 }, capacityBonus: { base: 3000, processed: 1000, ore: 500, metal: 500 } }
});

export const DEFENSE_LINES = Object.freeze({
  barrier: [
    { key: 'barrier0', name: '丸太柵', hp: 220, cost: { wood: 32, fiber: 10 }, repair: { wood: 20, fiber: 8 } },
    { key: 'barrier1', name: '木柵', hp: 340, upgrade: { timber: 4, rope: 2 }, repair: { timber: 2, rope: 1 } },
    { key: 'barrier2', name: '石壁', hp: 560, upgrade: { cutStone: 12, timber: 2 }, repair: { cutStone: 3 } },
    { key: 'barrier3', name: '青銅補強壁', hp: 760, upgrade: { cutStone: 14, bronzeIngot: 4 }, repair: { cutStone: 3, bronzeIngot: 1 } },
    { key: 'barrier4', name: '鉄壁', hp: 1050, upgrade: { cutStone: 20, wroughtIron: 6 }, repair: { cutStone: 4, wroughtIron: 1 } }
  ],
  single: [
    { key: 'single0', name: '投石台', type: 'gun', hp: 150, range: 78, damage: 5, cooldown: 2.2, cost: { wood: 28, stone: 22, fiber: 8 } },
    { key: 'single1', name: '見張り投石台', range: 85, damage: 7, cooldown: 2, upgrade: { timber: 5, rope: 2, stone: 12 } },
    { key: 'single2', name: '石造監視塔', range: 92, damage: 10, cooldown: 1.9, upgrade: { cutStone: 8, timber: 5, rope: 2 } },
    { key: 'single3', name: '青銅投槍台', range: 100, damage: 17, cooldown: 1.8, upgrade: { timber: 8, rope: 3, bronzeIngot: 6 } },
    { key: 'single4', name: '鉄弩砲', range: 115, damage: 30, cooldown: 2, upgrade: { timber: 10, rope: 4, wroughtIron: 10 } }
  ],
  area: [
    { key: 'area0', name: '岩落とし台', type: 'mortar', hp: 150, range: 125, damage: 30, cooldown: 12, blastRadius: 30, cost: { wood: 42, stone: 48, fiber: 16 } },
    { key: 'area1', name: '大型岩落とし台', range: 130, damage: 38, cooldown: 11, blastRadius: 31, upgrade: { timber: 4, cutStone: 4 } },
    { key: 'area2', name: '牽引式投石機', range: 145, damage: 50, cooldown: 10, blastRadius: 32, upgrade: { cutStone: 10, timber: 8, rope: 5 } },
    { key: 'area3', name: '青銅破砕機', range: 155, damage: 65, cooldown: 9, blastRadius: 34, upgrade: { cutStone: 16, timber: 10, bronzeIngot: 8 } },
    { key: 'area4', name: '重投石機', range: 175, damage: 85, cooldown: 9, blastRadius: 36, upgrade: { cutStone: 20, timber: 16, rope: 8, wroughtIron: 8 } }
  ],
  slow: [
    { key: 'slow0', name: '蔓縄罠', type: 'slow', hp: 150, range: 82, slow: 0.48, duration: 12, damage: 1, maxTargets: 5, cooldown: 5, cost: { wood: 14, stone: 8, fiber: 28 } },
    { key: 'slow1', name: '杭と縄の罠', range: 88, slow: 0.52, duration: 14, damage: 1, maxTargets: 5, cooldown: 5, upgrade: { timber: 2, rope: 4 } },
    { key: 'slow2', name: '重石罠', range: 94, slow: 0.58, duration: 14, damage: 2, maxTargets: 6, cooldown: 4.8, upgrade: { cutStone: 5, rope: 4 } },
    { key: 'slow3', name: '青銅拘束具', range: 100, slow: 0.64, duration: 15, damage: 3, maxTargets: 7, cooldown: 4.5, upgrade: { cutStone: 8, rope: 4, bronzeIngot: 5 } },
    { key: 'slow4', name: '鉄杭罠', range: 108, slow: 0.70, duration: 16, damage: 4, maxTargets: 8, cooldown: 4.2, upgrade: { timber: 4, rope: 3, wroughtIron: 5 } }
  ],
  repair: [
    { key: 'repair0', name: '修繕小屋', type: 'relay', hp: 180, range: 105, repairTower: 5, repairBarrier: 6, cooldown: 3, cost: { wood: 34, stone: 14, fiber: 18 } },
    { key: 'repair1', name: '木工修繕所', range: 110, repairTower: 7, repairBarrier: 8, cooldown: 3, upgrade: { timber: 6, rope: 2 } },
    { key: 'repair2', name: '石工修繕所', range: 115, repairTower: 9, repairBarrier: 10, cooldown: 2.8, upgrade: { cutStone: 8, timber: 6 } },
    { key: 'repair3', name: '青銅修繕所', range: 120, repairTower: 12, repairBarrier: 14, cooldown: 2.7, upgrade: { cutStone: 10, timber: 8, bronzeIngot: 5 } },
    { key: 'repair4', name: '鉄器修繕所', range: 128, repairTower: 16, repairBarrier: 18, cooldown: 2.5, upgrade: { cutStone: 12, timber: 8, wroughtIron: 8 } }
  ],
  gate: [
    null,
    null,
    { key: 'gate2', name: '石門', hp: 700, cost: { cutStone: 18, timber: 8, rope: 4 } },
    { key: 'gate3', name: '青銅門', hp: 950, upgrade: { cutStone: 18, timber: 8, bronzeIngot: 8 } },
    { key: 'gate4', name: '鉄門', hp: 1300, upgrade: { cutStone: 24, timber: 8, wroughtIron: 12 } }
  ]
});

export const ENEMY_DROPS = Object.freeze({
  infantry: { wood: 2, stone: 1 },
  scout: { fiber: 3, wood: 1 },
  shield: { wood: 2, stone: 3 },
  engineer: { wood: 2, stone: 2, fiber: 1 },
  heavy: { stone: 5, wood: 2 },
  raider: { wood: 2, fiber: 4 }
});

export const RESOURCE_OUTPOSTS = Object.freeze({
  copperCamp: { name: '銅鉱前哨地', resource: 'copperOre', amount: 2, intervalSec: 300 },
  tinCamp: { name: '錫鉱前哨地', resource: 'tinOre', amount: 2, intervalSec: 360 },
  ironCamp: { name: '鉄鉱前哨地', resource: 'ironOre', amount: 2, intervalSec: 420 }
});

export function emptyResourceBundle() {
  return Object.fromEntries(RESOURCE_KEYS.map(key => [key, 0]));
}

export function defenseLineForType(type) {
  return type === 'barrier' ? 'barrier' : type === 'gun' ? 'single' : type === 'mortar' ? 'area' : type === 'slow' ? 'slow' : 'repair';
}

export function defenseTierDefinition(type, tier = 0, isGate = false) {
  const line = isGate ? 'gate' : defenseLineForType(type);
  return DEFENSE_LINES[line]?.[tier] ?? null;
}
