import { drawRoadGraph } from './road-renderer.js';
import { drawCombatState } from './combat-renderer.js';
import { drawRadarBackdrop, drawRadarOverlay, radarCenter, radarSweepAngle } from './radar-renderer.js';
import { drawThreatRoutes, drawTacticalFocus } from './tactical-overlay.js';
import { CombatEffects } from './combat-effects.js';

const ACTIVE_GAME_STATES = new Set(['PLAYING', 'PAUSED']);

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.camera = camera;
    this.graph = null;
    this.selection = null;
    this.homeBase = null;
    this.stateProvider = null;
    this.focus = null;
    this.effects = new CombatEffects();
    this.preferences = { quality: 'balanced', motion: true, routes: 'priority' };
    this.lastAmbientFrame = 0;
    this.ambientFrameId = null;
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas);
    this.boundWindowResize = () => this.resize();
    if (!this.resizeObserver) globalThis.addEventListener?.('resize', this.boundWindowResize);
    this.boundAmbientFrame = timestamp => this.animateAmbient(timestamp);
    this.resize();
    this.ambientFrameId = globalThis.requestAnimationFrame?.(this.boundAmbientFrame) ?? null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.setViewport(rect.width, rect.height);
    this.render();
  }

  animateAmbient(timestamp) {
    const lifecycle = this.stateProvider?.()?.lifecycle;
    if (!ACTIVE_GAME_STATES.has(lifecycle) && timestamp - this.lastAmbientFrame >= 32) {
      this.lastAmbientFrame = timestamp;
      this.render(timestamp);
    }
    this.ambientFrameId = globalThis.requestAnimationFrame?.(this.boundAmbientFrame) ?? null;
  }

  setGraph(graph) {
    this.graph = graph;
  }

  setSelection(selection) {
    this.selection = selection;
  }

  setHomeBase(homeBase) {
    this.homeBase = homeBase;
  }

  setStateProvider(provider) {
    this.stateProvider = provider;
  }

  setPreferences(preferences) {
    this.preferences = { ...this.preferences, ...preferences };
    this.render();
  }

  bindEvents(events) {
    this.effects.bind(events, () => this.stateProvider?.());
  }

  setFocus(focus) {
    this.focus = focus;
    this.render();
  }

  fitGraph() {
    if (!this.graph?.nodes?.length) return;
    const xs = this.graph.nodes.map(node => node.x);
    const ys = this.graph.nodes.map(node => node.y);
    this.camera.fitBounds({ minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }, 36);
    this.render();
  }

  render(timeMs = globalThis.performance?.now?.() ?? Date.now()) {
    const rect = this.canvas.getBoundingClientRect();
    const state = this.stateProvider?.();
    const anchor = state?.world?.city
      ? state.world.roadGraph?.nodeById?.get(state.world.city.nodeId)
      : this.selection?.point ?? this.homeBase;
    const center = radarCenter(this.camera, anchor);
    const visualTime = this.preferences.motion ? timeMs : 0;
    const sweepAngle = radarSweepAngle(visualTime, this.preferences);

    this.context.clearRect(0, 0, rect.width, rect.height);
    drawRadarBackdrop(this.context, rect.width, rect.height, center, visualTime, this.preferences);

    if (this.graph) {
      drawRoadGraph(this.context, this.graph, this.camera, {
        selectedEdgeId: this.selection?.edgeId ?? null,
        timeMs
      });
      if (ACTIVE_GAME_STATES.has(state?.lifecycle)) {
        drawThreatRoutes(this.context, state, this.camera, this.focus, this.preferences);
        drawCombatState(this.context, state, this.camera, { center, sweepAngle, timeMs: visualTime });
        drawTacticalFocus(this.context, state, this.camera, this.focus, visualTime);
        this.effects.draw(this.context, this.camera, state, timeMs, rect.width, rect.height, this.preferences);
      }
    }

    const marker = this.selection?.point ?? this.homeBase;
    if (marker) this.drawMarker(marker, visualTime);
    drawRadarOverlay(this.context, rect.width, rect.height, visualTime, this.preferences);
  }

  drawMarker(marker, timeMs) {
    const point = this.camera.worldToScreen(marker);
    const valid = this.selection?.valid !== false;
    const accent = valid ? '#65ffd0' : '#ff596e';
    const pulse = 12 + Math.sin(timeMs * 0.005) * 2.5;
    this.context.save();
    this.context.strokeStyle = accent;
    this.context.fillStyle = valid ? 'rgba(101,255,208,0.2)' : 'rgba(255,89,110,0.2)';
    this.context.shadowColor = accent;
    this.context.shadowBlur = 16;
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(point.x, point.y, pulse, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.setLineDash([3, 3]);
    this.context.beginPath();
    this.context.arc(point.x, point.y, pulse + 6, 0, Math.PI * 2);
    this.context.stroke();
    this.context.setLineDash([]);
    this.context.beginPath();
    this.context.moveTo(point.x - 5, point.y);
    this.context.lineTo(point.x + 5, point.y);
    this.context.moveTo(point.x, point.y - 5);
    this.context.lineTo(point.x, point.y + 5);
    this.context.stroke();
    this.context.restore();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    if (!this.resizeObserver) globalThis.removeEventListener?.('resize', this.boundWindowResize);
    if (this.ambientFrameId != null) globalThis.cancelAnimationFrame?.(this.ambientFrameId);
    this.ambientFrameId = null;
    this.effects.destroy();
  }
}
