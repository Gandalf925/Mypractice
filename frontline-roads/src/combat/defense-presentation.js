import { DEFENSE_DEFINITIONS } from './definitions.js';

const percent = value => `${Math.round(value * 100)}%`;
const seconds = value => `${Number(value).toFixed(value < 10 ? 1 : 0)} sec`;

const TEXT = Object.freeze({
  barrier: {
    role: 'Route control',
    summary: 'A defense facility that blocks road sections and changes enemy movement routes.',
    effect: 'Completely blocks both enemies and allies. Units with another passable route will detour, so it can guide enemies but may also block allied dispatch routes.',
    placement: 'Build one per displayed road section inside construction range. Overlapping or very close sections cannot be stacked.'
  },
  gate: {
    role: 'Selective route control',
    summary: 'A gate that keeps allied passage open while holding enemies back.',
    effect: 'Enemies detour if another route exists; otherwise they attack the gate. Its allied passage mechanism makes it less durable than same-tier walls, and the road opens when destroyed.',
    placement: 'Convert an existing Wall into a Gate from Civ Lv.2 onward, then upgrade it to match the civilization tier.'
  },
  gun: {
    role: 'Single-target attack',
    summary: 'A basic tower that repeatedly attacks the nearest enemy in range.',
    effect: 'Deals steady single-target damage with a short reload. Intersections where enemies stay in range are effective.',
    placement: 'Build at displayed intersections, endpoints, important bends, and supplemental straight-road points inside construction range.'
  },
  mortar: {
    role: 'Area attack',
    summary: 'Targets dense enemy clusters and damages multiple targets in the blast radius.',
    effect: 'Deals full damage to the center target and reduced splash damage nearby. Hit count is capped, so it works well behind walls or slow facilities.',
    placement: 'Build at displayed intersections, endpoints, important bends, and supplemental straight-road points inside construction range.'
  },
  slow: {
    role: 'Slow support',
    summary: 'Slows multiple enemies in range, giving other defenses more time to attack.',
    effect: 'Deals minor damage and slows movement for a time. It is stronger where attack tower ranges overlap.',
    placement: 'Build at displayed intersections, endpoints, important bends, and supplemental straight-road points inside construction range.'
  },
  relay: {
    role: 'Auto repair',
    summary: 'Automatically repairs the most damaged defense in range.',
    effect: 'Repairs consume resources based on the target facility. Place it so frontline defenses are inside range.',
    placement: 'Build at representative support points inside construction range.'
  },
  medical: {
    role: 'Area healing',
    summary: 'Gradually heals allied squads that remain nearby.',
    effect: 'Heals all surviving squads in range, whether returning, waiting, or between engagements. It does not heal while disabled or destroyed.',
    placement: 'Build within major base, simple base, or expedition squad construction range, up to one per construction anchor.'
  },
  fieldBarracks: {
    role: 'Frontline squad slots',
    summary: 'A frontline barracks that increases squad slots available from a simple base by facility tier.',
    effect: 'Only increases the squad limit of the simple base where it is placed. Existing squads remain if it is disabled, but new dispatch using the extra slots is unavailable.',
    placement: 'Build within simple base construction range, one per base.'
  },
  survey: {
    role: 'Road surveying',
    summary: 'An exploration support facility that gradually adds unacquired road chunks around a base to the map.',
    effect: 'Gradually adds road geometry around a base to the map. Exact enemy base, roadside supply, and local event locations are not shown until the player travels there.',
    placement: 'Build within major base, simple base, or expedition squad construction range, up to one per construction anchor.'
  }
});

export function uniqueDefenseDescriptionParagraphs(presentation, notes = []) {
  const seen = new Set();
  return [presentation?.summary, presentation?.effect, presentation?.placement, ...notes]
    .filter(text => typeof text === 'string' && text.trim().length)
    .filter(text => {
      const normalized = text.trim().replace(/\s+/g, ' ');
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function defensePresentation(type, definition = DEFENSE_DEFINITIONS[type]) {
  const text = TEXT[type];
  if (!text || !definition) return null;
  const metrics = [];
  if (type === 'barrier' || type === 'gate') {
    metrics.push(['HP', String(definition.hp)], ['BLOCK', '1 section']);
  } else if (type === 'gun') {
    metrics.push(['RANGE', `${definition.range}m`], ['DAMAGE', String(definition.damage)], ['RELOAD', seconds(definition.cooldown)]);
  } else if (type === 'mortar') {
    metrics.push(['RANGE', `${definition.range}m`], ['DAMAGE', String(definition.damage)], ['BLAST', `${definition.blastRadius}m`], ['TARGETS', String(definition.maxTargets)], ['SPLASH', percent(definition.splashMultiplier)]);
  } else if (type === 'slow') {
    metrics.push(['RANGE', `${definition.range}m`], ['SLOW', percent(definition.slow)], ['TARGETS', String(definition.maxTargets)]);
  } else if (type === 'relay') {
    metrics.push(['RANGE', `${definition.range}m`], ['TOWER', `+${definition.repairTower}`], ['WALL', `+${definition.repairBarrier}`]);
  } else if (type === 'survey') {
    metrics.push(['MAP RADIUS', `${definition.surveyRadius}m`], ['SCAN', `${definition.scanInterval} sec/area`], ['LIMIT', 'one per base']);
  } else if (type === 'medical') {
    metrics.push(['RANGE', `${definition.range}m`], ['HEAL', `${(definition.recoveryRate * 100).toFixed(1)}%MaxHP/ sec`], ['TARGETS', 'all allies in range']);
  } else if (type === 'fieldBarracks') {
    metrics.push(['SQUAD SLOT', `+${definition.squadCapacityBonus}`], ['LIMIT', 'one per simple base']);
  }
  return { ...text, metrics };
}
