export const FRIENDLY_SQUAD_DEFINITIONS = Object.freeze({
  assault: Object.freeze({
    type: 'assault', name: '突撃部隊', shortLabel: 'ASLT', role: '万能型', unlockLevel: 0,
    members: 6, hp: 180, speed: 1.25, enemyDps: 9, baseDps: 7, engagementRange: 18,
    allowedBaseKinds: Object.freeze(['MAJOR', 'FIELD']),
    cost: Object.freeze({ wood: 44, stone: 18, fiber: 32 }),
    description: '通常敵と敵基地の両方へ対応できる基本部隊です。'
  }),
  skirmisher: Object.freeze({
    type: 'skirmisher', name: '遊撃部隊', shortLabel: 'SKRM', role: '軽装迎撃', unlockLevel: 1,
    members: 5, hp: 125, speed: 1.65, enemyDps: 8, baseDps: 2.5, engagementRange: 21,
    allowedBaseKinds: Object.freeze(['MAJOR', 'FIELD']),
    targetPriorityTypes: Object.freeze(['raider', 'scout', 'archer', 'ropeCutter', 'oreCarrier', 'ironCarrier', 'pathfinder', 'marauder', 'flankRider', 'warDrummer', 'squadHunter']),
    lightTargetMultiplier: 1.7, armoredTargetMultiplier: 0.55,
    cost: Object.freeze({ wood: 36, fiber: 42, timber: 4, rope: 2 }),
    description: '高速で軽装敵を処理しますが、重装敵と敵基地には弱い部隊です。'
  }),
  siege: Object.freeze({
    type: 'siege', name: '攻城部隊', shortLabel: 'SIEG', role: '基地破壊', unlockLevel: 2,
    members: 4, hp: 150, speed: 0.72, enemyDps: 4, baseDps: 22, engagementRange: 16,
    allowedBaseKinds: Object.freeze(['MAJOR']),
    cost: Object.freeze({ timber: 8, rope: 4, cutStone: 8, charcoal: 6 }),
    description: '道中の敵には弱い一方、敵基地へ非常に高い損害を与えます。'
  }),
  heavy: Object.freeze({
    type: 'heavy', name: '重装部隊', shortLabel: 'HVY', role: '味方防護', unlockLevel: 3,
    members: 6, hp: 360, speed: 0.70, enemyDps: 8, baseDps: 4.5, engagementRange: 18,
    allowedBaseKinds: Object.freeze(['MAJOR']), guardRange: 24, guardShare: 0.45,
    cost: Object.freeze({ timber: 10, rope: 3, cutStone: 10, bronzeIngot: 8 }),
    description: '近くの味方部隊が受ける損害の一部を肩代わりする護衛部隊です。'
  }),
  expedition: Object.freeze({
    type: 'expedition', name: '遠征部隊', shortLabel: 'EXPD', role: '長距離作戦', unlockLevel: 4,
    members: 7, hp: 290, speed: 1.15, enemyDps: 14, baseDps: 12, engagementRange: 20,
    allowedBaseKinds: Object.freeze(['MAJOR']), nonCombatRecoveryPerSecond: 1.4, recoveryDelaySeconds: 10,
    cost: Object.freeze({ timber: 14, rope: 5, bronzeIngot: 4, wroughtIron: 10 }),
    description: '高い総合戦闘力を持ち、戦闘から離れると少量ずつ自己回復します。'
  }),
  retrieval: Object.freeze({
    type: 'retrieval', name: '回収部隊', shortLabel: 'RECV', role: '遠隔回収', unlockLevel: 0,
    missionKind: 'RECOVERY', members: 3, hp: 55, speed: 1.05, enemyDps: 1.2, baseDps: 0, engagementRange: 12,
    allowedBaseKinds: Object.freeze(['MAJOR', 'FIELD']), collectionSeconds: 8,
    cost: Object.freeze({ wood: 18, fiber: 20 }),
    description: '特殊アイテムを遠隔回収できますが、戦闘力と耐久は非常に低い部隊です。'
  })
});

export const FRIENDLY_SQUAD_TYPES = Object.freeze(Object.keys(FRIENDLY_SQUAD_DEFINITIONS));

const LIGHT_ENEMY_TYPES = new Set(['scout', 'raider', 'archer', 'ropeCutter', 'oreCarrier', 'ironCarrier', 'pathfinder', 'marauder', 'flankRider', 'warDrummer', 'squadHunter']);
const ARMORED_ENEMY_TYPES = new Set(['shield', 'heavy', 'siegeBreaker', 'sapper', 'bronzeShield', 'siegeCaptain', 'ironclad', 'heavySiege', 'commander', 'ironSaboteur', 'bodyguard']);

export function friendlySquadDefinition(type) {
  return FRIENDLY_SQUAD_DEFINITIONS[type] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
}

export function friendlySquadUnlocked(state, type) {
  const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
  return Boolean(definition && (state.civilization?.level ?? 0) >= definition.unlockLevel);
}

export function friendlySquadEnemyDamage(definition, enemyType) {
  let multiplier = 1;
  if (LIGHT_ENEMY_TYPES.has(enemyType)) multiplier *= definition.lightTargetMultiplier ?? 1;
  if (ARMORED_ENEMY_TYPES.has(enemyType)) multiplier *= definition.armoredTargetMultiplier ?? 1;
  return definition.enemyDps * multiplier;
}
