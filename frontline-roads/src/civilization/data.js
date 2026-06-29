export const MAX_CIVILIZATION_LEVEL = 7;

export const BASE_RESOURCES = Object.freeze(['wood', 'stone', 'fiber']);
export const ORE_RESOURCES = Object.freeze(['copperOre', 'tinOre', 'ironOre']);
export const PROCESSED_RESOURCES = Object.freeze([
  'timber', 'rope', 'cutStone', 'charcoal', 'copperIngot', 'tinIngot',
  'bronzeIngot', 'ironBloom', 'wroughtIron', 'steel', 'mechanism'
]);
export const RESOURCE_KEYS = Object.freeze([...BASE_RESOURCES, ...ORE_RESOURCES, ...PROCESSED_RESOURCES]);

export const RESOURCE_LABELS = Object.freeze({
  wood: 'Wood', stone: 'Stone', fiber: 'Fiber',
  copperOre: 'Copper ore', tinOre: 'Tin ore', ironOre: 'Iron ore',
  timber: 'Timber', rope: 'Rope', cutStone: 'Cut stone', charcoal: 'Charcoal',
  copperIngot: 'Copper ingot', tinIngot: 'Tin ingot', bronzeIngot: 'Bronze ingot',
  ironBloom: 'Iron bloom', wroughtIron: 'Wrought iron', steel: 'Steel', mechanism: 'Mechanism parts'
});

export const INITIAL_RESOURCES = Object.freeze({ wood: 150, stone: 100, fiber: 70 });

export const CIVILIZATIONS = Object.freeze([
  { level: 0, name: 'Primitive Settlement', central: 'Central Fire', slots: 2, graceMinutes: 0, capacity: { base: 600, processed: 0, ore: 0, metal: 0 }, unlocks: ['barrier0', 'single0', 'area0', 'slow0', 'repair0'] },
  { level: 1, name: 'Settled Village', central: 'Meeting Hut', slots: 5, graceMinutes: 15, capacity: { base: 1800, processed: 600, ore: 0, metal: 0 }, unlocks: ['storehouse1', 'carpentry', 'ropeworks', 'stonecutter', 'barrier1', 'single1', 'area1', 'slow1', 'repair1', 'survey1', 'medical1', 'fieldBarracks1'] },
  { level: 2, name: 'Stonework Settlement', central: 'Stone Meeting Hall', slots: 10, graceMinutes: 15, capacity: { base: 3600, processed: 1400, ore: 1000, metal: 800 }, unlocks: ['storehouse2', 'charcoalKiln', 'copperFurnace', 'tinFurnace', 'trialBronzeFurnace', 'barrier2', 'gate2', 'single2', 'area2', 'slow2', 'repair2', 'survey2', 'medical2', 'fieldBarracks2'] },
  { level: 3, name: 'Bronze Fort', central: 'Bronze Keep', slots: 14, graceMinutes: 15, capacity: { base: 6500, processed: 2600, ore: 1800, metal: 1600 }, unlocks: ['storehouse3', 'bronzeWorkshop', 'bloomery', 'forge', 'barrier3', 'gate3', 'single3', 'area3', 'slow3', 'repair3', 'survey3', 'medical3', 'fieldBarracks3'] },
  { level: 4, name: 'Iron City', central: 'Iron Manor', slots: 17, graceMinutes: 0, capacity: { base: 10000, processed: 4300, ore: 3000, metal: 2800 }, unlocks: ['storehouse4', 'tacticalWorkshop', 'barrier4', 'gate4', 'single4', 'area4', 'slow4', 'repair4', 'survey4', 'medical4', 'fieldBarracks4'] },
  { level: 5, name: 'Steel Citadel', central: 'Steel Keep', slots: 20, graceMinutes: 20, capacity: { base: 15000, processed: 6500, ore: 4600, metal: 4800 }, unlocks: ['steelStorehouse', 'steelworks', 'fortressDepot', 'barrier5', 'gate5', 'single5', 'area5', 'slow5', 'repair5', 'survey5', 'medical5', 'fieldBarracks5'] },
  { level: 6, name: 'Machine City', central: 'Mechanism Command Office', slots: 22, graceMinutes: 20, capacity: { base: 21000, processed: 9000, ore: 6500, metal: 7500 }, unlocks: ['mechanismStorehouse', 'mechanismWorkshop', 'barrier6', 'gate6', 'single6', 'area6', 'slow6', 'repair6', 'survey6', 'medical6', 'fieldBarracks6'] },
  { level: 7, name: 'Road Federation', central: 'Unified Command', slots: 25, graceMinutes: 30, capacity: { base: 30000, processed: 13000, ore: 9000, metal: 11000 }, unlocks: ['federalStorehouse', 'integratedWorks', 'barrier7', 'gate7', 'single7', 'area7', 'slow7', 'repair7', 'survey7', 'medical7', 'fieldBarracks7'] }
]);

export const CIVILIZATION_PROJECTS = Object.freeze({
  1: { target: 1, durationSec: 600, artifactsRequired: 1, contributions: { wood: 25, stone: 35, fiber: 8 }, buildings: { barrier0: 1, single0: 2 }, progress: { totalKills: 20, totalCampsCaptured: 1, cityHpStreak: { threshold: 50, seconds: 300 } } },
  2: { target: 2, durationSec: 1800, artifactsRequired: 2, contributions: { wood: 260, stone: 220, fiber: 120, timber: 24, rope: 12, cutStone: 30 }, buildings: { storehouse1: 1, carpentry: 1, ropeworks: 1, stonecutter: 1, upgradedDefenses: 3, upgradedDefenseKinds: 2 }, progress: { totalKills: 100, totalCampsCaptured: 3, totalRepairHpPaid: 200, totalProduced: 30, cityHpStreak: { threshold: 60, seconds: 900 } } },
  3: { target: 3, durationSec: 7200, artifactsRequired: 4, contributions: { wood: 350, stone: 400, fiber: 180, timber: 40, rope: 20, cutStone: 50, charcoal: 50, bronzeIngot: 24 }, buildings: { storehouse2: 1, charcoalKiln: 1, copperFurnace: 1, tinFurnace: 1, trialBronzeFurnace: 1, barrier2: 3, gate2: 1 }, progress: { totalKills: 250, totalCampsCaptured: 6, copperCampsCaptured: 1, tinCampsCaptured: 1, selfProducedBronze: 24, perfectWaveStreak: 3 } },
  4: { target: 4, durationSec: 28800, artifactsRequired: 7, contributions: { wood: 500, stone: 650, fiber: 250, timber: 60, rope: 30, cutStone: 80, charcoal: 100, bronzeIngot: 40, wroughtIron: 30 }, buildings: { storehouse3: 1, bronzeWorkshop: 1, bloomery: 1, forge: 1, gate3: 1, bronzeDefenses: 4, bronzeDefenseKinds: 3, wallAtLeast2: 4 }, progress: { totalKills: 500, totalCampsCaptured: 12, siegeCaptainsDefeated: 3, ironCampsCaptured: 2, selfProducedWroughtIron: 30, activeFieldBases: 3, perfectWaveStreak: 5, cityHpStreak: { threshold: 70, seconds: 1800 } } },
  5: { target: 5, durationSec: 43200, artifactsRequired: 10, contributions: { wood: 800, stone: 950, fiber: 360, timber: 100, rope: 50, cutStone: 130, charcoal: 180, wroughtIron: 70 }, buildings: { storehouse4: 1, ironDefenses: 8, ironDefenseKinds: 5, gate4: 1 }, progress: { totalKills: 900, totalCampsCaptured: 20, selfProducedWroughtIron: 70, activeFieldBases: 4, perfectWaveStreak: 7, cityHpStreak: { threshold: 70, seconds: 2700 } } },
  6: { target: 6, durationSec: 57600, artifactsRequired: 14, contributions: { wood: 1100, stone: 1300, fiber: 480, timber: 150, rope: 75, cutStone: 180, charcoal: 240, wroughtIron: 90, steel: 60 }, buildings: { steelStorehouse: 1, steelworks: 1, steelDefenses: 10, steelDefenseKinds: 6, gate5: 1 }, progress: { totalKills: 1400, totalCampsCaptured: 30, selfProducedSteel: 60, generation5CommandersDefeated: 4, activeFieldBases: 5, perfectWaveStreak: 9 } },
  7: { target: 7, durationSec: 86400, artifactsRequired: 20, contributions: { wood: 1500, stone: 1800, fiber: 650, timber: 220, rope: 110, cutStone: 260, charcoal: 320, wroughtIron: 120, steel: 100, mechanism: 50 }, buildings: { mechanismStorehouse: 1, mechanismWorkshop: 1, mechanismDefenses: 12, mechanismDefenseKinds: 7, gate6: 1 }, progress: { totalKills: 2200, totalCampsCaptured: 42, selfProducedMechanism: 50, machineWorksCaptured: 1, generation6CommandersDefeated: 5, activeFieldBases: 6, perfectWaveStreak: 12, cityHpStreak: { threshold: 70, seconds: 3600 } } }
});

export const PRODUCTION_RECIPES = Object.freeze({
  timber: { name: 'Timber', building: 'carpentry', input: { wood: 10 }, output: { timber: 1 }, seconds: 60, level: 1 },
  rope: { name: 'Rope', building: 'ropeworks', input: { fiber: 8 }, output: { rope: 1 }, seconds: 60, level: 1 },
  cutStone: { name: 'Cut stone', building: 'stonecutter', input: { stone: 12 }, output: { cutStone: 1 }, seconds: 90, level: 1 },
  charcoal: { name: 'Charcoal', building: 'charcoalKiln', input: { wood: 8 }, output: { charcoal: 1 }, seconds: 120, level: 2 },
  copperIngot: { name: 'Copper ingot', building: 'copperFurnace', input: { copperOre: 6, charcoal: 2 }, output: { copperIngot: 1 }, seconds: 180, level: 2 },
  tinIngot: { name: 'Tin ingot', building: 'tinFurnace', input: { tinOre: 4, charcoal: 2 }, output: { tinIngot: 1 }, seconds: 180, level: 2 },
  trialBronze: { name: 'Trial Bronze', building: 'trialBronzeFurnace', input: { copperIngot: 3, tinIngot: 1, charcoal: 2 }, output: { bronzeIngot: 4 }, seconds: 420, level: 2, projectDelivery: true },
  bronzeIngot: { name: 'Bronze ingot', building: 'bronzeWorkshop', input: { copperIngot: 3, tinIngot: 1, charcoal: 2 }, output: { bronzeIngot: 4 }, seconds: 300, level: 3 },
  ironBloom: { name: 'Iron bloom', building: 'bloomery', input: { ironOre: 8, charcoal: 4 }, output: { ironBloom: 1 }, seconds: 300, level: 3 },
  wroughtIron: { name: 'Wrought iron', building: 'forge', input: { ironBloom: 1, charcoal: 2 }, output: { wroughtIron: 1 }, seconds: 240, level: 3 },
  steel: { name: 'Steel', building: 'steelworks', input: { wroughtIron: 2, charcoal: 4 }, output: { steel: 1 }, seconds: 360, level: 5 },
  mechanism: { name: 'Mechanism parts', building: 'mechanismWorkshop', input: { steel: 2, timber: 1, rope: 1 }, output: { mechanism: 1 }, seconds: 420, level: 6 },
  integratedSteel: { name: 'Integrated Steel', building: 'integratedWorks', input: { wroughtIron: 4, charcoal: 6 }, output: { steel: 3 }, seconds: 600, level: 7 },
  integratedMechanism: { name: 'Integrated Mechanism Parts', building: 'integratedWorks', input: { steel: 4, timber: 2, rope: 2 }, output: { mechanism: 3 }, seconds: 720, level: 7 }
});

export const SETTLEMENT_BUILDINGS = Object.freeze({
  storehouse1: { name: 'Simple Storehouse', description: 'Increases storage capacity for wood, stone, fiber, and early processed materials.', level: 1, cost: { timber: 8, rope: 3, stone: 20 }, capacityBonus: { base: 400, processed: 100 } },
  carpentry: { name: 'Carpentry', description: 'Converts wood into timber. Timber is used to build and upgrade facilities and defenses.', level: 1, cost: { wood: 80, stone: 30, fiber: 20 } },
  ropeworks: { name: 'Ropeworks', description: 'Processes fiber into rope. Rope is used for facility construction, squads, and defense maintenance.', level: 1, cost: { wood: 50, stone: 20, fiber: 50 } },
  stonecutter: { name: 'Stonecutter', description: 'Cuts stone into cut stone for stone facilities and defense upgrades.', level: 1, cost: { wood: 45, stone: 70, fiber: 15 } },
  storehouse2: { name: 'Stone Storehouse', description: 'Greatly increases storage capacity for basic resources, processed materials, ore, and metals.', level: 2, cost: { timber: 15, cutStone: 25, rope: 5 }, capacityBonus: { base: 800, processed: 300, ore: 150, metal: 100 } },
  charcoalKiln: { name: 'Charcoal Kiln', description: 'Processes wood into charcoal for copper, tin, and iron smelting.', level: 2, cost: { cutStone: 12, timber: 6, rope: 2 } },
  copperFurnace: { name: 'Copper Furnace', description: 'Smelts copper ore and charcoal into copper ingots, the main material for bronze.', level: 2, cost: { cutStone: 18, timber: 8, charcoal: 10 } },
  tinFurnace: { name: 'Tin Furnace', description: 'Smelts tin ore and charcoal into tin ingots, combined with copper to make bronze.', level: 2, cost: { cutStone: 16, timber: 7, charcoal: 8 } },
  trialBronzeFurnace: { name: 'Trial Bronze Furnace', description: 'Produces bronze ingots from copper and tin ingots. While a development plan needs bronze, output is delivered to the plan first. Only one can be built.', level: 2, cost: { cutStone: 15, timber: 8, charcoal: 10 }, limit: 1 },
  storehouse3: { name: 'Bronze Storehouse', description: 'Increases all storage categories to support bronze-age mass production.', level: 3, cost: { cutStone: 30, timber: 18, bronzeIngot: 12 }, capacityBonus: { base: 1500, processed: 500, ore: 250, metal: 250 } },
  bronzeWorkshop: { name: 'Bronze Workshop', description: 'Processes copper and tin ingots into bronze ingots for bronze equipment and advanced facilities.', level: 3, cost: { cutStone: 24, timber: 14, bronzeIngot: 10 } },
  bloomery: { name: 'Bloomery', description: 'Produces iron blooms from iron ore and charcoal, the first step toward wrought iron.', level: 3, cost: { cutStone: 30, timber: 12, bronzeIngot: 8, charcoal: 20 } },
  forge: { name: 'Forge', description: 'Processes iron blooms into wrought iron for iron facilities and advanced defenses.', level: 3, cost: { cutStone: 26, timber: 16, bronzeIngot: 10, charcoal: 15 } },
  storehouse4: { name: 'Iron Storehouse', description: 'Increases all storage categories to support iron-city stockpiles.', level: 4, cost: { cutStone: 45, timber: 24, wroughtIron: 16 }, capacityBonus: { base: 3000, processed: 1000, ore: 500, metal: 500 } },
  tacticalWorkshop: { name: 'Tactical Workshop', description: 'Uses tactical materials plus processed and metal resources to craft mines, guidance signals, remote support, and dispatch tickets.', level: 4, cost: { cutStone: 60, timber: 36, wroughtIron: 20, charcoal: 40 }, limit: 1 },
  fortressDepot: { name: 'Fortress Depot', description: 'A high-capacity depot that greatly increases every storage category.', level: 5, cost: { cutStone: 130, timber: 70, wroughtIron: 40, steel: 24 }, capacityBonus: { base: 9000, processed: 4500, ore: 2500, metal: 3500 }, limit: 1 },
  steelStorehouse: { name: 'Steel Storehouse', description: 'Increases storage for steel, other metals, and large-scale defense materials.', level: 5, cost: { cutStone: 60, timber: 30, wroughtIron: 24, steel: 8 }, capacityBonus: { base: 3000, processed: 1200, ore: 500, metal: 1000 } },
  steelworks: { name: 'Steelworks', description: 'Produces steel from wrought iron and charcoal for steel defenses and engineer squads.', level: 5, cost: { cutStone: 55, timber: 26, wroughtIron: 28, charcoal: 40 } },
  mechanismStorehouse: { name: 'Mechanism Storehouse', description: 'Stores advanced machine-city materials, mainly steel and mechanism parts.', level: 6, cost: { cutStone: 80, timber: 36, steel: 24, mechanism: 6 }, capacityBonus: { base: 4000, processed: 1800, ore: 700, metal: 1400 } },
  mechanismWorkshop: { name: 'Mechanism Workshop', description: 'Produces mechanism parts from steel, timber, and rope for mechanized defenses and artillery squads.', level: 6, cost: { cutStone: 75, timber: 40, steel: 32, rope: 20 } },
  federalStorehouse: { name: 'Federal Storehouse', description: 'Greatly increases all storage categories to support Road Federation stockpiles.', level: 7, cost: { cutStone: 110, timber: 55, steel: 36, mechanism: 18 }, capacityBonus: { base: 6000, processed: 2500, ore: 1000, metal: 2000 } },
  integratedWorks: { name: 'Integrated Arsenal', description: 'Mass-produces steel and mechanism parts efficiently for the entire Road Federation.', level: 7, cost: { cutStone: 100, timber: 50, steel: 40, mechanism: 24 } }
});

export const DEFENSE_LINES = Object.freeze({
  barrier: [
    { key: 'barrier0', name: 'Log Palisade', hp: 220, cost: { wood: 32, fiber: 10 }, repair: { wood: 20, fiber: 8 } },
    { key: 'barrier1', name: 'Wooden Palisade', hp: 340, upgrade: { timber: 4, rope: 2 }, repair: { timber: 2, rope: 1 } },
    { key: 'barrier2', name: 'Stone Wall', hp: 560, upgrade: { cutStone: 12, timber: 2 }, repair: { cutStone: 3 } },
    { key: 'barrier3', name: 'Bronze-Reinforced Wall', hp: 760, upgrade: { cutStone: 14, bronzeIngot: 4 }, repair: { cutStone: 3, bronzeIngot: 1 } },
    { key: 'barrier4', name: 'Iron Wall', hp: 1050, upgrade: { cutStone: 20, wroughtIron: 6 }, repair: { cutStone: 4, wroughtIron: 1 } },
    { key: 'barrier5', name: 'Steel-Reinforced Wall', hp: 1450, upgrade: { cutStone: 28, steel: 8 }, repair: { cutStone: 5, steel: 1 } },
    { key: 'barrier6', name: 'Mechanized Wall', hp: 1900, upgrade: { cutStone: 36, steel: 10, mechanism: 4 }, repair: { cutStone: 6, steel: 2 } },
    { key: 'barrier7', name: 'Fortress Wall', hp: 2450, upgrade: { cutStone: 48, steel: 14, mechanism: 8 }, repair: { cutStone: 8, steel: 2, mechanism: 1 } }
  ],
  single: [
    { key: 'single0', name: 'Stone Thrower', type: 'gun', hp: 150, range: 78, damage: 5, cooldown: 2.2, cost: { wood: 28, stone: 22, fiber: 8 } },
    { key: 'single1', name: 'Reinforced Stone Thrower', hp: 180, range: 85, damage: 7, cooldown: 2, upgrade: { timber: 5, rope: 2, stone: 12 } },
    { key: 'single2', name: 'Stone Thrower Tower', hp: 225, range: 92, damage: 10, cooldown: 1.9, upgrade: { cutStone: 8, timber: 5, rope: 2 } },
    { key: 'single3', name: 'Bronze Javelin Platform', hp: 280, range: 100, damage: 17, cooldown: 1.8, upgrade: { timber: 8, rope: 3, bronzeIngot: 6 } },
    { key: 'single4', name: 'Iron Ballista', hp: 350, range: 115, damage: 30, cooldown: 2, upgrade: { timber: 10, rope: 4, wroughtIron: 10 } },
    { key: 'single5', name: 'Repeater Ballista Tower', hp: 440, range: 125, damage: 42, cooldown: 1.8, upgrade: { timber: 14, rope: 6, steel: 10 } },
    { key: 'single6', name: 'Mechanized Ballista', hp: 550, range: 138, damage: 58, cooldown: 1.65, upgrade: { timber: 18, steel: 12, mechanism: 6 } },
    { key: 'single7', name: 'Precision Repeater Ballista', hp: 680, range: 150, damage: 78, cooldown: 1.5, upgrade: { timber: 22, steel: 16, mechanism: 10 } }
  ],
  area: [
    { key: 'area0', name: 'Rock Dropper', type: 'mortar', hp: 150, range: 90, damage: 18, cooldown: 16, blastRadius: 18, maxTargets: 3, splashMultiplier: 0.60, cost: { wood: 50, stone: 60, fiber: 18 } },
    { key: 'area1', name: 'Large Rock Dropper', hp: 185, range: 100, damage: 24, cooldown: 15, blastRadius: 20, maxTargets: 3, splashMultiplier: 0.60, upgrade: { timber: 4, cutStone: 4 } },
    { key: 'area2', name: 'Towed Catapult', hp: 235, range: 115, damage: 34, cooldown: 14, blastRadius: 22, maxTargets: 4, splashMultiplier: 0.60, upgrade: { cutStone: 10, timber: 8, rope: 5 } },
    { key: 'area3', name: 'Bronze Crusher', hp: 300, range: 132, damage: 48, cooldown: 13, blastRadius: 25, maxTargets: 5, splashMultiplier: 0.65, upgrade: { cutStone: 16, timber: 10, bronzeIngot: 8 } },
    { key: 'area4', name: 'Heavy Catapult', hp: 380, range: 150, damage: 68, cooldown: 12, blastRadius: 28, maxTargets: 6, splashMultiplier: 0.65, upgrade: { cutStone: 20, timber: 16, rope: 8, wroughtIron: 8 } },
    { key: 'area5', name: 'Steel Catapult', hp: 480, range: 165, damage: 88, cooldown: 11.5, blastRadius: 31, maxTargets: 7, splashMultiplier: 0.68, upgrade: { cutStone: 26, timber: 18, steel: 10 } },
    { key: 'area6', name: 'Counterweight Catapult', hp: 610, range: 180, damage: 112, cooldown: 10.8, blastRadius: 35, maxTargets: 8, splashMultiplier: 0.70, upgrade: { cutStone: 34, steel: 14, mechanism: 7 } },
    { key: 'area7', name: 'Fortress Bombard Platform', hp: 760, range: 198, damage: 145, cooldown: 10, blastRadius: 38, maxTargets: 10, splashMultiplier: 0.72, upgrade: { cutStone: 44, steel: 18, mechanism: 12 } }
  ],
  slow: [
    { key: 'slow0', name: 'Vine Snare', type: 'slow', hp: 150, range: 72, slow: 0.25, duration: 6, damage: 1, maxTargets: 3, cooldown: 8, cost: { wood: 14, stone: 8, fiber: 28 } },
    { key: 'slow1', name: 'Stake-and-Rope Snare', hp: 175, range: 78, slow: 0.30, duration: 7, damage: 1, maxTargets: 3, cooldown: 7.5, upgrade: { timber: 2, rope: 4 } },
    { key: 'slow2', name: 'Weighted Snare', hp: 215, range: 86, slow: 0.36, duration: 8, damage: 2, maxTargets: 4, cooldown: 7, upgrade: { cutStone: 5, rope: 4 } },
    { key: 'slow3', name: 'Bronze Restraint', hp: 260, range: 94, slow: 0.42, duration: 9, damage: 3, maxTargets: 5, cooldown: 6.5, upgrade: { cutStone: 8, rope: 4, bronzeIngot: 5 } },
    { key: 'slow4', name: 'Iron Stake Trap', hp: 320, range: 102, slow: 0.48, duration: 10, damage: 4, maxTargets: 6, cooldown: 6, upgrade: { timber: 4, rope: 3, wroughtIron: 5 } },
    { key: 'slow5', name: 'Chain Restraint', hp: 400, range: 112, slow: 0.52, duration: 10, damage: 5, maxTargets: 7, cooldown: 5.7, upgrade: { rope: 8, steel: 8 } },
    { key: 'slow6', name: 'Mechanized Restraint', hp: 500, range: 122, slow: 0.56, duration: 11, damage: 6, maxTargets: 9, cooldown: 5.3, upgrade: { steel: 10, mechanism: 6 } },
    { key: 'slow7', name: 'Road Blockade Net', hp: 620, range: 134, slow: 0.60, duration: 12, damage: 8, maxTargets: 10, cooldown: 5, upgrade: { rope: 12, steel: 14, mechanism: 10 } }
  ],
  repair: [
    { key: 'repair0', name: 'Repair Hut', type: 'relay', hp: 180, range: 105, repairTower: 5, repairBarrier: 6, cooldown: 3, cost: { wood: 34, stone: 14, fiber: 18 } },
    { key: 'repair1', name: 'Carpentry Repair Post', hp: 220, range: 110, repairTower: 7, repairBarrier: 8, cooldown: 3, upgrade: { timber: 6, rope: 2 } },
    { key: 'repair2', name: 'Masonry Repair Post', hp: 270, range: 115, repairTower: 9, repairBarrier: 10, cooldown: 2.8, upgrade: { cutStone: 8, timber: 6 } },
    { key: 'repair3', name: 'Bronze Repair Post', hp: 330, range: 120, repairTower: 12, repairBarrier: 14, cooldown: 2.7, upgrade: { cutStone: 10, timber: 8, bronzeIngot: 5 } },
    { key: 'repair4', name: 'Iron Repair Post', hp: 410, range: 128, repairTower: 16, repairBarrier: 18, cooldown: 2.5, upgrade: { cutStone: 12, timber: 8, wroughtIron: 8 } },
    { key: 'repair5', name: 'Steel Repair Post', hp: 510, range: 138, repairTower: 21, repairBarrier: 24, cooldown: 2.3, upgrade: { cutStone: 16, timber: 10, steel: 9 } },
    { key: 'repair6', name: 'Mechanical Repair Post', hp: 630, range: 150, repairTower: 27, repairBarrier: 31, cooldown: 2.1, upgrade: { cutStone: 20, steel: 12, mechanism: 6 } },
    { key: 'repair7', name: 'Central Maintenance Station', hp: 780, range: 165, repairTower: 35, repairBarrier: 40, cooldown: 1.9, upgrade: { cutStone: 28, steel: 16, mechanism: 10 } }
  ],
  medical: [
    null,
    { key: 'medical1', name: 'Wooden Aid Station', type: 'medical', hp: 170, range: 90, recoveryRate: 0.004, cost: { timber: 8, rope: 3, cutStone: 4 } },
    { key: 'medical2', name: 'Stone Aid Station', hp: 220, range: 115, recoveryRate: 0.006, upgrade: { cutStone: 8, timber: 5, rope: 2 } },
    { key: 'medical3', name: 'Military Infirmary', hp: 285, range: 140, recoveryRate: 0.008, upgrade: { cutStone: 12, timber: 7, bronzeIngot: 5 } },
    { key: 'medical4', name: 'General Recovery Hospital', hp: 360, range: 170, recoveryRate: 0.010, upgrade: { cutStone: 16, timber: 10, wroughtIron: 7 } },
    { key: 'medical5', name: 'Field Hospital', hp: 450, range: 190, recoveryRate: 0.012, upgrade: { cutStone: 20, timber: 12, steel: 8 } },
    { key: 'medical6', name: 'Military Hospital', hp: 560, range: 210, recoveryRate: 0.014, upgrade: { cutStone: 24, steel: 10, mechanism: 5 } },
    { key: 'medical7', name: 'Central Medical Institute', hp: 690, range: 235, recoveryRate: 0.016, upgrade: { cutStone: 32, steel: 14, mechanism: 9 } }
  ],
  fieldBarracks: [
    null,
    { key: 'fieldBarracks1', name: 'Frontline Barracks', type: 'fieldBarracks', hp: 150, squadCapacityBonus: 1, cost: { timber: 4, rope: 2, fiber: 20 } },
    { key: 'fieldBarracks2', name: 'Stone Frontline Barracks', hp: 200, squadCapacityBonus: 1, upgrade: { cutStone: 8, timber: 5, rope: 2 } },
    { key: 'fieldBarracks3', name: 'Bronze Frontline Barracks', hp: 260, squadCapacityBonus: 2, upgrade: { cutStone: 10, timber: 7, bronzeIngot: 5 } },
    { key: 'fieldBarracks4', name: 'Iron Frontline Barracks', hp: 330, squadCapacityBonus: 2, upgrade: { cutStone: 14, timber: 8, wroughtIron: 7 } },
    { key: 'fieldBarracks5', name: 'Steel Frontline Barracks', hp: 420, squadCapacityBonus: 3, upgrade: { cutStone: 18, timber: 10, steel: 8 } },
    { key: 'fieldBarracks6', name: 'Mechanized Frontline Barracks', hp: 530, squadCapacityBonus: 3, upgrade: { cutStone: 22, steel: 10, mechanism: 5 } },
    { key: 'fieldBarracks7', name: 'Frontline Command Post', hp: 660, squadCapacityBonus: 4, upgrade: { cutStone: 30, steel: 14, mechanism: 9 } }
  ],
  survey: [
    null,
    { key: 'survey1', name: 'Wooden Survey Tower', type: 'survey', hp: 160, surveyRadius: 600, scanInterval: 180, cost: { timber: 6, rope: 3, stone: 20 } },
    { key: 'survey2', name: 'Stone Survey Tower', hp: 210, surveyRadius: 900, scanInterval: 150, upgrade: { cutStone: 8, timber: 4, rope: 2 } },
    { key: 'survey3', name: 'Bronze Survey Tower', hp: 270, surveyRadius: 1200, scanInterval: 120, upgrade: { cutStone: 10, timber: 6, bronzeIngot: 5 } },
    { key: 'survey4', name: 'Iron Survey Tower', hp: 340, surveyRadius: 1600, scanInterval: 90, upgrade: { cutStone: 14, timber: 8, wroughtIron: 7 } },
    { key: 'survey5', name: 'Steel Survey Tower', hp: 430, surveyRadius: 1900, scanInterval: 75, upgrade: { cutStone: 18, timber: 10, steel: 8 } },
    { key: 'survey6', name: 'Signal Survey Station', hp: 540, surveyRadius: 2200, scanInterval: 60, upgrade: { cutStone: 22, steel: 10, mechanism: 5 } },
    { key: 'survey7', name: 'Road Network Survey Bureau', hp: 680, surveyRadius: 2500, scanInterval: 45, upgrade: { cutStone: 30, steel: 14, mechanism: 9 } }
  ],
  gate: [
    null, null,
    { key: 'gate2', name: 'Stone Gate', hp: 500, cost: { cutStone: 18, timber: 8, rope: 4 } },
    { key: 'gate3', name: 'Bronze Gate', hp: 680, upgrade: { cutStone: 18, timber: 8, bronzeIngot: 8 } },
    { key: 'gate4', name: 'Iron Gate', hp: 920, upgrade: { cutStone: 24, timber: 8, wroughtIron: 12 } },
    { key: 'gate5', name: 'Steel Gate', hp: 1280, upgrade: { cutStone: 30, steel: 14 } },
    { key: 'gate6', name: 'Mechanized Gate', hp: 1680, upgrade: { cutStone: 40, steel: 18, mechanism: 8 } },
    { key: 'gate7', name: 'Fortress Gate', hp: 2150, upgrade: { cutStone: 52, steel: 24, mechanism: 14 } }
  ]
});

export const ENEMY_DROPS = Object.freeze({
  infantry: { wood: 2, stone: 1 }, scout: { fiber: 3, wood: 1 }, shield: { wood: 2, stone: 3 },
  engineer: { wood: 2, stone: 2, fiber: 1 }, heavy: { stone: 5, wood: 2 }, raider: { wood: 2, fiber: 4 }
});

export function emptyResourceBundle() { return Object.fromEntries(RESOURCE_KEYS.map(key => [key, 0])); }

export function defenseLineForType(type) {
  return type === 'barrier' ? 'barrier' : type === 'gun' ? 'single' : type === 'mortar' ? 'area' : type === 'slow' ? 'slow' : type === 'survey' ? 'survey' : type === 'medical' ? 'medical' : type === 'fieldBarracks' ? 'fieldBarracks' : 'repair';
}

export function defenseTierDefinition(type, tier = 0, isGate = false) {
  const line = isGate ? 'gate' : defenseLineForType(type);
  return DEFENSE_LINES[line]?.[tier] ?? null;
}
