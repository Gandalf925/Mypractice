import { deepClone, stableId } from '../core/utilities.js';
import { CIVILIZATION_PROJECTS, PRODUCTION_RECIPES } from './data.js';
import { addBundle, consumeBundle, hasBundle, missingBundle } from './inventory-system.js';

function queueFor(state, buildingId, create = false) {
  let queue = state.civilization.productionQueues.find(item => item.buildingId === buildingId);
  if (!queue && create) {
    queue = { buildingId, orders: [], current: null, completedUnits: 0, waitingForResources: false };
    state.civilization.productionQueues.push(queue);
  }
  return queue;
}

function projectCanAccept(state, recipe) {
  if (!recipe?.projectOnly) return true;
  const project = state.civilization?.project;
  if (!project || ['BUILDING', 'PAUSED'].includes(project.status)) return false;
  const definition = state.civilization?.level < 4 ? (CIVILIZATION_PROJECTS[project.targetLevel]) : null;
  if (!definition) return false;
  return Object.entries(recipe.output).every(([resource, amount]) => {
    const required = definition.contributions?.[resource] ?? 0;
    return required - (project.contributions?.[resource] ?? 0) >= amount;
  });
}

function compatible(state, building, recipe) {
  return Boolean(
    building && !building.ruined && !building.demolished && recipe &&
    recipe.building === building.type && (state.civilization.level ?? 0) >= recipe.level && projectCanAccept(state, recipe)
  );
}

export class ProductionSystem {
  constructor(events = null) {
    this.events = events;
  }

  availableRecipes(state, building) {
    return Object.entries(PRODUCTION_RECIPES)
      .filter(([, recipe]) => compatible(state, building, recipe))
      .map(([id, recipe]) => ({ id, ...recipe }));
  }

  enqueue(state, buildingId, recipeId, quantity = 1) {
    const building = state.civilization.buildings.find(item => item.id === buildingId && !item.demolished);
    const recipe = PRODUCTION_RECIPES[recipeId];
    if (!compatible(state, building, recipe)) return { ok: false, reason: 'この施設では生産できません。' };
    let amount = Math.max(1, Math.min(99, Math.floor(quantity)));
    if (recipe.projectOnly) {
      const project = state.civilization.project;
      const definition = CIVILIZATION_PROJECTS[project.targetLevel];
      const limits = Object.entries(recipe.output).map(([resource, output]) => Math.floor(((definition.contributions?.[resource] ?? 0) - (project.contributions?.[resource] ?? 0)) / output));
      amount = Math.min(amount, ...limits);
      if (amount <= 0) return { ok: false, reason: '発展計画に必要な生産量へ到達しています。' };
    }
    const queue = queueFor(state, buildingId, true);
    queue.orders.push({ id: stableId('order', buildingId, recipeId, state.runtime?.worldTimeMs ?? Date.now()), recipeId, remaining: amount });
    this.startNext(state, queue, building);
    return { ok: true, queue };
  }

  startNext(state, queue, building) {
    if (queue.current || !compatible(state, building, PRODUCTION_RECIPES[queue.orders[0]?.recipeId])) return false;
    while (queue.orders.length && queue.orders[0].remaining <= 0) queue.orders.shift();
    const order = queue.orders[0];
    if (!order) return false;
    const recipe = PRODUCTION_RECIPES[order.recipeId];
    if (!hasBundle(state, recipe.input)) {
      queue.waitingForResources = true;
      return false;
    }
    consumeBundle(state, recipe.input);
    queue.waitingForResources = false;
    queue.current = {
      recipeId: order.recipeId,
      orderId: order.id,
      elapsedSec: 0,
      durationSec: recipe.seconds,
      reservedInput: deepClone(recipe.input)
    };
    return true;
  }

  completeCurrent(state, queue, building) {
    const current = queue.current;
    const recipe = PRODUCTION_RECIPES[current.recipeId];
    const order = queue.orders.find(item => item.id === current.orderId);
    const result = recipe.projectOnly
      ? { accepted: {}, overflowed: {} }
      : addBundle(state, recipe.output);
    if (recipe.projectOnly) {
      const project = state.civilization.project;
      project.contributions ??= {};
      for (const [resource, amount] of Object.entries(recipe.output)) {
        project.contributions[resource] = (project.contributions[resource] ?? 0) + amount;
        result.accepted[resource] = amount;
      }
    }
    for (const [resource, amount] of Object.entries(result.overflowed)) {
      const overflow = state.inventory.overflow[resource];
      if (overflow) {
        overflow.amount -= amount;
        if (overflow.amount <= 0) delete state.inventory.overflow[resource];
      }
      building.outputBuffer[resource] = (building.outputBuffer[resource] ?? 0) + amount;
    }
    if (order) order.remaining -= 1;
    queue.completedUnits += 1;
    building.history.produced += Object.values(recipe.output).reduce((sum, value) => sum + value, 0);
    for (const [key, value] of Object.entries(recipe.output)) {
      state.civilization.progress.totalProduced[key] = (state.civilization.progress.totalProduced[key] ?? 0) + value;
    }
    if (recipe.output.bronzeIngot) state.civilization.progress.selfProducedBronze += recipe.output.bronzeIngot;
    if (recipe.output.wroughtIron) state.civilization.progress.selfProducedWroughtIron += recipe.output.wroughtIron;
    queue.current = null;
    while (queue.orders.length && queue.orders[0].remaining <= 0) queue.orders.shift();
    this.events?.emit('civilization:produced', { buildingId: building.id, recipeId: current.recipeId, output: recipe.output, overflowed: result.overflowed });
    this.startNext(state, queue, building);
  }

  update(state, deltaSeconds) {
    let remaining = Math.max(0, deltaSeconds);
    let guard = 0;
    while (remaining > 0.0001 && guard < 1000) {
      guard += 1;
      const active = [];
      let step = remaining;
      for (const queue of state.civilization.productionQueues) {
        const building = state.civilization.buildings.find(item => item.id === queue.buildingId && !item.demolished);
        if (!building || building.ruined) continue;
        if (!queue.current) this.startNext(state, queue, building);
        if (!queue.current) continue;
        active.push({ queue, building });
        step = Math.min(step, Math.max(0.001, queue.current.durationSec - queue.current.elapsedSec));
      }
      if (active.length === 0) break;
      for (const item of active) item.queue.current.elapsedSec += step;
      remaining -= step;
      for (const item of active) {
        if (item.queue.current && item.queue.current.elapsedSec + 1e-6 >= item.queue.current.durationSec) {
          this.completeCurrent(state, item.queue, item.building);
        }
      }
    }
  }


  collectOutput(state, buildingId) {
    const building = state.civilization.buildings.find(item => item.id === buildingId && !item.demolished);
    if (!building) return { ok: false, reason: '施設が見つかりません。' };
    const buffered = { ...(building.outputBuffer ?? {}) };
    if (Object.values(buffered).every(value => !value)) return { ok: false, reason: '回収できる生産物はありません。' };
    building.outputBuffer = {};
    const result = addBundle(state, buffered);
    for (const [resource, amount] of Object.entries(result.overflowed)) {
      const overflow = state.inventory.overflow[resource];
      if (overflow) {
        overflow.amount -= amount;
        if (overflow.amount <= 0) delete state.inventory.overflow[resource];
      }
      building.outputBuffer[resource] = (building.outputBuffer[resource] ?? 0) + amount;
    }
    return { ok: true, ...result, remaining: { ...building.outputBuffer } };
  }

  missingForNext(state, buildingId) {
    const queue = queueFor(state, buildingId, false);
    const recipe = PRODUCTION_RECIPES[queue?.orders?.[0]?.recipeId];
    return recipe ? missingBundle(state, recipe.input) : {};
  }
}
