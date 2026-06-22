export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const deepClone = value => value == null ? value : structuredClone(value);
export const now = () => Date.now();

export function formatMeters(meters) {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

export function stableId(prefix, ...parts) {
  const text = parts.join('|');
  let value = 7;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) % 2147483647;
  }
  return `${prefix}_${value.toString(36)}`;
}
