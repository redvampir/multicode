/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { GraphState, GraphNode, GraphLanguage, GraphNodeType } from '../shared/graphState';
import type { Locale, TranslationKey } from '../shared/translations';
import type { ValidationResult } from '../shared/validator';
import { getTranslation } from '../shared/translations';

type ToastKind = 'info' | 'success' | 'warning' | 'error';

type Message =
  | { type: 'setState'; payload: GraphState }
  | { type: 'toast'; payload: { kind: ToastKind; message: string } }
  | { type: 'validationResult'; payload: ValidationResult };

const vscode = acquireVsCodeApi();

let currentState: GraphState | null = null;
let currentLocale: Locale = 'ru';
let toolbarLoading = false;

const toolbarButtonsRoot = document.getElementById('toolbar-buttons')!;
const toolbarSpinner = document.getElementById('toolbar-spinner')!;
const localeSelect = document.getElementById('locale-select') as HTMLSelectElement;
localeSelect.value = currentLocale;
const unsavedIndicator = document.getElementById('unsaved-indicator')!;
const toastContainer = document.getElementById('toast-container')!;
const infoRoot = document.getElementById('graph-info')!;
const actionsRoot = document.getElementById('graph-actions')!;
const inspectorRoot = document.getElementById('inspector')!;
const appTitle = document.getElementById('app-title')!;
const appSubtitle = document.getElementById('app-subtitle')!;
const overviewTitle = document.getElementById('overview-title')!;
const actionsTitle = document.getElementById('actions-title')!;
const inspectorTitle = document.getElementById('inspector-title')!;
const validationSummary = document.getElementById('validation-summary')!;
const graphCanvas = document.getElementById('graph-canvas')!;
const graphViewport = document.getElementById('graph-viewport')!;
const edgesSvg = document.querySelector<SVGSVGElement>('#graph-edges')!;
const nodesLayer = document.getElementById('graph-nodes')!;
const miniMapCanvas = document.getElementById('mini-map') as HTMLCanvasElement;

const t = (key: TranslationKey): string => getTranslation(currentLocale, key);

const viewState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  panning: false,
  pointerId: -1,
  startX: 0,
  startY: 0
};
const nodeElements = new Map<string, HTMLElement>();
let lastBounds = { width: 800, height: 600 };
const dragState = {
  active: false,
  nodeId: '',
  pointerId: -1,
  offsetX: 0,
  offsetY: 0
};
const miniMapState = {
  dragging: false,
  pointerId: -1,
  scale: 1,
  offsetX: 0,
  offsetY: 0
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const setToolbarLoading = (loading: boolean): void => {
  toolbarLoading = loading;
  toolbarSpinner.classList.toggle('visible', loading);
  toolbarButtonsRoot.querySelectorAll('button').forEach((btn) => {
    btn.toggleAttribute('disabled', loading);
  });
};

const showToast = (kind: ToastKind, message: string): void => {
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

const buildToolbar = (): void => {
  toolbarButtonsRoot.innerHTML = `
    <button data-action="requestNewGraph">${t('toolbar.new')}</button>
    <button data-action="requestSave">${t('toolbar.save')}</button>
    <button data-action="requestLoad">${t('toolbar.load')}</button>
    <button data-action="requestGenerate">${t('toolbar.generate')}</button>
    <button data-action="requestValidate">${t('toolbar.validate')}</button>
  `;

  toolbarButtonsRoot.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-action');
      if (!action) {
        return;
      }
      setToolbarLoading(true);
      vscode.postMessage({ type: action });
    });
  });

  overviewTitle.textContent = t('overview.title');
  actionsTitle.textContent = t('form.graphTitle');
  inspectorTitle.textContent = t('inspector.title');
  appTitle.textContent = t('app.title');
  appSubtitle.textContent = t('app.subtitle');
};

const buildActionsUi = (): void => {
  actionsRoot.innerHTML = `
    <label for="graph-name-input">${t('form.graphTitle')}</label>
    <input id="graph-name-input" type="text" placeholder="${t('form.placeholder.graph')}" />
    <button id="rename-graph-btn">${t('form.rename')}</button>

    <label for="graph-language-select">${t('form.targetLanguage')}</label>
    <select id="graph-language-select">
      <option value="cpp">C++</option>
      <option value="rust">Rust</option>
      <option value="asm">Assembly</option>
    </select>

    <label for="node-label-input">${t('form.newNode')}</label>
    <input id="node-label-input" type="text" placeholder="${t('form.placeholder.node')}" />
    <label for="node-type-select">${t('form.nodeType')}</label>
    <select id="node-type-select">
      <option value="Function">Function</option>
      <option value="Start">Start</option>
      <option value="End">End</option>
      <option value="Variable">Variable</option>
      <option value="Custom">Custom</option>
    </select>
    <button id="add-node-btn">${t('form.addNode')}</button>

    <label>${t('form.connection')}</label>
    <select id="source-node-select"></select>
    <select id="target-node-select"></select>
    <input id="edge-label-input" type="text" placeholder="${t('form.placeholder.edge')}" />
    <button id="connect-nodes-btn">${t('form.connect')}</button>
  `;

  document.getElementById('rename-graph-btn')?.addEventListener('click', () => {
    const input = document.getElementById('graph-name-input') as HTMLInputElement;
    vscode.postMessage({ type: 'renameGraph', payload: { name: input.value } });
  });

  document.getElementById('graph-language-select')?.addEventListener('change', (event) => {
    const select = event.target as HTMLSelectElement;
    vscode.postMessage({ type: 'updateLanguage', payload: { language: select.value as GraphLanguage } });
  });

  document.getElementById('add-node-btn')?.addEventListener('click', () => {
    const input = document.getElementById('node-label-input') as HTMLInputElement;
    const typeSelect = document.getElementById('node-type-select') as HTMLSelectElement;
    const payload = {
      label: input.value,
      nodeType: (typeSelect.value as GraphNodeType) ?? 'Function'
    };
    vscode.postMessage({ type: 'addNode', payload });
    input.value = '';
    input.focus();
  });

  document.getElementById('connect-nodes-btn')?.addEventListener('click', () => {
    const source = document.getElementById('source-node-select') as HTMLSelectElement;
    const target = document.getElementById('target-node-select') as HTMLSelectElement;
    const label = document.getElementById('edge-label-input') as HTMLInputElement;
    vscode.postMessage({
      type: 'connectNodes',
      payload: {
        sourceId: source.value,
        targetId: target.value,
        label: label.value
      }
    });
    label.value = '';
  });
};

const updateSelectOptions = (nodes: GraphNode[]): void => {
  const sourceSelect = document.getElementById('source-node-select') as HTMLSelectElement;
  const targetSelect = document.getElementById('target-node-select') as HTMLSelectElement;
  if (!sourceSelect || !targetSelect) {
    return;
  }
  const options = nodes.map((node) => `<option value="${node.id}">${node.label}</option>`).join('');
  sourceSelect.innerHTML = options;
  targetSelect.innerHTML = options;
};

const setUnsavedIndicator = (dirty: boolean): void => {
  unsavedIndicator.textContent = dirty ? t('toolbar.unsaved') : '';
  unsavedIndicator.classList.toggle('visible', dirty);
};

const graphRect = (): DOMRect => graphCanvas.getBoundingClientRect();

const screenToGraph = (clientX: number, clientY: number): { x: number; y: number } => {
  const rect = graphRect();
  const x = (clientX - rect.left - viewState.offsetX) / viewState.scale;
  const y = (clientY - rect.top - viewState.offsetY) / viewState.scale;
  return { x, y };
};

const sendGraphChanged = (): void => {
  if (!currentState) {
    return;
  }
  vscode.postMessage({
    type: 'graphChanged',
    payload: {
      nodes: currentState.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        position: node.position
      }))
    }
  });
};

const beginNodeDrag = (event: PointerEvent, nodeId: string): void => {
  if (!currentState) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  const node = currentState.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return;
  }

  const pointer = screenToGraph(event.clientX, event.clientY);
  dragState.active = true;
  dragState.nodeId = nodeId;
  dragState.pointerId = event.pointerId;
  dragState.offsetX = pointer.x - (node.position?.x ?? 0);
  dragState.offsetY = pointer.y - (node.position?.y ?? 0);

  (event.target as HTMLElement).setPointerCapture(event.pointerId);
};

const handleNodeDragMove = (event: PointerEvent): void => {
  if (!dragState.active || dragState.pointerId !== event.pointerId || !currentState) {
    return;
  }
  const pointer = screenToGraph(event.clientX, event.clientY);
  const node = currentState.nodes.find((item) => item.id === dragState.nodeId);
  if (!node) {
    return;
  }
  const newX = pointer.x - dragState.offsetX;
  const newY = pointer.y - dragState.offsetY;
  node.position = {
    x: newX,
    y: newY
  };

  const element = nodeElements.get(node.id);
  if (element) {
    element.style.left = `${newX}px`;
    element.style.top = `${newY}px`;
  }
  currentState.dirty = true;
  setUnsavedIndicator(true);

  edgesSvg
    .querySelectorAll(`line[data-source="${node.id}"]`)
    .forEach((line) => line.setAttribute('x1', String(newX)));
  edgesSvg
    .querySelectorAll(`line[data-target="${node.id}"]`)
    .forEach((line) => line.setAttribute('x2', String(newX)));
  edgesSvg
    .querySelectorAll(`line[data-source="${node.id}"]`)
    .forEach((line) => line.setAttribute('y1', String(newY)));
  edgesSvg
    .querySelectorAll(`line[data-target="${node.id}"]`)
    .forEach((line) => line.setAttribute('y2', String(newY)));
};

const finishNodeDrag = (event: PointerEvent): void => {
  if (!dragState.active || dragState.pointerId !== event.pointerId) {
    return;
  }
  const nodeId = dragState.nodeId;
  const element = nodeElements.get(nodeId);
  element?.releasePointerCapture(event.pointerId);
  dragState.active = false;
  dragState.pointerId = -1;
  dragState.nodeId = '';
  sendGraphChanged();
};

const applyViewportTransform = (): void => {
  graphViewport.style.transform = `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`;
  if (currentState && currentState.nodes.length) {
    drawMiniMap(currentState, lastBounds);
  } else {
    resetMiniMap();
  }
};

const renderGraphCanvas = (state: GraphState): void => {
  if (!state.nodes.length) {
    graphViewport.style.width = '100%';
    graphViewport.style.height = '100%';
    nodesLayer.innerHTML = '<p class="muted" style="padding:16px;">Graph is empty</p>';
    edgesSvg.innerHTML = '';
    lastBounds = {
      width: graphCanvas.clientWidth || lastBounds.width,
      height: graphCanvas.clientHeight || lastBounds.height
    };
    resetMiniMap();
    return;
  }

  const bounds = computeBounds(state);
  lastBounds = bounds;
  graphViewport.style.width = `${bounds.width}px`;
  graphViewport.style.height = `${bounds.height}px`;
  nodesLayer.innerHTML = '';
  edgesSvg.innerHTML = '';
  nodeElements.clear();
  edgesSvg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  edgesSvg.setAttribute('width', `${bounds.width}`);
  edgesSvg.setAttribute('height', `${bounds.height}`);

  state.edges.forEach((edge) => {
    const from = state.nodes.find((node) => node.id === edge.source);
    const to = state.nodes.find((node) => node.id === edge.target);
    if (!from || !to) {
      return;
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(from.position?.x ?? 0));
    line.setAttribute('y1', String(from.position?.y ?? 0));
    line.setAttribute('x2', String(to.position?.x ?? 0));
    line.setAttribute('y2', String(to.position?.y ?? 0));
    line.setAttribute('stroke', edge.kind === 'data' ? '#ffb300' : '#90caf9');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    line.dataset.source = edge.source;
    line.dataset.target = edge.target;
    edgesSvg.appendChild(line);
  });

  if (!edgesSvg.querySelector('defs')) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '4');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,0 L6,3 L0,6 z');
    path.setAttribute('fill', '#90caf9');
    marker.appendChild(path);
    defs.appendChild(marker);
    edgesSvg.appendChild(defs);
  }

  state.nodes.forEach((node) => {
    const div = document.createElement('div');
    div.className = `graph-node type-${node.type}`;
    div.style.left = `${node.position?.x ?? 0}px`;
    div.style.top = `${node.position?.y ?? 0}px`;
    div.textContent = node.label;
    div.dataset.nodeId = node.id;
    div.addEventListener('pointerdown', (event) => beginNodeDrag(event, node.id));
    nodeElements.set(node.id, div);
    nodesLayer.appendChild(div);
  });

  applyViewportTransform();
};

const computeBounds = (state: GraphState): { width: number; height: number } => {
  const xs = state.nodes.map((node) => node.position?.x ?? 0);
  const ys = state.nodes.map((node) => node.position?.y ?? 0);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 400);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 300);
  const padding = 200;
  return {
    width: maxX - minX + padding,
    height: maxY - minY + padding
  };
};

const resetMiniMap = (): void => {
  const ctx = miniMapCanvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);
  miniMapState.scale = 1;
  miniMapState.offsetX = 0;
  miniMapState.offsetY = 0;
};

const drawMiniMap = (state: GraphState, bounds: { width: number; height: number }): void => {
  const ctx = miniMapCanvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

  const scale = Math.min(
    miniMapCanvas.width / bounds.width,
    miniMapCanvas.height / bounds.height
  );

  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const offsetX = (miniMapCanvas.width - contentWidth) / 2;
  const offsetY = (miniMapCanvas.height - contentHeight) / 2;

  miniMapState.scale = scale;
  miniMapState.offsetX = offsetX;
  miniMapState.offsetY = offsetY;

  state.nodes.forEach((node) => {
    const x = (node.position?.x ?? 0) * scale + offsetX;
    const y = (node.position?.y ?? 0) * scale + offsetY;
    ctx.fillStyle = '#90caf9';
    ctx.fillRect(x, y, 6, 6);
  });

  if (!state.nodes.length) {
    return;
  }

  const viewWidth = graphCanvas.clientWidth / viewState.scale;
  const viewHeight = graphCanvas.clientHeight / viewState.scale;
  const viewX = (-viewState.offsetX) / viewState.scale;
  const viewY = (-viewState.offsetY) / viewState.scale;

  if (!Number.isFinite(viewWidth) || !Number.isFinite(viewHeight)) {
    return;
  }

  const rectX = clamp(viewX * scale + offsetX, 0, miniMapCanvas.width);
  const rectY = clamp(viewY * scale + offsetY, 0, miniMapCanvas.height);
  const rectWidth = Math.min(viewWidth * scale, miniMapCanvas.width - rectX);
  const rectHeight = Math.min(viewHeight * scale, miniMapCanvas.height - rectY);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
};

const focusMiniMapAtPointer = (clientX: number, clientY: number): void => {
  if (!currentState || !currentState.nodes.length || miniMapState.scale <= 0) {
    return;
  }
  const rect = miniMapCanvas.getBoundingClientRect();
  const rawX = clientX - rect.left - miniMapState.offsetX;
  const rawY = clientY - rect.top - miniMapState.offsetY;
  const graphX = clamp(rawX / miniMapState.scale, 0, lastBounds.width);
  const graphY = clamp(rawY / miniMapState.scale, 0, lastBounds.height);
  viewState.offsetX = graphCanvas.clientWidth / 2 - graphX * viewState.scale;
  viewState.offsetY = graphCanvas.clientHeight / 2 - graphY * viewState.scale;
  applyViewportTransform();
};

const startMiniMapInteraction = (event: PointerEvent): void => {
  if (!currentState || !currentState.nodes.length) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  miniMapState.dragging = true;
  miniMapState.pointerId = event.pointerId;
  miniMapCanvas.setPointerCapture(event.pointerId);
  focusMiniMapAtPointer(event.clientX, event.clientY);
};

const moveMiniMapInteraction = (event: PointerEvent): void => {
  if (!miniMapState.dragging || miniMapState.pointerId !== event.pointerId) {
    return;
  }
  event.preventDefault();
  focusMiniMapAtPointer(event.clientX, event.clientY);
};

const finishMiniMapInteraction = (event: PointerEvent): void => {
  if (miniMapState.pointerId !== event.pointerId) {
    return;
  }
  miniMapCanvas.releasePointerCapture(event.pointerId);
  miniMapState.dragging = false;
  miniMapState.pointerId = -1;
};

const setupCanvasInteractions = (): void => {
  graphCanvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      viewState.scale = Math.min(2.5, Math.max(0.4, viewState.scale * delta));
      applyViewportTransform();
    },
    { passive: false }
  );

  graphCanvas.addEventListener('pointerdown', (event) => {
    if (dragState.active) {
      return;
    }
    viewState.panning = true;
    viewState.pointerId = event.pointerId;
    viewState.startX = event.clientX - viewState.offsetX;
    viewState.startY = event.clientY - viewState.offsetY;
    graphCanvas.classList.add('panning');
    graphCanvas.setPointerCapture(event.pointerId);
  });

  graphCanvas.addEventListener('pointermove', (event) => {
    if (!viewState.panning || viewState.pointerId !== event.pointerId) {
      return;
    }
    viewState.offsetX = event.clientX - viewState.startX;
    viewState.offsetY = event.clientY - viewState.startY;
    applyViewportTransform();
  });

  graphCanvas.addEventListener('pointerup', (event) => {
    if (viewState.pointerId === event.pointerId) {
      viewState.panning = false;
      graphCanvas.classList.remove('panning');
      graphCanvas.releasePointerCapture(event.pointerId);
    }
  });

  miniMapCanvas.addEventListener('pointerdown', (event) => startMiniMapInteraction(event), {
    passive: false
  });
  miniMapCanvas.addEventListener('pointermove', (event) => moveMiniMapInteraction(event), {
    passive: false
  });
  miniMapCanvas.addEventListener('pointerup', (event) => finishMiniMapInteraction(event));
  miniMapCanvas.addEventListener('pointerleave', (event) => finishMiniMapInteraction(event));
  miniMapCanvas.addEventListener('pointercancel', (event) => finishMiniMapInteraction(event));
};

const renderState = (state: GraphState): void => {
  currentState = state;
  if (state.displayLanguage && state.displayLanguage !== currentLocale) {
    currentLocale = state.displayLanguage;
    localeSelect.value = currentLocale;
    buildToolbar();
    buildActionsUi();
  }

  const infoHtml = `
    <p><strong>${t('graph.id')}:</strong> ${state.id}</p>
    <p><strong>${t('graph.name')}:</strong> ${state.name}</p>
    <p><strong>${t('graph.language')}:</strong> ${state.language}</p>
    <p><strong>${t('graph.stats')}:</strong> ${state.nodes.length} / ${state.edges.length}</p>
    <p class="muted">${t('graph.updated')}: ${new Date(state.updatedAt).toLocaleString()}</p>
  `;
  infoRoot.innerHTML = infoHtml;

  const inspectorHtml = `
    <h4>${t('inspector.title')}</h4>
    <ul>
      ${state.nodes.map((node) => `<li>${node.label} <span class="muted">(${node.id})</span></li>`).join('')}
    </ul>
    <h4>${t('form.connection')}</h4>
    <ul>
      ${state.edges
        .map(
          (edge) =>
            `<li>${edge.source} -> ${edge.target} <span class="muted">${edge.label ?? ''}</span></li>`
        )
        .join('')}
    </ul>
  `;
  inspectorRoot.innerHTML = inspectorHtml;

  const nameInput = document.getElementById('graph-name-input') as HTMLInputElement | null;
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = state.name;
  }

  const languageSelect = document.getElementById('graph-language-select') as HTMLSelectElement | null;
  if (languageSelect && languageSelect.value !== state.language) {
    languageSelect.value = state.language;
  }

  updateSelectOptions(state.nodes);
  setUnsavedIndicator(state.dirty ?? false);
  renderGraphCanvas(state);
};

const renderValidationSummary = (result: ValidationResult | null): void => {
  if (!result) {
    validationSummary.innerHTML = '';
    return;
  }
  const errors = result.errors
    .map((err) => `<li style="color:#ef5350;">${err}</li>`)
    .join('');
  const warnings = result.warnings
    .map((warn) => `<li style="color:#ffa726;">${warn}</li>`)
    .join('');
  const okMessage = result.errors.length === 0 ? '<p style="color:#81c784;">Graph is valid.</p>' : '';

  validationSummary.innerHTML = `
    ${okMessage}
    ${errors ? `<ul>${errors}</ul>` : ''}
    ${warnings ? `<ul>${warnings}</ul>` : ''}
  `;
};

const handleMessage = (event: MessageEvent<Message>): void => {
  const message = event.data;
  switch (message.type) {
    case 'setState':
      setToolbarLoading(false);
      renderState(message.payload);
      break;
    case 'toast':
      setToolbarLoading(false);
      showToast(message.payload.kind, message.payload.message);
      break;
    case 'validationResult':
      setToolbarLoading(false);
      renderValidationSummary(message.payload);
      break;
    default:
      break;
  }
};

localeSelect.addEventListener('change', () => {
  const locale = localeSelect.value as Locale;
  vscode.postMessage({ type: 'changeDisplayLanguage', payload: { locale } });
});

buildToolbar();
buildActionsUi();
setupCanvasInteractions();
renderState({
  id: 'placeholder',
  name: 'Loading...',
  language: 'cpp',
  displayLanguage: currentLocale,
  nodes: [],
  edges: [],
  updatedAt: new Date().toISOString(),
  dirty: false
});
renderValidationSummary(null);

window.addEventListener('message', handleMessage);
vscode.postMessage({ type: 'ready' });

