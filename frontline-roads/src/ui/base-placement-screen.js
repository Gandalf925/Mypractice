import { ROAD_CONFIG } from '../core/constants.js';
import { formatMeters } from '../core/utilities.js';
import { queryRequired, setVisible } from './dom.js';

export class BasePlacementScreen {
  constructor(root = document) {
    this.overlay = queryRequired('#basePlacementOverlay', root);
    this.status = queryRequired('#basePlacementStatus', root);
    this.confirmButton = queryRequired('#confirmBase', root);
    this.retryButton = queryRequired('#retryLocation', root);
    this.zoomInButton = queryRequired('#zoomIn', root);
    this.zoomOutButton = queryRequired('#zoomOut', root);
    this.recenterButton = queryRequired('#recenter', root);
  }

  showLoading(message) {
    setVisible(this.overlay, true);
    this.status.textContent = message;
    this.confirmButton.disabled = true;
  }

  showSelection(selection) {
    if (!selection) {
      this.status.textContent = `現在地から${ROAD_CONFIG.selectionRadiusMeters / 1000}km以内の道路をタップしてください。`;
      this.confirmButton.disabled = true;
      return;
    }
    if (!selection.valid) {
      this.status.textContent = `${formatMeters(selection.distanceFromOrigin)}離れています。1km以内の道路を選択してください。`;
      this.confirmButton.disabled = true;
      return;
    }
    this.status.textContent = `${formatMeters(selection.distanceFromOrigin)}先の道路を選択中です。確定すると、その道路を中心に即時開始します。`;
    this.confirmButton.disabled = false;
  }

  hide() {
    setVisible(this.overlay, false);
  }

  showError(message) {
    setVisible(this.overlay, true);
    this.status.textContent = message;
    this.confirmButton.disabled = true;
  }
}
