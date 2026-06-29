import { MAJOR_BASE_BUILD_RANGE_METERS } from '../base/construction-range.js';
export const CITY_RECOVERY_DELAY_SECONDS = 75;
export const CITY_RECOVERY_HP_PER_SECOND = 0.12;

import { DEFENSE_LINES, ENEMY_DROPS, defenseLineForType, defenseTierDefinition } from '../civilization/data.js';

export const BUILD_RANGE_METERS = MAJOR_BASE_BUILD_RANGE_METERS;
export const MAX_ENEMIES = 960;

export const ENEMY_DEFINITIONS = Object.freeze({
  infantry: {
    name: 'Infantry', hp: 50, speed: 1.2, cityDamage: 8, barrierDps: 2, radius: 4.5, drops: ENEMY_DROPS.infantry,
    personality: 'direct', barrierStrategy: 'balanced', barrierCostFactor: 1.05, routeLabel: 'Shortest advance', objectiveLabel: 'City'
  },
  scout: {
    name: 'Scout', hp: 25, speed: 1.75, cityDamage: 4, barrierDps: 1, radius: 3.7, drops: ENEMY_DROPS.scout,
    personality: 'evasive', avoidTowers: true, barrierStrategy: 'avoid', barrierCostFactor: 2.8, routeLabel: 'Risk avoidance', objectiveLabel: 'City'
  },
  shield: {
    name: 'Shield Soldier', hp: 100, speed: 0.95, cityDamage: 8, barrierDps: 2, radius: 5.4, drops: ENEMY_DROPS.shield, shieldAura: 0.30,
    personality: 'guardian', barrierStrategy: 'balanced', barrierCostFactor: 0.9, routeLabel: 'Guarded advance', objectiveLabel: 'City'
  },
  engineer: {
    name: 'Engineer', hp: 60, speed: 1.0, cityDamage: 5, barrierDps: 8, radius: 4.7, drops: ENEMY_DROPS.engineer,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.42, routeLabel: 'Wall breach', objectiveLabel: 'City'
  },
  heavy: {
    name: 'Heavy Infantry', hp: 180, speed: 0.7, cityDamage: 20, barrierDps: 6, radius: 6.5, drops: ENEMY_DROPS.heavy, slowResistance: 0.5,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.78, routeLabel: 'Frontal breach', objectiveLabel: 'City'
  },
  raider: {
    name: 'Saboteur', hp: 55, speed: 1.3, cityDamage: 6, barrierDps: 3, radius: 4.9, drops: ENEMY_DROPS.raider,
    personality: 'saboteur', barrierStrategy: 'avoid', barrierCostFactor: 2.0, routeLabel: 'Facility infiltration', objectiveLabel: 'Support / firepower facilities',
    targetPriorities: ['medical', 'fieldBarracks', 'relay', 'mortar', 'gun', 'slow'], facilitySearchRadius: 420, facilityDps: 12, stunSeconds: 8,
    attackMessage: 'Saboteur disabled a defense facility.'
  },
  archer: {
    name: 'Archer', hp: 45, speed: 1.05, cityDamage: 7, barrierDps: 1, radius: 4, drops: { wood: 2, fiber: 4 }, generation: 1,
    personality: 'evasive', avoidTowers: true, barrierStrategy: 'avoid', barrierCostFactor: 2.4, routeLabel: 'Line-of-fire avoidance', objectiveLabel: 'City'
  },
  ropeCutter: {
    name: 'Rope Cutter', hp: 65, speed: 1.1, cityDamage: 6, barrierDps: 5, radius: 4.5, drops: { wood: 2, stone: 1, fiber: 3 }, generation: 1,
    personality: 'saboteur', barrierStrategy: 'balanced', barrierCostFactor: 0.9, routeLabel: 'Disruption removal', objectiveLabel: 'Slow / repair facilities',
    targetPriorities: ['slow', 'relay'], facilitySearchRadius: 360, facilityPriorityPenaltySeconds: 120, facilityDps: 10,
    attackMessage: 'Rope Cutter is destroying disruption facilities.'
  },
  pathfinder: {
    name: 'Pathfinder Scout', hp: 34, speed: 1.65, cityDamage: 5, barrierDps: 1.2, radius: 3.9, drops: { wood: 1, fiber: 4 }, generation: 1,
    personality: 'flanker', avoidTowers: true, avoidCongestion: true, barrierStrategy: 'avoid', barrierCostFactor: 3.1,
    flankPreference: 3.8, flankWidthMeters: 145, maxDetourRatio: 1.70, minimumLateralMeters: 35,
    routeLabel: 'Wide detour', objectiveLabel: 'City / Simple Base', cityPriorityPenalty: 10, fieldBasePriorityPenalty: 4
  },
  marauder: {
    name: 'Marauder', hp: 72, speed: 1.22, cityDamage: 8, barrierDps: 3, radius: 4.8, drops: { wood: 3, stone: 1, fiber: 3 }, generation: 1,
    personality: 'marauder', avoidCongestion: true, barrierStrategy: 'balanced', barrierCostFactor: 1.1,
    routeLabel: 'Base raid', objectiveLabel: 'Simple Base', cityPriorityPenalty: 50, fieldBasePriorityPenalty: 0
  },
  miner: {
    name: 'Miner', hp: 85, speed: 0.9, cityDamage: 8, barrierDps: 4, radius: 5, drops: { stone: 3, copperOre: 1 }, generation: 2,
    personality: 'direct', barrierStrategy: 'balanced', barrierCostFactor: 1.0, routeLabel: 'Resource escort', objectiveLabel: 'City'
  },
  siegeBreaker: {
    name: 'Siege Breaker', hp: 145, speed: 0.72, cityDamage: 18, barrierDps: 12, settlementDamage: 18, radius: 6, drops: { stone: 5, charcoal: 1 }, generation: 2,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.3, routeLabel: 'Wall-first breach', objectiveLabel: 'City'
  },
  oreCarrier: {
    name: 'Ore Carrier', hp: 70, speed: 1.2, cityDamage: 5, barrierDps: 2, radius: 4.8, drops: { stone: 2, copperOre: 1, tinOre: 1 }, generation: 2,
    personality: 'evasive', barrierStrategy: 'avoid', barrierCostFactor: 1.8, routeLabel: 'Escort detour', objectiveLabel: 'City'
  },
  sapper: {
    name: 'Demolition Engineer', hp: 82, speed: 0.88, cityDamage: 7, barrierDps: 18, radius: 5.1, drops: { stone: 4, charcoal: 2 }, generation: 2,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.12, routeLabel: 'Demolition breach', objectiveLabel: 'Wall / City'
  },
  pillager: {
    name: 'Resource Pillager', hp: 105, speed: 1.02, cityDamage: 11, barrierDps: 4, radius: 5.3, drops: { wood: 3, stone: 3, copperOre: 1 }, generation: 2,
    personality: 'marauder', avoidCongestion: true, barrierStrategy: 'balanced', barrierCostFactor: 1.0,
    routeLabel: 'Frontline raid', objectiveLabel: 'Simple Base / support facilities', cityPriorityPenalty: 42, fieldBasePriorityPenalty: 0,
    targetPriorities: ['survey', 'relay', 'fieldBarracks', 'medical'], facilitySearchRadius: 460, facilityDps: 13,
    attackMessage: 'Resource Pillager is destroying frontline support facilities.'
  },
  bronzeShield: {
    name: 'Bronze Shield Soldier', hp: 170, speed: 0.78, cityDamage: 14, barrierDps: 4, radius: 6, drops: { stone: 4, bronzeIngot: 1 }, generation: 3, shieldAura: 0.35,
    personality: 'guardian', barrierStrategy: 'balanced', barrierCostFactor: 0.72, routeLabel: 'Heavy guarded advance', objectiveLabel: 'City'
  },
  siegeCaptain: {
    name: 'Siege Captain', hp: 270, speed: 0.62, cityDamage: 30, barrierDps: 16, settlementDamage: 24, radius: 7, drops: { charcoal: 3, bronzeIngot: 2 }, generation: 3, slowResistance: 0.35,
    personality: 'commander', barrierStrategy: 'breach', barrierCostFactor: 0.24, routeLabel: 'Siege command', objectiveLabel: 'Heavy firepower facilities',
    targetPriorities: ['mortar', 'gun'], facilitySearchRadius: 500, facilityDps: 16, speedAura: 0.10, auraRange: 32,
    attackMessage: 'Siege Captain is concentrating attacks on firepower facilities.'
  },
  ironCarrier: {
    name: 'Iron Ore Carrier', hp: 115, speed: 1.0, cityDamage: 9, barrierDps: 4, radius: 5.2, drops: { stone: 3, ironOre: 2 }, generation: 3,
    personality: 'evasive', barrierStrategy: 'avoid', barrierCostFactor: 1.55, routeLabel: 'Escort detour', objectiveLabel: 'City'
  },
  flankRider: {
    name: 'Flanking Cavalry', hp: 145, speed: 1.8, cityDamage: 16, barrierDps: 3, radius: 5.8, drops: { fiber: 4, bronzeIngot: 1 }, generation: 3, slowResistance: 0.25,
    personality: 'flanker', avoidTowers: true, avoidCongestion: true, barrierStrategy: 'avoid', barrierCostFactor: 3.4,
    flankPreference: 4.4, flankWidthMeters: 190, maxDetourRatio: 1.85, minimumLateralMeters: 55,
    routeLabel: 'Long-range flank attack', objectiveLabel: 'City / Simple Base', cityPriorityPenalty: 8, fieldBasePriorityPenalty: 2
  },
  warDrummer: {
    name: 'War Drummer', hp: 135, speed: 0.95, cityDamage: 9, barrierDps: 3, radius: 5.4, drops: { wood: 3, fiber: 4, bronzeIngot: 1 }, generation: 3,
    personality: 'support', barrierStrategy: 'balanced', barrierCostFactor: 1.0, routeLabel: 'Main-force support', objectiveLabel: 'Nearby squad support',
    speedAura: 0.14, auraRange: 42
  },
  ironclad: {
    name: 'Ironclad Soldier', hp: 330, speed: 0.55, cityDamage: 36, barrierDps: 10, radius: 7.2, drops: { ironOre: 3, wroughtIron: 1 }, generation: 4, slowResistance: 0.65,
    personality: 'guardian', barrierStrategy: 'breach', barrierCostFactor: 0.5, routeLabel: 'Ironclad breach', objectiveLabel: 'City'
  },
  heavySiege: {
    name: 'Heavy Siege Soldier', hp: 460, speed: 0.42, cityDamage: 50, barrierDps: 24, settlementDamage: 36, radius: 8, drops: { ironOre: 4, wroughtIron: 1 }, generation: 4, slowResistance: 0.5,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.16, routeLabel: 'Wall crushing', objectiveLabel: 'Wall / firepower facilities',
    targetPriorities: ['mortar', 'gun', 'slow'], facilitySearchRadius: 430, facilityPriorityPenaltySeconds: 45
  },
  commander: {
    name: 'Commander', hp: 310, speed: 0.75, cityDamage: 25, barrierDps: 8, radius: 7, drops: { bronzeIngot: 2, wroughtIron: 2 }, generation: 4,
    personality: 'commander', commanderAura: 0.18, speedAura: 0.18, auraRange: 35,
    barrierStrategy: 'balanced', barrierCostFactor: 0.68, routeLabel: 'Squad command', objectiveLabel: 'City'
  },
  squadHunter: {
    name: 'Squad Hunter', hp: 220, speed: 1.34, cityDamage: 15, barrierDps: 5, radius: 6, drops: { ironOre: 2, bronzeIngot: 1 }, generation: 4, slowResistance: 0.3,
    personality: 'hunter', huntFriendlySquads: true, huntRadius: 650, avoidCongestion: true, barrierStrategy: 'balanced', barrierCostFactor: 0.95,
    routeLabel: 'Friendly squad pursuit', objectiveLabel: 'Friendly squads on roads', cityPriorityPenalty: 60, fieldBasePriorityPenalty: 35
  },
  ironSaboteur: {
    name: 'Heavy Saboteur', hp: 265, speed: 0.9, cityDamage: 20, barrierDps: 8, radius: 6.3, drops: { ironOre: 2, wroughtIron: 1 }, generation: 4, slowResistance: 0.35,
    personality: 'saboteur', avoidTowers: true, barrierStrategy: 'avoid', barrierCostFactor: 2.1,
    routeLabel: 'Rear facility sabotage', objectiveLabel: 'Healing / repair / firepower facilities',
    targetPriorities: ['medical', 'fieldBarracks', 'relay', 'mortar', 'gun', 'slow', 'survey'], facilitySearchRadius: 560, facilityDps: 22, stunSeconds: 12,
    attackMessage: 'Heavy Saboteur disabled rear facilities.'
  },
  bodyguard: {
    name: 'Iron Guard', hp: 390, speed: 0.62, cityDamage: 24, barrierDps: 10, radius: 7.4, drops: { ironOre: 3, wroughtIron: 1 }, generation: 4, slowResistance: 0.55, shieldAura: 0.42,
    personality: 'guardian', barrierStrategy: 'breach', barrierCostFactor: 0.62, routeLabel: 'Elite guard', objectiveLabel: 'Guard command / siege squads'
  },
  steelGuard: {
    name: 'Steel Guard', hp: 480, speed: 0.58, cityDamage: 32, barrierDps: 12, radius: 7.8, drops: { wroughtIron: 2, steel: 1 }, generation: 5, slowResistance: 0.68, shieldAura: 0.46,
    personality: 'guardian', barrierStrategy: 'breach', barrierCostFactor: 0.55, routeLabel: 'Steel guard', objectiveLabel: 'Guard command / breaching squads'
  },
  demolitionEngineer: {
    name: 'Demolition Engineer', hp: 340, speed: 0.72, cityDamage: 34, barrierDps: 30, settlementDamage: 42, radius: 6.8, targetPriorities: ['mortar', 'gun', 'slow', 'relay'], facilitySearchRadius: 520, facilityPriorityPenaltySeconds: 34, drops: { wroughtIron: 2, steel: 1 }, generation: 5, slowResistance: 0.42,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.10, routeLabel: 'Steel crushing', objectiveLabel: 'Wall / Gate / City'
  },
  pursuitCavalry: {
    name: 'Pursuit Cavalry', hp: 260, speed: 1.55, cityDamage: 22, barrierDps: 5, radius: 6.2, drops: { fiber: 5, steel: 1 }, generation: 5, slowResistance: 0.38,
    personality: 'hunter', huntFriendlySquads: true, huntRadius: 850, avoidCongestion: true, barrierStrategy: 'avoid', barrierCostFactor: 1.8, routeLabel: 'High-speed pursuit', objectiveLabel: 'Friendly squads on roads'
  },
  steelCaptain: {
    name: 'Steel Captain', hp: 430, speed: 0.76, cityDamage: 34, barrierDps: 12, radius: 7.2, drops: { steel: 2, wroughtIron: 2 }, generation: 5,
    personality: 'commander', commanderAura: 0.22, speedAura: 0.14, auraRange: 44, barrierStrategy: 'balanced', barrierCostFactor: 0.62, routeLabel: 'Steel squad command', objectiveLabel: 'City'
  },
  mobileLancer: {
    name: 'Mobile Lancer', hp: 330, speed: 1.48, cityDamage: 30, barrierDps: 7, radius: 6.5, drops: { steel: 1, mechanism: 1 }, generation: 6, slowResistance: 0.42,
    personality: 'flanker', avoidTowers: true, avoidCongestion: true, barrierStrategy: 'avoid', barrierCostFactor: 3.6, flankPreference: 4.8, flankWidthMeters: 230, maxDetourRatio: 1.95, minimumLateralMeters: 65, routeLabel: 'Mobile flank attack', objectiveLabel: 'City / Simple Base'
  },
  mechanicalSiege: {
    name: 'Mechanized Siege Soldier', hp: 620, speed: 0.48, cityDamage: 62, barrierDps: 38, settlementDamage: 55, radius: 8.6, drops: { steel: 2, mechanism: 1 }, generation: 6, slowResistance: 0.62,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.08, routeLabel: 'Mechanized breach', objectiveLabel: 'Gate / firepower facilities',
    targetPriorities: ['mortar', 'gun', 'slow', 'relay'], facilitySearchRadius: 620, facilityPriorityPenaltySeconds: 28
  },
  armoredAgent: {
    name: 'Armored Saboteur', hp: 390, speed: 0.96, cityDamage: 28, barrierDps: 10, radius: 6.7, drops: { steel: 1, mechanism: 1 }, generation: 6, slowResistance: 0.45,
    personality: 'saboteur', avoidTowers: true, barrierStrategy: 'avoid', barrierCostFactor: 2.4, routeLabel: 'Support network sabotage', objectiveLabel: 'Healing / repair / barracks', targetPriorities: ['medical', 'relay', 'fieldBarracks', 'survey'], facilitySearchRadius: 650, facilityDps: 30, stunSeconds: 15,
    attackMessage: 'Armored Saboteur disabled the frontline support network.'
  },
  machineCommander: {
    name: 'Line Commander', hp: 520, speed: 0.82, cityDamage: 40, barrierDps: 13, radius: 7.5, drops: { steel: 2, mechanism: 2 }, generation: 6,
    personality: 'commander', commanderAura: 0.26, speedAura: 0.20, auraRange: 52, barrierStrategy: 'balanced', barrierCostFactor: 0.58, routeLabel: 'Mechanized line', objectiveLabel: 'City'
  },
  royalGuard: {
    name: 'Royal Heavy Guard', hp: 760, speed: 0.52, cityDamage: 48, barrierDps: 18, radius: 9, drops: { steel: 3, mechanism: 2 }, generation: 7, slowResistance: 0.78, shieldAura: 0.52,
    personality: 'guardian', barrierStrategy: 'breach', barrierCostFactor: 0.42, routeLabel: 'Royal guard', objectiveLabel: 'Guard Supreme Commander'
  },
  fortressBreaker: {
    name: 'Fortress Breaker', hp: 880, speed: 0.40, cityDamage: 85, barrierDps: 52, settlementDamage: 70, radius: 9.4, drops: { steel: 3, mechanism: 2 }, generation: 7, slowResistance: 0.70,
    personality: 'breacher', barrierStrategy: 'breach', barrierCostFactor: 0.05, routeLabel: 'Fortress crushing', objectiveLabel: 'Fortress wall / firepower facilities',
    targetPriorities: ['mortar', 'gun', 'slow', 'relay'], facilitySearchRadius: 760, facilityPriorityPenaltySeconds: 18
  },
  roadHunter: {
    name: 'Road Hunters', hp: 440, speed: 1.42, cityDamage: 34, barrierDps: 8, radius: 7, drops: { steel: 2, mechanism: 1 }, generation: 7, slowResistance: 0.48,
    personality: 'hunter', huntFriendlySquads: true, huntRadius: 1100, avoidCongestion: true, barrierStrategy: 'balanced', barrierCostFactor: 1.0, routeLabel: 'Road network hunt', objectiveLabel: 'Friendly squads / frontline bases'
  },
  royalCommander: {
    name: 'Supreme Commander', hp: 920, speed: 0.68, cityDamage: 72, barrierDps: 22, radius: 9.2, drops: { steel: 4, mechanism: 3 }, generation: 7, slowResistance: 0.60,
    personality: 'commander', commanderAura: 0.34, speedAura: 0.25, shieldAura: 0.20, auraRange: 62, barrierStrategy: 'breach', barrierCostFactor: 0.45, routeLabel: 'Federal invasion command', objectiveLabel: 'Unified Command'
  }
});

export const ENEMY_GENERATIONS = Object.freeze({
  0: ['infantry', 'scout', 'shield', 'engineer', 'heavy', 'raider'],
  1: ['archer', 'ropeCutter', 'pathfinder', 'marauder'],
  2: ['miner', 'siegeBreaker', 'oreCarrier', 'sapper', 'pillager'],
  3: ['bronzeShield', 'siegeCaptain', 'ironCarrier', 'flankRider', 'warDrummer'],
  4: ['ironclad', 'heavySiege', 'commander', 'squadHunter', 'ironSaboteur', 'bodyguard'],
  5: ['steelGuard', 'demolitionEngineer', 'pursuitCavalry', 'steelCaptain'],
  6: ['mobileLancer', 'mechanicalSiege', 'armoredAgent', 'machineCommander'],
  7: ['royalGuard', 'fortressBreaker', 'roadHunter', 'royalCommander']
});

export const ENEMY_BASE_DEFINITIONS = Object.freeze({
  barracks: {
    name: 'Outpost', icon: '⚑', interval: 180, firstDelay: 90, range: [160, 240], reward: { wood: 40, stone: 20, fiber: 20 },
    waves: { 1: ['infantry', 'infantry', 'scout'], 2: ['infantry', 'infantry', 'infantry', 'shield'], 3: ['infantry', 'infantry', 'infantry', 'infantry', 'scout', 'shield'] }
  },
  engineer: {
    name: 'Engineer Outpost', icon: '⚒', interval: 300, firstDelay: 150, range: [260, 380], reward: { wood: 45, stone: 45, fiber: 20 },
    waves: { 1: ['engineer', 'infantry', 'infantry'], 2: ['engineer', 'shield', 'infantry', 'infantry'], 3: ['engineer', 'engineer', 'shield', 'infantry', 'infantry'] }
  },
  raider: {
    name: 'Saboteur Outpost', icon: '✦', interval: 360, firstDelay: 180, range: [260, 420], reward: { wood: 40, stone: 20, fiber: 70 },
    waves: { 1: ['raider', 'scout'], 2: ['raider', 'raider', 'scout'], 3: ['raider', 'raider', 'engineer', 'scout'] }
  },
  copperCamp: {
    name: 'Copper Ore Camp', icon: 'Cu', interval: 420, firstDelay: 180, range: [300, 650], reward: { copperOre: 120, stone: 20 }, isResourceBase: true,
    waves: { 1: ['miner', 'oreCarrier'], 2: ['miner', 'miner', 'oreCarrier', 'shield'], 3: ['siegeBreaker', 'miner', 'oreCarrier', 'oreCarrier'] }
  },
  tinCamp: {
    name: 'Tin Ore Camp', icon: 'Sn', interval: 480, firstDelay: 220, range: [350, 700], reward: { tinOre: 32, stone: 20 }, isResourceBase: true,
    waves: { 1: ['miner', 'oreCarrier'], 2: ['miner', 'oreCarrier', 'ropeCutter'], 3: ['siegeBreaker', 'miner', 'oreCarrier', 'ropeCutter'] }
  },
  ironCamp: {
    name: 'Iron Ore Camp', icon: 'Fe', interval: 540, firstDelay: 240, range: [400, 800], reward: { ironOre: 128, stone: 30 }, isResourceBase: true,
    waves: { 1: ['ironCarrier', 'bronzeShield'], 2: ['ironCarrier', 'ironCarrier', 'bronzeShield'], 3: ['siegeCaptain', 'ironCarrier', 'bronzeShield'] }
  },
  bronzeCamp: {
    name: 'Bronze Military Camp', icon: 'Bz', interval: 600, firstDelay: 280, range: [450, 850], reward: { bronzeIngot: 12, charcoal: 20 }, isResourceBase: true,
    waves: { 1: ['bronzeShield', 'archer'], 2: ['bronzeShield', 'bronzeShield', 'siegeBreaker'], 3: ['siegeCaptain', 'bronzeShield', 'archer'] }
  },
  siegeWorks: {
    name: 'Siege Workshop', icon: '⚒', interval: 720, firstDelay: 320, range: [500, 950], reward: { wroughtIron: 8, charcoal: 24 }, isResourceBase: true,
    waves: { 1: ['siegeBreaker', 'miner'], 2: ['siegeBreaker', 'bronzeShield', 'ropeCutter'], 3: ['siegeCaptain', 'siegeBreaker', 'bronzeShield'] }
  },
  motor: {
    name: 'Armored Factory', icon: '⬢', interval: 420, firstDelay: 240, range: [420, 550], reward: { wood: 30, stone: 100, fiber: 30 },
    waves: { 1: ['heavy', 'infantry', 'infantry'], 2: ['heavy', 'shield', 'infantry', 'infantry'], 3: ['heavy', 'heavy', 'shield', 'scout'] }
  },
  steelCamp: {
    name: 'Steel Camp', icon: 'St', interval: 660, firstDelay: 360, range: [650, 1100], reward: { steel: 14, wroughtIron: 16, charcoal: 30 }, isResourceBase: true,
    waves: { 1: ['steelGuard', 'demolitionEngineer'], 2: ['steelGuard', 'pursuitCavalry', 'steelCaptain'], 3: ['steelCaptain', 'steelGuard', 'demolitionEngineer', 'pursuitCavalry'] }
  },
  machineWorks: {
    name: 'Machine Works', icon: 'Mc', interval: 720, firstDelay: 420, range: [750, 1250], reward: { mechanism: 10, steel: 18 }, isResourceBase: true,
    waves: { 1: ['mobileLancer', 'armoredAgent'], 2: ['mechanicalSiege', 'mobileLancer', 'machineCommander'], 3: ['machineCommander', 'mechanicalSiege', 'armoredAgent', 'mobileLancer'] }
  },
  commandFortress: {
    name: 'Command Fortress', icon: 'HQ', interval: 780, firstDelay: 480, range: [900, 1500], reward: { mechanism: 16, steel: 24 }, isResourceBase: true,
    waves: { 1: ['royalGuard', 'roadHunter'], 2: ['fortressBreaker', 'royalGuard', 'royalCommander'], 3: ['royalCommander', 'fortressBreaker', 'royalGuard', 'roadHunter'] }
  }
});

const ICONS = Object.freeze({ barrier: '▰', gun: '⌁', mortar: '◉', slow: '◌', relay: '⚒', survey: '⌖', medical: '✚', fieldBarracks: '▣' });
const KINDS = Object.freeze({ barrier: 'barrier', gun: 'tower', mortar: 'tower', slow: 'tower', relay: 'tower', survey: 'tower', medical: 'tower', fieldBarracks: 'tower' });
const INITIAL_TIERS = Object.freeze({ survey: 1, medical: 1, fieldBarracks: 1 });

export const DEFENSE_DEFINITIONS = Object.freeze(Object.fromEntries(
  ['barrier', 'gun', 'mortar', 'slow', 'relay', 'survey', 'medical', 'fieldBarracks'].map(type => {
    const initialTier = INITIAL_TIERS[type] ?? 0;
    const tier = defenseTierDefinition(type, initialTier);
    return [type, Object.freeze({
      type,
      line: defenseLineForType(type),
      name: tier.name,
      icon: ICONS[type],
      kind: KINDS[type],
      initialTier,
      requiredCivilizationLevel: initialTier,
      allowedAnchorKinds: type === 'survey' ? ['MAJOR', 'FIELD', 'EXPEDITION'] : type === 'medical' ? ['MAJOR', 'FIELD', 'EXPEDITION'] : type === 'fieldBarracks' ? ['FIELD'] : null,
      limitPerAnchor: ['survey', 'medical', 'fieldBarracks'].includes(type) ? 1 : null,
      cost: tier.cost,
      hp: tier.hp,
      range: tier.range,
      damage: tier.damage,
      cooldown: tier.cooldown,
      blastRadius: tier.blastRadius,
      maxTargets: tier.maxTargets,
      splashMultiplier: tier.splashMultiplier,
      slowSeconds: tier.duration,
      slow: tier.slow,
      repairTower: tier.repairTower,
      repairBarrier: tier.repairBarrier,
      surveyRadius: tier.surveyRadius,
      scanInterval: tier.scanInterval,
      recoveryRate: tier.recoveryRate,
      squadCapacityBonus: tier.squadCapacityBonus
    })];
  })
));

const DEFENSE_RUNTIME_CACHE = new Map();

export function defenseRuntimeDefinition(defense) {
  const line = defense.isGate ? 'gate' : defense.line ?? defenseLineForType(defense.type);
  const fallback = DEFENSE_DEFINITIONS[defense.type];
  const tier = defense.tier ?? 0;
  const base = DEFENSE_LINES[line]?.[tier] ?? fallback;
  const hp = Math.max(1, Number(defense.maxHp) || Number(base?.hp) || Number(fallback?.hp) || 1);
  const cacheKey = `${defense.type}:${line}:${tier}:${hp}`;
  if (DEFENSE_RUNTIME_CACHE.has(cacheKey)) return DEFENSE_RUNTIME_CACHE.get(cacheKey);
  const runtime = Object.freeze({
    ...fallback,
    ...base,
    hp,
    slowSeconds: base?.duration ?? fallback?.slowSeconds,
    blastRadius: base?.blastRadius ?? fallback?.blastRadius,
    maxTargets: base?.maxTargets ?? fallback?.maxTargets,
    splashMultiplier: base?.splashMultiplier ?? fallback?.splashMultiplier,
    surveyRadius: base?.surveyRadius ?? fallback?.surveyRadius,
    scanInterval: base?.scanInterval ?? fallback?.scanInterval,
    recoveryRate: base?.recoveryRate ?? fallback?.recoveryRate,
    squadCapacityBonus: base?.squadCapacityBonus ?? fallback?.squadCapacityBonus
  });
  DEFENSE_RUNTIME_CACHE.set(cacheKey, runtime);
  return runtime;
}
