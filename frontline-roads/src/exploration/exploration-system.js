export const EXPLORATION_INTERACTION_RANGE_METERS = 0;

const DISABLED_PRESENTATION = Object.freeze({
  name: '廃止済み探索地点',
  duration: 0,
  icon: '',
  description: '探索ミッションは道端アイテム機能へ統合されました。',
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
    return { ok: false, reason: '探索ミッションは廃止されました。道端アイテムを利用してください。' };
  }
  update(state, _deltaSeconds = 0) {
    ensureExplorationState(state);
    return [];
  }
}
