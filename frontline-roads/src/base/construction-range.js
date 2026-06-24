export const MAJOR_BASE_BUILD_RANGE_METERS = 85;
export const FIELD_BASE_BUILD_RANGE_METERS = 50;
export const PLAYER_BUILD_RANGE_METERS = 85;

const MAX_RANGE_LEVEL = 12;

export function normalizedConstructionLevel(level) {
  return Math.max(0, Math.min(MAX_RANGE_LEVEL, Math.floor(Number(level) || 0)));
}

export function constructionRangeMultiplier(level) {
  return 2 ** normalizedConstructionLevel(level);
}

export function majorBaseBuildRange(level) {
  return MAJOR_BASE_BUILD_RANGE_METERS * constructionRangeMultiplier(level);
}

export function fieldBaseBuildRange(level) {
  return FIELD_BASE_BUILD_RANGE_METERS * constructionRangeMultiplier(level);
}

export function constructionRangeForAnchorKind(kind, level) {
  if (kind === 'MAJOR') return majorBaseBuildRange(level);
  if (kind === 'FIELD') return fieldBaseBuildRange(level);
  if (kind === 'PLAYER') return PLAYER_BUILD_RANGE_METERS;
  return 0;
}

export function constructionRangeSummary(level) {
  return {
    level: normalizedConstructionLevel(level),
    multiplier: constructionRangeMultiplier(level),
    major: majorBaseBuildRange(level),
    field: fieldBaseBuildRange(level),
    player: PLAYER_BUILD_RANGE_METERS
  };
}
