import { parseOverpassSegments } from './road-parser.js';
import { collapseParallelSegments } from './parallel-road-collapse.js';
import { buildRoadGraphFromSegments } from './road-graph.js';
import { finalizeRoadGraph } from './graph-cleanup.js';

export class RoadService {
  constructor(overpassClient) {
    this.overpassClient = overpassClient;
    this.lastGraph = null;
  }

  async loadAround(location, options = {}) {
    const center = { lat: location.lat, lon: location.lon };
    const rawData = await this.overpassClient.fetchRoads(center.lat, center.lon, options);
    const rawSegments = parseOverpassSegments(rawData, center);
    const collapsedSegments = collapseParallelSegments(rawSegments);
    const graph = finalizeRoadGraph(buildRoadGraphFromSegments(collapsedSegments, center));
    this.lastGraph = graph;
    return graph;
  }
}
