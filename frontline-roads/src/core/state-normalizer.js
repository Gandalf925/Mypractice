import { attachGraphIndexes } from '../roads/road-graph.js';
import { ensureRoadChunkState } from '../roads/world-chunk-grid.js';
import { repairRoadGraphTopology } from '../roads/road-topology-repair.js';
import { normalizeCombatState } from '../combat/combat-initializer.js';
import { ensureRoadsideSupplyState } from '../exploration/roadside-supplies.js';
import { ensureExplorationState } from '../exploration/exploration-system.js';

export function normalizeRuntimeState(state) {
  if (state.world?.roadGraph) {
    attachGraphIndexes(state.world.roadGraph);
    repairRoadGraphTopology(state.world.roadGraph);
  }
  ensureRoadChunkState(state.world);
  normalizeCombatState(state);
  ensureExplorationState(state);
  ensureRoadsideSupplyState(state);
  return state;
}
