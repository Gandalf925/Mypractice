import { parseOverpassSegments } from './road-parser.js';
import { collapseParallelSegments } from './parallel-road-collapse.js';
import { buildRoadGraphFromSegments } from './build-road-graph.js';
import { attachGraphIndexes } from './graph-indexes.js';
import { dedupeGraphEdges } from './graph-dedup.js';
import { trimShortSpurs } from './graph-spurs.js';
import { keepCenterComponent } from './graph-component.js';

export class RoadService {
  constructor(overpassClient) {
    this.overpassClient = overpassClient;
    this.lastRawData = null;
    this.lastGraph = null;
  }

  async loadAround(location, options = {}) {
    const center = { lat: location.lat, lon: location.lon };
    const rawData = await this.overpassClient.fetchRoads(center.lat, center.lon, options);
    const rawSegments = parseOverpassSegments(rawData, center);
    const collapsedSegments = collapseParallelSegments(rawSegments);
    const graph = buildRoadGraphFromSegments(collapsedSegments, center);
    dedupeGraphEdges(graph);
    trimShortSpurs(graph);
    keepCenterComponent(graph);
    attachGraphIndexes(graph);
    this.lastRawData = rawData;
    this.lastGraph = graph;
    return graph;
  }
}
