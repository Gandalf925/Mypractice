export const ROAD_PRIORITY = Object.freeze({
  living_street: 2,
  residential: 3,
  unclassified: 3,
  tertiary_link: 4,
  tertiary: 4,
  secondary_link: 5,
  secondary: 5,
  primary_link: 6,
  primary: 6
});

export const ALLOWED_HIGHWAYS = new Set(Object.keys(ROAD_PRIORITY));
export const MAJOR_HIGHWAYS = new Set([
  'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'
]);
export const EXCLUDED_SERVICE = new Set(['driveway', 'parking_aisle', 'drive-through', 'emergency_access', 'alley']);
