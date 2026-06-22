import { drawRoadGraph } from './road-renderer.js';
import { drawCombatState } from './combat-renderer.js';

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.camera = camera;
    this.graph = null;
    this.selection = null;
    this.homeBase = null;
    this.stateProvider = null;
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas);
    this.boundWindowResize = () => this.resize();
    if (!this.resizeObserver) globalThis.addEventListener?.('resize', this.boundWindowResize);
    this.resize();
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

  fitGraph() {
    if (!this.graph?.nodes?.length) return;
    const xs = this.graph.nodes.map(node => node.x);
    const ys = this.graph.nodes.map(node => node.y);
    this.camera.fitBounds({ minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }, 36);
    this.render();
  }

  render() {
    const rect = this.canvas.getBoundingClientRect();
    this.context.clearRect(0, 0, rect.width, rect.height);
    this.context.fillStyle = '#0d1219';
    this.context.fillRect(0, 0, rect.width, rect.height);
    if (!this.graph) return;
    drawRoadGraph(this.context, this.graph, this.camera, { selectedEdgeId: this.selection?.edgeId ?? null });
    const state = this.stateProvider?.();
    if (state?.lifecycle === 'PLAYING' || state?.lifecycle === 'PAUSED') drawCombatState(this.context, state, this.camera);

    const marker = this.selection?.point ?? this.homeBase;
    if (marker) {
      const screen = this.camera.worldToScreen(marker);
      this.context.save();
      this.context.fillStyle = this.selection?.valid === false ? '#ff6b6b' : '#7ee787';
      this.context.strokeStyle = '#0b0f15';
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.arc(screen.x, screen.y, 9, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.restore();
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    if (!this.resizeObserver) globalThis.removeEventListener?.('resize', this.boundWindowResize);
  }
}
