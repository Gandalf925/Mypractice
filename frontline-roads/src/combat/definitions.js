import { DEFENSE_LINES, ENEMY_DROPS, defenseLineForType, defenseTierDefinition } from '../civilization/data.js';

export const BUILD_RANGE_METERS = 85;
export const ENEMY_BASE_CAPTURE_RANGE_METERS = 50;
export const MAX_ENEMIES = 220;

export const ENEMY_DEFINITIONS = Object.freeze({
  infantry: {
    name: '歩兵', hp: 50, speed: 1.2, cityDamage: 8, barrierDps: 2, radius: 4.5, drops: ENEMY_DROPS.infantry,
    barrierStrategy: 'balanced', barrierCostFactor: 1.05, routeLabel: '状況判断', objectiveLabel: '都市'
  },
  scout: {
    name: '斥候', hp: 25, speed: 1.75, cityDamage: 4, barrierDps: 1, radius: 3.7, drops: ENEMY_DROPS.scout,
    avoidTowers: true, barrierStrategy: 'avoid', barrierCostFactor: 2.8, routeLabel: '迂回優先', objectiveLabel: '都市'
  },
  shield: {
    name: '盾兵', hp: 100, speed: 0.95, cityDamage: 8, barrierDps: 2, radius: 5.4, drops: ENEMY_DROPS.shield, shieldAura: 0.30,
    barrierStrategy: 'balanced', barrierCostFactor: 0.9, routeLabel: '突破寄り', objectiveLabel: '都市'
  },
  engineer: {
    name: '工兵', hp: 60, speed: 1.0, cityDamage: 5, barrierDps: 8, radius: 4.7, drops: ENEMY_DROPS.engineer,
    barrierStrategy: 'breach', barrierCostFactor: 0.42, routeLabel: '防壁破壊', objectiveLabel: '都市'
  },
  heavy: {
    name: '重装兵', hp: 180, speed: 0.7, cityDamage: 20, barrierDps: 6, radius: 6.5, drops: ENEMY_DROPS.heavy, slowResistance: 0.5,
    barrierStrategy: 'breach', barrierCostFactor: 0.78, routeLabel: '正面突破', objectiveLabel: '都市'
  },
  raider: {
    name: '破壊工作員', hp: 55, speed: 1.3, cityDamage: 6, barrierDps: 3, radius: 4.9, drops: ENEMY_DROPS.raider,
    barrierStrategy: 'avoid', barrierCostFactor: 2.0, routeLabel: '潜入迂回', objectiveLabel: '支援・火力施設',
    targetPriorities: ['relay', 'mortar', 'gun', 'slow'], facilityDps: 12, stunSeconds: 8,
    attackMessage: '破壊工作員が防衛施設を停止させました。'
  },
  archer: {
    name: '弓兵', hp: 45, speed: 1.05, cityDamage: 7, barrierDps: 1, radius: 4, drops: { wood: 2, fiber: 4 }, generation: 1,
    avoidTowers: true, barrierStrategy: 'avoid', barrierCostFactor: 2.4, routeLabel: '危険回避', objectiveLabel: '都市'
  },
  ropeCutter: {
    name: '縄切り兵', hp: 65, speed: 1.1, cityDamage: 6, barrierDps: 5, radius: 4.5, drops: { wood: 2, stone: 1, fiber: 3 }, generation: 1,
    barrierStrategy: 'balanced', barrierCostFactor: 0.9, routeLabel: '妨害排除', objectiveLabel: '減速・修復施設',
    targetPriorities: ['slow', 'relay'], facilityDps: 10,
    attackMessage: '縄切り兵が妨害施設を破壊しています。'
  },
  miner: {
    name: '採掘兵', hp: 85, speed: 0.9, cityDamage: 8, barrierDps: 4, radius: 5, drops: { stone: 3, copperOre: 1 }, generation: 2,
    barrierStrategy: 'balanced', barrierCostFactor: 1.0, routeLabel: '状況判断', objectiveLabel: '都市'
  },
  siegeBreaker: {
    name: '破城兵', hp: 145, speed: 0.72, cityDamage: 18, barrierDps: 12, settlementDamage: 18, radius: 6, drops: { stone: 5, charcoal: 1 }, generation: 2,
    barrierStrategy: 'breach', barrierCostFactor: 0.3, routeLabel: '防壁最優先', objectiveLabel: '都市'
  },
  oreCarrier: {
    name: '鉱石運搬兵', hp: 70, speed: 1.2, cityDamage: 5, barrierDps: 2, radius: 4.8, drops: { stone: 2, copperOre: 1, tinOre: 1 }, generation: 2,
    barrierStrategy: 'avoid', barrierCostFactor: 1.8, routeLabel: '迂回優先', objectiveLabel: '都市'
  },
  bronzeShield: {
    name: '青銅盾兵', hp: 170, speed: 0.78, cityDamage: 14, barrierDps: 4, radius: 6, drops: { stone: 4, bronzeIngot: 1 }, generation: 3, shieldAura: 0.35,
    barrierStrategy: 'balanced', barrierCostFactor: 0.72, routeLabel: '突破寄り', objectiveLabel: '都市'
  },
  siegeCaptain: {
    name: '攻城隊長', hp: 270, speed: 0.62, cityDamage: 30, barrierDps: 16, settlementDamage: 24, radius: 7, drops: { charcoal: 3, bronzeIngot: 2 }, generation: 3, slowResistance: 0.35,
    barrierStrategy: 'breach', barrierCostFactor: 0.24, routeLabel: '攻城指揮', objectiveLabel: '重火力施設',
    targetPriorities: ['mortar', 'gun'], facilityDps: 16,
    attackMessage: '攻城隊長が火力施設へ攻撃を集中しています。'
  },
  ironCarrier: {
    name: '鉄鉱運搬兵', hp: 115, speed: 1.0, cityDamage: 9, barrierDps: 4, radius: 5.2, drops: { stone: 3, ironOre: 2 }, generation: 3,
    barrierStrategy: 'avoid', barrierCostFactor: 1.55, routeLabel: '迂回優先', objectiveLabel: '都市'
  },
  ironclad: {
    name: '鉄甲兵', hp: 330, speed: 0.55, cityDamage: 36, barrierDps: 10, radius: 7.2, drops: { ironOre: 3, wroughtIron: 1 }, generation: 4, slowResistance: 0.65,
    barrierStrategy: 'breach', barrierCostFactor: 0.5, routeLabel: '正面突破', objectiveLabel: '都市'
  },
  heavySiege: {
    name: '重攻城兵', hp: 460, speed: 0.42, cityDamage: 50, barrierDps: 24, settlementDamage: 36, radius: 8, drops: { ironOre: 4, wroughtIron: 1 }, generation: 4, slowResistance: 0.5,
    barrierStrategy: 'breach', barrierCostFactor: 0.16, routeLabel: '防壁粉砕', objectiveLabel: '都市'
  },
  commander: {
    name: '指揮官', hp: 310, speed: 0.75, cityDamage: 25, barrierDps: 8, radius: 7, drops: { bronzeIngot: 2, wroughtIron: 2 }, generation: 4, commanderAura: 0.18,
    barrierStrategy: 'balanced', barrierCostFactor: 0.68, routeLabel: '部隊誘導', objectiveLabel: '都市'
  }
});

export const ENEMY_GENERATIONS = Object.freeze({
  0: ['infantry', 'scout', 'shield', 'engineer', 'heavy', 'raider'],
  1: ['archer', 'ropeCutter'],
  2: ['miner', 'siegeBreaker', 'oreCarrier'],
  3: ['bronzeShield', 'siegeCaptain', 'ironCarrier'],
  4: ['ironclad', 'heavySiege', 'commander']
});

export const ENEMY_BASE_DEFINITIONS = Object.freeze({
  barracks: {
    name: '前哨基地', icon: '⚑', interval: 180, firstDelay: 90, captureDuration: 45, range: [160, 240], reward: { wood: 40, stone: 20, fiber: 20 },
    waves: { 1: ['infantry', 'infantry', 'scout'], 2: ['infantry', 'infantry', 'infantry', 'shield'], 3: ['infantry', 'infantry', 'infantry', 'infantry', 'scout', 'shield'] }
  },
  engineer: {
    name: '工兵拠点', icon: '⚒', interval: 300, firstDelay: 150, captureDuration: 60, range: [260, 380], reward: { wood: 45, stone: 45, fiber: 20 },
    waves: { 1: ['engineer', 'infantry', 'infantry'], 2: ['engineer', 'shield', 'infantry', 'infantry'], 3: ['engineer', 'engineer', 'shield', 'infantry', 'infantry'] }
  },
  raider: {
    name: '工作員拠点', icon: '✦', interval: 360, firstDelay: 180, captureDuration: 60, range: [260, 420], reward: { wood: 40, stone: 20, fiber: 70 },
    waves: { 1: ['raider', 'scout'], 2: ['raider', 'raider', 'scout'], 3: ['raider', 'raider', 'engineer', 'scout'] }
  },
  copperCamp: {
    name: '銅鉱野営地', icon: 'Cu', interval: 420, firstDelay: 180, captureDuration: 70, range: [300, 650], reward: { copperOre: 24, stone: 20 }, isResourceBase: true,
    waves: { 1: ['miner', 'oreCarrier'], 2: ['miner', 'miner', 'oreCarrier', 'shield'], 3: ['siegeBreaker', 'miner', 'oreCarrier', 'oreCarrier'] }
  },
  tinCamp: {
    name: '錫鉱野営地', icon: 'Sn', interval: 480, firstDelay: 220, captureDuration: 75, range: [350, 700], reward: { tinOre: 20, stone: 20 }, isResourceBase: true,
    waves: { 1: ['miner', 'oreCarrier'], 2: ['miner', 'oreCarrier', 'ropeCutter'], 3: ['siegeBreaker', 'miner', 'oreCarrier', 'ropeCutter'] }
  },
  ironCamp: {
    name: '鉄鉱野営地', icon: 'Fe', interval: 540, firstDelay: 240, captureDuration: 85, range: [400, 800], reward: { ironOre: 24, stone: 30 }, isResourceBase: true,
    waves: { 1: ['ironCarrier', 'bronzeShield'], 2: ['ironCarrier', 'ironCarrier', 'bronzeShield'], 3: ['siegeCaptain', 'ironCarrier', 'bronzeShield'] }
  },
  bronzeCamp: {
    name: '青銅軍営', icon: 'Bz', interval: 600, firstDelay: 280, captureDuration: 90, range: [450, 850], reward: { bronzeIngot: 12, charcoal: 20 }, isResourceBase: true,
    waves: { 1: ['bronzeShield', 'archer'], 2: ['bronzeShield', 'bronzeShield', 'siegeBreaker'], 3: ['siegeCaptain', 'bronzeShield', 'archer'] }
  },
  siegeWorks: {
    name: '攻城兵器工房', icon: '⚒', interval: 720, firstDelay: 320, captureDuration: 100, range: [500, 950], reward: { wroughtIron: 8, charcoal: 24 }, isResourceBase: true,
    waves: { 1: ['siegeBreaker', 'miner'], 2: ['siegeBreaker', 'bronzeShield', 'ropeCutter'], 3: ['siegeCaptain', 'siegeBreaker', 'bronzeShield'] }
  },
  motor: {
    name: '装甲工場', icon: '⬢', interval: 420, firstDelay: 240, captureDuration: 75, range: [420, 550], reward: { wood: 30, stone: 100, fiber: 30 },
    waves: { 1: ['heavy', 'infantry', 'infantry'], 2: ['heavy', 'shield', 'infantry', 'infantry'], 3: ['heavy', 'heavy', 'shield', 'scout'] }
  }
});

const ICONS = Object.freeze({ barrier: '▰', gun: '⌁', mortar: '◉', slow: '◌', relay: '⚒' });
const KINDS = Object.freeze({ barrier: 'barrier', gun: 'tower', mortar: 'tower', slow: 'tower', relay: 'tower' });

export const DEFENSE_DEFINITIONS = Object.freeze(Object.fromEntries(
  ['barrier', 'gun', 'mortar', 'slow', 'relay'].map(type => {
    const tier = defenseTierDefinition(type, 0);
    return [type, Object.freeze({
      type,
      line: defenseLineForType(type),
      name: tier.name,
      icon: ICONS[type],
      kind: KINDS[type],
      cost: tier.cost,
      hp: tier.hp,
      range: tier.range,
      damage: tier.damage,
      cooldown: tier.cooldown,
      blastRadius: tier.blastRadius,
      maxTargets: tier.maxTargets,
      slowSeconds: tier.duration,
      slow: tier.slow,
      repairTower: tier.repairTower,
      repairBarrier: tier.repairBarrier
    })];
  })
));

export function defenseRuntimeDefinition(defense) {
  const line = defense.isGate ? 'gate' : defense.line ?? defenseLineForType(defense.type);
  const base = DEFENSE_LINES[line]?.[defense.tier ?? 0] ?? DEFENSE_DEFINITIONS[defense.type];
  return {
    ...DEFENSE_DEFINITIONS[defense.type],
    ...base,
    slowSeconds: base.duration ?? DEFENSE_DEFINITIONS[defense.type]?.slowSeconds,
    blastRadius: base.blastRadius ?? DEFENSE_DEFINITIONS[defense.type]?.blastRadius,
    maxTargets: base.maxTargets ?? DEFENSE_DEFINITIONS[defense.type]?.maxTargets
  };
}
