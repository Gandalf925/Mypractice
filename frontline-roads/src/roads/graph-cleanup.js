import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { attachGraphIndexes } from './road-graph.js';

export function finalizeRoadGraph(graph, {
  minimumNodes = ROAD_CONFIG.minimumNodes,
  minimumEdges = ROAD_CONFIG.minimumEdges
} = {}) {
  if (graph.nodes.length < minimumNodes || graph.edges.length < minimumEdges) {
    throw new AppError(
      ErrorCode.ROAD_NETWORK_DISCONNECTED,
      'No nearby road data was found. Try another location.',
      { details: `nodes=${graph.nodes.length}, edges=${graph.edges.length}` }
    );
  }
  return attachGraphIndexes(graph);
}
