import { MAJOR_HIGHWAYS } from './road-constants.js';
import { xyToLatLon } from '../location/location-privacy.js';

class DisjointSet {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = Array(size).fill(0);
  }
  find(index) {
    if (this.parent[index] !== index) this.parent[index] = this.find(this.parent[index]);
    return this.parent[index];
  }
  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA] += 1;
  }
}

function canConnect(first, second) {
  const a = first.segment;
  const b = second.segment;
  if (a.layer !== b.layer) return false;
  if (a.bridge !== b.bridge || a.tunnel !== b.tunnel) return false;
  if (first.sourceNodeId && second.sourceNodeId && first.sourceNodeId === second.sourceNodeId) return true;
  return true;
}

export function clusterSegmentEndpoints(segments, center) {
  const points = [];
  for (const segment of segments) {
    segment.pointA = points.length;
    points.push({ x: segment.a.x, y: segment.a.y, segment, sourceNodeId: segment.sourceNodeA });
    segment.pointB = points.length;
    points.push({ x: segment.b.x, y: segment.b.y, segment, sourceNodeId: segment.sourceNodeB });
  }

  const sets = new DisjointSet(points.length);
  const cellSize = 14;
  const buckets = new Map();

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const cx = Math.floor(point.x / cellSize);
    const cy = Math.floor(point.y / cellSize);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const otherIndex of buckets.get(`${cx + dx},${cy + dy}`) ?? []) {
          const other = points[otherIndex];
          if (point.segment === other.segment || !canConnect(point, other)) continue;
          const sharedOsmNode = point.sourceNodeId && other.sourceNodeId && point.sourceNodeId === other.sourceNodeId;
          const gap = Math.hypot(point.x - other.x, point.y - other.y);
          const sameNamed = point.segment.name && point.segment.name === other.segment.name;
          const bothMajor = MAJOR_HIGHWAYS.has(point.segment.highway) && MAJOR_HIGHWAYS.has(other.segment.highway);
          const threshold = sharedOsmNode ? 24 : sameNamed ? 16 : bothMajor ? 13 : 8;
          if (gap <= threshold) sets.union(index, otherIndex);
        }
      }
    }
    const key = `${cx},${cy}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  }

  const groups = new Map();
  for (let index = 0; index < points.length; index += 1) {
    const root = sets.find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(points[index]);
  }

  const nodes = [];
  const nodeByRoot = new Map();
  for (const [root, group] of groups) {
    const x = group.reduce((sum, point) => sum + point.x, 0) / group.length;
    const y = group.reduce((sum, point) => sum + point.y, 0) / group.length;
    const location = xyToLatLon(x, y, center);
    const node = { id: `node_${nodes.length}`, x, y, lat: location.lat, lon: location.lon };
    nodes.push(node);
    nodeByRoot.set(root, node);
  }

  return { nodes, nodeByRoot, find: index => sets.find(index) };
}
