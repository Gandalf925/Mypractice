import { parseOverpassSegments } from './road-parser.js';
import { collapseParallelSegments } from './parallel-road-collapse.js';
import { buildRoadGraphFromSegments, attachGraphIndexes } from './road-graph.js';
import { finalizeRoadGraph } from './graph-cleanup.js';
import { latLonToXY } from '../location/location-privacy.js';
import { ROAD_CONFIG } from '../core/constants.js';

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

  async loadChunk({ worldCenter, chunkCenter, chunkId, radiusMeters = ROAD_CONFIG.chunkFetchRadiusMeters }, options = {}) {
    if (!worldCenter || !chunkCenter || !chunkId) throw new TypeError('worldCenter, chunkCenter and chunkId are required');
    const rawData = await this.overpassClient.fetchRoads(chunkCenter.lat, chunkCenter.lon, {
      ...options,
      radiusMeters,
      queryShape: 'bbox'
    });
    const rawSegments = parseOverpassSegments(rawData, worldCenter, {
      clipCenter: chunkCenter,
      maxDistanceMeters: radiusMeters,
      minimumRawSegments: 0
    });
    if (rawSegments.length === 0) {
      return attachGraphIndexes({
        nodes: [], edges: [], center: worldCenter, source: 'osm-chunk', roadSpecVersion: 2, chunkId
      });
    }
    const collapsedSegments = collapseParallelSegments(rawSegments);
    const centerPoint = latLonToXY(chunkCenter.lat, chunkCenter.lon, worldCenter);
    const graph = finalizeRoadGraph(buildRoadGraphFromSegments(collapsedSegments, worldCenter), {
      centerPoint,
      keepSingleComponent: false,
      minimumNodes: 0,
      minimumEdges: 0
    });
    graph.source = 'osm-chunk';
    graph.roadSpecVersion = 2;
    graph.chunkId = chunkId;
    for (const node of graph.nodes) node.chunkIds = [chunkId];
    for (const edge of graph.edges) edge.chunkIds = [chunkId];
    return graph;
  }
}
