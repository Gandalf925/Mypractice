export const EXPLORATION_INTERACTION_RANGE_METERS = 0;

const DISABLED_PRESENTATION = Object.freeze({
  name: 'point',
  duration: 0,
  icon: '',
  description: 'Exploration missions are deprecated. Use Roadside Supplies.',
  status: 'DISABLED'
});

export function explorationSitePresentation(_site) {
  return { ...DISABLED_PRESENTATION };
}

export function ensureExplorationState(state) {
  if (!state?.world) return [];
  state.world.explorationSites = [];
  state.world.exploredSiteChunks = [];
  return state.world.explorationSites;
}

export function reconcileExplorationSites(state) {
  return ensureExplorationState(state);
}

export class ExplorationSystem {
  constructor(_events) {}
  reconcile(state) { return ensureExplorationState(state); }
  beginInteraction(state, _siteId) {
    ensureExplorationState(state);
    return { ok: false, reason: 'Exploration missions are deprecated. Use Roadside Supplies from the ITEMS screen.' };
  }
  update(state, _deltaSeconds = 0) {
    ensureExplorationState(state);
    return [];
  }
}
