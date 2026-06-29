export const FRIENDLY_SQUAD_DEFINITIONS = Object.freeze({
  assault: Object.freeze({
    type: 'assault', name: 'Assault Squad', shortLabel: 'ASLT', role: 'All-purpose', unlockLevel: 0,
    members: 6, hp: 180, speed: 1.25, enemyDps: 9, baseDps: 7, engagementRange: 18,
    allowedBaseKinds: Object.freeze(['MAJOR', 'FIELD']),
    cost: Object.freeze({ wood: 44, stone: 18, fiber: 32 }),
    description: 'A basic squad that can fight both normal enemies and enemy bases.'
  }),
  skirmisher: Object.freeze({
    type: 'skirmisher', name: 'Skirmisher Squad', shortLabel: 'SKRM', role: 'Light interception', unlockLevel: 1,
    members: 5, hp: 125, speed: 1.65, enemyDps: 8, baseDps: 2.5, engagementRange: 21,
    allowedBaseKinds: Object.freeze(['MAJOR', 'FIELD']),
    targetPriorityTypes: Object.freeze(['raider', 'scout', 'archer', 'ropeCutter', 'oreCarrier', 'ironCarrier', 'pathfinder', 'marauder', 'flankRider', 'warDrummer', 'squadHunter', 'pursuitCavalry', 'mobileLancer', 'roadHunter']),
    lightTargetMultiplier: 1.7, armoredTargetMultiplier: 0.55,
    cost: Object.freeze({ wood: 36, fiber: 42, timber: 4, rope: 2 }),
    description: 'Fast squad for clearing light enemies, but weak against heavy enemies and bases.'
  }),
  siege: Object.freeze({
    type: 'siege', name: 'Siege Squad', shortLabel: 'SIEG', role: 'Base demolition', unlockLevel: 2,
    members: 4, hp: 150, speed: 0.72, enemyDps: 4, baseDps: 22, engagementRange: 16,
    allowedBaseKinds: Object.freeze(['MAJOR']),
    cost: Object.freeze({ timber: 8, rope: 4, cutStone: 8, charcoal: 6 }),
    description: 'Deals very high damage to enemy bases, but needs escort in coordinated dispatch because it is weak on the road.'
  }),
  heavy: Object.freeze({
    type: 'heavy', name: 'Heavy Squad', shortLabel: 'HVY', role: 'Ally protection', unlockLevel: 3,
    members: 6, hp: 360, speed: 0.70, enemyDps: 8, baseDps: 4.5, engagementRange: 18,
    allowedBaseKinds: Object.freeze(['MAJOR']), guardRange: 24, guardShare: 0.45,
    cost: Object.freeze({ timber: 10, rope: 3, cutStone: 10, bronzeIngot: 8 }),
    description: 'An escort squad that absorbs part of the damage taken by nearby allied squads.'
  }),
  expedition: Object.freeze({
    type: 'expedition', name: 'Expedition Squad', shortLabel: 'EXPD', role: 'Long-range operations', unlockLevel: 4,
    members: 7, hp: 290, speed: 1.15, enemyDps: 14, baseDps: 12, engagementRange: 20,
    allowedBaseKinds: Object.freeze(['MAJOR']), nonCombatRecoveryPerSecond: 1.4, recoveryDelaySeconds: 10,
    cost: Object.freeze({ timber: 14, rope: 5, bronzeIngot: 4, wroughtIron: 10 }),
    description: 'A strong all-round squad that slowly self-recovers outside combat and provides a 120 m mobile construction range around its current position.'
  }),
  engineer: Object.freeze({
    type: 'engineer', name: 'Engineer Squad', shortLabel: 'ENGR', role: 'Demolition / Field repair', unlockLevel: 5,
    members: 5, hp: 310, speed: 0.95, enemyDps: 11, baseDps: 18, engagementRange: 18,
    allowedBaseKinds: Object.freeze(['MAJOR']), repairRange: 42, repairAmount: 120,
    cost: Object.freeze({ timber: 14, rope: 6, cutStone: 12, steel: 8 }),
    description: 'Attacks enemy facilities and manually repairs frontline defenses. Repair costs depend on the target facility.'
  }),
  artillery: Object.freeze({
    type: 'artillery', name: 'Artillery Squad', shortLabel: 'ARTY', role: 'Long-range area attack', unlockLevel: 6,
    members: 4, hp: 220, speed: 0.62, enemyDps: 20, baseDps: 15, engagementRange: 42,
    allowedBaseKinds: Object.freeze(['MAJOR']), splashRadius: 18, splashMultiplier: 0.55, maxSplashTargets: 5,
    cost: Object.freeze({ timber: 18, cutStone: 16, steel: 12, mechanism: 6 }),
    description: 'Attacks clustered enemies from long range. Low speed and durability make escort important.'
  }),
  command: Object.freeze({
    type: 'command', name: 'Command Squad', shortLabel: 'CMD', role: 'Squad coordination support', unlockLevel: 7,
    members: 6, hp: 380, speed: 1.0, enemyDps: 13, baseDps: 10, engagementRange: 22,
    allowedBaseKinds: Object.freeze(['MAJOR']), commandAura: 0.20, speedAura: 0.08, auraRange: 45, maxPerBase: 1,
    cost: Object.freeze({ timber: 20, steel: 16, mechanism: 10 }),
    description: 'A coordination squad that boosts nearby allied attack and speed. Each major base can operate only one at a time.'
  }),
  retrieval: Object.freeze({
    type: 'retrieval', name: 'Recovery Squad', shortLabel: 'RECV', role: 'Remote recovery', unlockLevel: 0,
    missionKind: 'RECOVERY', members: 3, hp: 55, speed: 1.05, enemyDps: 1.2, baseDps: 0, engagementRange: 12,
    allowedBaseKinds: Object.freeze(['MAJOR', 'FIELD']), collectionSeconds: 8, nonCombatUnit: true,
    cost: Object.freeze({ wood: 18, fiber: 20 }),
    description: 'Can remotely recover special items, but has very low combat power and durability.'
  })
});

export const FRIENDLY_SQUAD_TYPES = Object.freeze(Object.keys(FRIENDLY_SQUAD_DEFINITIONS));

export const FRIENDLY_EQUIPMENT_SCALING = Object.freeze([
  Object.freeze({ hp: 1, damage: 1, speed: 1 }),
  Object.freeze({ hp: 1, damage: 1, speed: 1 }),
  Object.freeze({ hp: 1, damage: 1, speed: 1 }),
  Object.freeze({ hp: 1, damage: 1, speed: 1 }),
  Object.freeze({ hp: 1, damage: 1, speed: 1 }),
  Object.freeze({ hp: 1.15, damage: 1.12, speed: 1 }),
  Object.freeze({ hp: 1.28, damage: 1.25, speed: 1.03 }),
  Object.freeze({ hp: 1.42, damage: 1.38, speed: 1.05 })
]);

export const FRIENDLY_SQUAD_MAX_LEVEL = 5;
export const FRIENDLY_SQUAD_XP_PER_LEVEL = Object.freeze([0, 45, 140, 310, 560]);

export function friendlySquadLevel(squad) {
  return Math.max(1, Math.min(FRIENDLY_SQUAD_MAX_LEVEL, Math.floor(Number(squad?.unitLevel) || 1)));
}

export function friendlySquadXpForNextLevel(level) {
  const normalized = Math.max(1, Math.min(FRIENDLY_SQUAD_MAX_LEVEL, Math.floor(Number(level) || 1)));
  return FRIENDLY_SQUAD_XP_PER_LEVEL[normalized] ?? Infinity;
}

export function friendlySquadLevelScaling(type, level) {
  const normalized = friendlySquadLevel({ unitLevel: level });
  const steps = Math.max(0, normalized - 1);
  const base = { hp: 1 + steps * 0.11, damage: 1 + steps * 0.10, speed: 1 + steps * 0.012, incomingDamage: 1 - steps * 0.045 };
  if (type === 'skirmisher') return { hp: 1 + steps * 0.15, damage: 1 + steps * 0.13, speed: 1 + steps * 0.018, incomingDamage: 1 - steps * 0.065 };
  if (type === 'retrieval') return { hp: 1 + steps * 0.13, damage: 1, speed: 1 + steps * 0.015, incomingDamage: 1 - steps * 0.05 };
  if (type === 'siege') return { ...base, hp: 1 + steps * 0.12, damage: 1 + steps * 0.12 };
  if (type === 'heavy') return { ...base, hp: 1 + steps * 0.14, incomingDamage: 1 - steps * 0.06 };
  return base;
}

const LIGHT_ENEMY_TYPES = new Set(['scout', 'raider', 'archer', 'ropeCutter', 'oreCarrier', 'ironCarrier', 'pathfinder', 'marauder', 'flankRider', 'warDrummer', 'squadHunter', 'pursuitCavalry', 'mobileLancer', 'roadHunter']);
const ARMORED_ENEMY_TYPES = new Set(['shield', 'heavy', 'siegeBreaker', 'sapper', 'bronzeShield', 'siegeCaptain', 'ironclad', 'heavySiege', 'commander', 'ironSaboteur', 'bodyguard', 'steelGuard', 'demolitionEngineer', 'steelCaptain', 'mechanicalSiege', 'armoredAgent', 'machineCommander', 'royalGuard', 'fortressBreaker', 'royalCommander']);

export function friendlySquadDefinition(type) {
  return FRIENDLY_SQUAD_DEFINITIONS[type] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
}

export function friendlyEquipmentScaling(level) {
  const index = Math.max(0, Math.min(FRIENDLY_EQUIPMENT_SCALING.length - 1, Math.floor(Number(level) || 0)));
  return FRIENDLY_EQUIPMENT_SCALING[index];
}

const RUNTIME_DEFINITION_CACHE = new Map();

export function friendlySquadRuntimeDefinition(state, type, squad = null) {
  const civilizationLevel = Math.max(0, Math.min(FRIENDLY_EQUIPMENT_SCALING.length - 1, Math.floor(Number(state?.civilization?.level) || 0)));
  const base = friendlySquadDefinition(type);
  const unitLevel = friendlySquadLevel(squad);
  const cacheKey = `${base.type}:${civilizationLevel}:${unitLevel}`;
  if (RUNTIME_DEFINITION_CACHE.has(cacheKey)) return RUNTIME_DEFINITION_CACHE.get(cacheKey);
  const scaling = friendlyEquipmentScaling(civilizationLevel);
  const levelScaling = friendlySquadLevelScaling(base.type, unitLevel);
  const retrieval = base.nonCombatUnit;
  const hpMultiplier = (retrieval ? 1 + (scaling.hp - 1) * 0.75 : scaling.hp) * levelScaling.hp;
  const damageMultiplier = (retrieval ? 1 : scaling.damage) * levelScaling.damage;
  const runtime = Object.freeze({
    ...base,
    unitLevel,
    hp: Math.round(base.hp * hpMultiplier),
    speed: base.speed * scaling.speed * levelScaling.speed,
    enemyDps: base.enemyDps * damageMultiplier,
    baseDps: base.baseDps * damageMultiplier,
    incomingDamageMultiplier: Math.max(0.55, levelScaling.incomingDamage)
  });
  RUNTIME_DEFINITION_CACHE.set(cacheKey, runtime);
  return runtime;
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
