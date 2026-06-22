const TAU = Math.PI * 2;

function viewportRadius(width, height, center) {
  return Math.max(
    Math.hypot(center.x, center.y),
    Math.hypot(width - center.x, center.y),
    Math.hypot(center.x, height - center.y),
    Math.hypot(width - center.x, height - center.y)
  );
}

export function radarSweepAngle(timeMs = 0, preferences = {}) {
  if (preferences.motion === false) return -Math.PI / 2;
  return (timeMs * 0.00038 - Math.PI / 2) % TAU;
}

export function radarCenter(camera, marker = null) {
  if (marker) return camera.worldToScreen(marker);
  return { x: camera.viewportWidth / 2, y: camera.viewportHeight / 2 };
}

function drawGrid(context, width, height, center, preferences = {}) {
  const spacingBase = preferences.quality === 'minimal' ? 92 : preferences.quality === 'full' ? 52 : 68;
  const divisor = preferences.quality === 'minimal' ? 5 : preferences.quality === 'full' ? 9 : 8;
  const spacing = Math.max(36, Math.min(spacingBase, Math.min(width, height) / divisor));
  context.save();
  context.strokeStyle = 'rgba(48, 224, 191, 0.075)';
  context.lineWidth = 1;
  context.setLineDash([1, 5]);

  const offsetX = ((center.x % spacing) + spacing) % spacing;
  const offsetY = ((center.y % spacing) + spacing) % spacing;
  for (let x = offsetX; x <= width; x += spacing) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = offsetY; y <= height; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function drawRings(context, width, height, center, preferences = {}) {
  const maximum = viewportRadius(width, height, center);
  const ringGap = Math.max(54, Math.min(96, Math.min(width, height) / 5));
  context.save();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(66, 255, 210, 0.17)';
  context.setLineDash([]);
  for (let radius = ringGap; radius <= maximum + ringGap; radius += ringGap) {
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, TAU);
    context.stroke();
  }

  context.strokeStyle = 'rgba(96, 255, 224, 0.13)';
  const rayCount = preferences.quality === 'minimal' ? 4 : preferences.quality === 'full' ? 16 : 12;
  for (let index = 0; index < rayCount; index += 1) {
    const angle = index * TAU / rayCount;
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.lineTo(center.x + Math.cos(angle) * maximum, center.y + Math.sin(angle) * maximum);
    context.stroke();
  }

  context.strokeStyle = 'rgba(112, 255, 226, 0.34)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(center.x - 12, center.y);
  context.lineTo(center.x + 12, center.y);
  context.moveTo(center.x, center.y - 12);
  context.lineTo(center.x, center.y + 12);
  context.stroke();

  context.fillStyle = 'rgba(135, 255, 228, 0.45)';
  context.font = '600 9px ui-monospace, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const labelRadius = Math.min(maximum - 12, ringGap * 2.8);
  context.fillText('N', center.x, center.y - labelRadius);
  context.fillText('E', center.x + labelRadius, center.y);
  context.fillText('S', center.x, center.y + labelRadius);
  context.fillText('W', center.x - labelRadius, center.y);
  context.restore();
}

function drawSweep(context, width, height, center, timeMs, preferences = {}) {
  const maximum = viewportRadius(width, height, center) + 24;
  const head = radarSweepAngle(timeMs, preferences);
  const sector = Math.PI * 0.34;
  context.save();
  context.globalCompositeOperation = 'screen';

  const sweepLayers = preferences.quality === 'minimal' ? 0 : preferences.quality === 'full' ? 14 : 10;
  for (let index = 0; index < sweepLayers; index += 1) {
    const progress = index / Math.max(1, sweepLayers - 1);
    const start = head - sector * progress;
    const end = head - sector * Math.max(0, progress - 0.12);
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.arc(center.x, center.y, maximum, start, end);
    context.closePath();
    const gradient = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, maximum);
    const alpha = 0.032 + (1 - progress) * 0.022;
    gradient.addColorStop(0, `rgba(54,255,201,${alpha * 0.35})`);
    gradient.addColorStop(0.55, `rgba(34,246,196,${alpha})`);
    gradient.addColorStop(1, 'rgba(20,214,179,0)');
    context.fillStyle = gradient;
    context.fill();
  }

  context.strokeStyle = 'rgba(100,255,221,0.55)';
  context.lineWidth = 1.4;
  context.shadowColor = 'rgba(48,255,207,0.72)';
  context.shadowBlur = 12;
  context.beginPath();
  context.moveTo(center.x, center.y);
  context.lineTo(center.x + Math.cos(head) * maximum, center.y + Math.sin(head) * maximum);
  context.stroke();
  context.restore();
}

function drawScreenTexture(context, width, height, timeMs, preferences = {}) {
  if (preferences.quality !== 'minimal') {
    context.save();
    context.globalCompositeOperation = 'screen';
    context.fillStyle = 'rgba(91, 255, 219, 0.018)';
    const phase = Math.floor(timeMs / 48) % 5;
    for (let y = phase; y < height; y += 5) context.fillRect(0, y, width, 1);
    context.restore();
  }

  const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.72, 'rgba(0,8,8,0.08)');
  vignette.addColorStop(1, 'rgba(0,5,7,0.68)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

export function drawRadarBackdrop(context, width, height, center, timeMs = 0, preferences = {}) {
  const background = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, Math.max(width, height));
  background.addColorStop(0, '#06221d');
  background.addColorStop(0.44, '#041411');
  background.addColorStop(1, '#010706');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  drawGrid(context, width, height, center, preferences);
  drawRings(context, width, height, center, preferences);
  drawSweep(context, width, height, center, timeMs, preferences);
}

export function drawRadarOverlay(context, width, height, timeMs = 0, preferences = {}) {
  drawScreenTexture(context, width, height, timeMs, preferences);
}

export function sweepIntensity(point, center, sweepAngle) {
  const angle = Math.atan2(point.y - center.y, point.x - center.x);
  let gap = Math.abs(angle - sweepAngle) % TAU;
  if (gap > Math.PI) gap = TAU - gap;
  return Math.max(0, 1 - gap / (Math.PI * 0.32));
}
