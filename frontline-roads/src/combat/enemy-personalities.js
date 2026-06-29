export const ENEMY_PERSONALITIES = Object.freeze({
  direct: Object.freeze({
    key: 'direct', label: 'Direct', routeMode: 'DIRECT',
    description: 'Basic behavior that prioritizes the shortest route and reaching the city.'
  }),
  evasive: Object.freeze({
    key: 'evasive', label: 'Evasive', routeMode: 'EVASIVE', avoidTowers: true, avoidCongestion: true,
    description: 'Avoids defense towers and congestion, choosing comparatively safer roads.'
  }),
  flanker: Object.freeze({
    key: 'flanker', label: 'Flanking', routeMode: 'FLANK', avoidTowers: true, avoidCongestion: true,
    prefersDetour: true, flankPreference: 3.2, flankWidthMeters: 130,
    maxDetourRatio: 1.65, minimumLateralMeters: 32,
    description: 'Leaves the shortest route and chooses roads that can wrap around the side of the defense line.'
  }),
  breacher: Object.freeze({
    key: 'breacher', label: 'Breacher', routeMode: 'BREACH',
    description: 'Avoids detours and pushes through short routes by destroying walls.'
  }),
  saboteur: Object.freeze({
    key: 'saboteur', label: 'Saboteur', routeMode: 'SABOTAGE', avoidTowers: true,
    description: 'Does not head straight for the city; prioritizes destroying support and firepower facilities.'
  }),
  marauder: Object.freeze({
    key: 'marauder', label: 'Marauder', routeMode: 'RAID', avoidCongestion: true,
    description: 'Targets simple bases and frontline support facilities instead of the city.'
  }),
  hunter: Object.freeze({
    key: 'hunter', label: 'Squad Hunter', routeMode: 'HUNT', avoidCongestion: true,
    description: 'Tracks friendly squads on roads and pursues their destinations.'
  }),
  support: Object.freeze({
    key: 'support', label: 'Support Escort', routeMode: 'SUPPORT',
    description: 'Moves with the main force while strengthening nearby enemy squads.'
  }),
  guardian: Object.freeze({
    key: 'guardian', label: 'Guardian', routeMode: 'GUARD',
    description: 'Protects nearby enemies with high durability and defensive effects.'
  }),
  commander: Object.freeze({
    key: 'commander', label: 'Commander', routeMode: 'COMMAND',
    description: 'Accelerates nearby troops and increases pressure from the whole attack group.'
  })
});

export const ENEMY_WAVE_DOCTRINES = Object.freeze({
  frontal: Object.freeze({ key: 'frontal', label: 'Frontal Attack', preferredPersonalities: ['direct', 'guardian', 'breacher'] }),
  flank: Object.freeze({ key: 'flank', label: 'Flank Attack', preferredPersonalities: ['flanker', 'evasive'] }),
  raid: Object.freeze({ key: 'raid', label: 'Base Raid', preferredPersonalities: ['marauder', 'saboteur'] }),
  breach: Object.freeze({ key: 'breach', label: 'Siege Breach', preferredPersonalities: ['breacher', 'commander'] }),
  support: Object.freeze({ key: 'support', label: 'Coordinated Advance', preferredPersonalities: ['support', 'commander', 'guardian'] }),
  hunt: Object.freeze({ key: 'hunt', label: 'Squad Hunt', preferredPersonalities: ['hunter', 'flanker'] }),
  guard: Object.freeze({ key: 'guard', label: 'Base Guard', preferredPersonalities: ['guardian', 'direct', 'breacher'] })
});

export function enemyBehaviorForDefinition(definition = {}, doctrineKey = null) {
  const personalityKey = definition.personality ?? 'direct';
  const profile = ENEMY_PERSONALITIES[personalityKey] ?? ENEMY_PERSONALITIES.direct;
  const doctrine = doctrineKey ? waveDoctrineDefinition(doctrineKey) : null;
  const flankDoctrine = doctrine?.key === 'flank';
  return {
    ...profile,
    personalityKey: profile.key,
    personalityLabel: profile.label,
    doctrineKey: doctrine?.key ?? null,
    targetMode: doctrine?.key === 'raid' ? 'BASES' : doctrine?.key === 'hunt' ? 'SQUADS' : 'DEFAULT',
    avoidTowers: flankDoctrine || (definition.avoidTowers ?? profile.avoidTowers ?? false),
    avoidCongestion: flankDoctrine || (definition.avoidCongestion ?? profile.avoidCongestion ?? false),
    prefersDetour: flankDoctrine || (definition.prefersDetour ?? profile.prefersDetour ?? false),
    flankPreference: Math.max(Number(definition.flankPreference ?? profile.flankPreference ?? 0), flankDoctrine ? 3.2 : 0),
    flankWidthMeters: Math.max(Number(definition.flankWidthMeters ?? profile.flankWidthMeters ?? 120), flankDoctrine ? 130 : 0),
    maxDetourRatio: Math.max(Number(definition.maxDetourRatio ?? profile.maxDetourRatio ?? 1), flankDoctrine ? 1.6 : 1),
    minimumLateralMeters: Math.max(Number(definition.minimumLateralMeters ?? profile.minimumLateralMeters ?? 0), flankDoctrine ? 30 : 0),
    barrierCostMultiplier: doctrine?.key === 'breach' ? 0.42 : 1,
    routeMode: flankDoctrine ? 'FLANK' : doctrine?.key === 'breach' ? 'BREACH' : definition.routeMode ?? profile.routeMode ?? 'DIRECT',
    description: definition.personalityDescription ?? profile.description
  };
}

export function waveDoctrineDefinition(key) {
  return ENEMY_WAVE_DOCTRINES[key] ?? ENEMY_WAVE_DOCTRINES.frontal;
}
