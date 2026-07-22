interface MxUtils {
  getXml(node: Node): string;
  parseXml(xml: string): Document;
}

interface MxClient {
  IS_DARK?: boolean;
}

interface MxEvent {
  CHANGE: string;
}

interface GraphModelMock {
  cells?: Record<string, { vertex?: boolean; edge?: boolean }>;
  addListener?(name: string, f: () => void): void;
  removeListener?(f: () => void): void;
}

interface ViewMock {
  getScale(): number;
  getTranslate(): { x: number; y: number };
  setScale(scale: number): void;
  setTranslate(x: number, y: number): void;
}

interface GraphMock {
  view: ViewMock;
  refresh(): void;
}

export const getGraphXml = (ui: EditorUi): string => {
  if (!ui || !ui.editor) {
    return '';
  }
  const xmlNode = ui.editor.getGraphXml();
  if (!xmlNode) {
    return '';
  }
  if (typeof xmlNode === 'string') {
    return xmlNode;
  }
  const mxUtils = (window as unknown as { mxUtils?: MxUtils }).mxUtils;
  if (mxUtils && typeof mxUtils.getXml === 'function') {
    return mxUtils.getXml(xmlNode);
  }
  return new XMLSerializer().serializeToString(xmlNode);
};

export const setGraphXml = (ui: EditorUi, xml: string): void => {
  if (!ui || !ui.editor) {
    return;
  }
  
  let xmlNode: Element;
  const mxUtils = (window as unknown as { mxUtils?: MxUtils }).mxUtils;
  if (mxUtils && typeof mxUtils.parseXml === 'function') {
    const doc = mxUtils.parseXml(xml);
    xmlNode = doc.documentElement;
  } else {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    xmlNode = doc.documentElement;
  }

  const graph = ui.editor.graph;
  const model = graph?.model;
  
  if (model) {
    model.beginUpdate();
    try {
      ui.editor.setGraphXml(xmlNode);
    } finally {
      model.endUpdate();
    }
  } else {
    ui.editor.setGraphXml(xmlNode);
  }
};

let isApplyingRemoteUpdate = false;

export const setGraphXmlPreservingViewport = (ui: EditorUi, xml: string): void => {
  if (!ui || !ui.editor || !ui.editor.graph) {
    setGraphXml(ui, xml);
    return;
  }

  const graph = ui.editor.graph as unknown as GraphMock;
  const view = graph.view;
  if (!view || typeof view.getScale !== 'function' || typeof view.getTranslate !== 'function') {
    setGraphXml(ui, xml);
    return;
  }

  const scale = view.getScale();
  const translate = view.getTranslate() || { x: 0, y: 0 };

  isApplyingRemoteUpdate = true;
  try {
    setGraphXml(ui, xml);

    if (typeof view.setScale === 'function') {
      view.setScale(scale);
    }
    if (typeof view.setTranslate === 'function') {
      view.setTranslate(translate.x, translate.y);
    }
    if (typeof graph.refresh === 'function') {
      graph.refresh();
    }
  } finally {
    isApplyingRemoteUpdate = false;
  }
};

export const getTheme = (): 'dark' | 'light' => {
  const isDark = document.body.classList.contains('geDarkPage') ||
                 document.body.classList.contains('geDark') ||
                 document.body.classList.contains('dark') ||
                 (window as unknown as { mxClient?: MxClient }).mxClient?.IS_DARK;
  return isDark ? 'dark' : 'light';
};

export const getDiagramStats = (ui: EditorUi): { nodeCount: number; edgeCount: number } => {
  if (!ui || !ui.editor || !ui.editor.graph || !ui.editor.graph.model) {
    return { nodeCount: 0, edgeCount: 0 };
  }

  const model = ui.editor.graph.model as unknown as GraphModelMock;
  const cells = model.cells || {};
  
  let nodeCount = 0;
  let edgeCount = 0;

  for (const id in cells) {
    if (Object.prototype.hasOwnProperty.call(cells, id)) {
      const cell = cells[id];
      if (cell.vertex) {
        nodeCount++;
      }
      if (cell.edge) {
        edgeCount++;
      }
    }
  }

  return { nodeCount, edgeCount };
};

export const subscribeToGraphChanges = (
  ui: EditorUi, 
  onChange: (xml: string) => void, 
  debounceMs = 500
): () => void => {
  if (!ui || !ui.editor || !ui.editor.graph || !ui.editor.graph.model) {
    return () => {};
  }

  let timeoutId: ReturnType<typeof setTimeout>;
  
  const listener = () => {
    if (isApplyingRemoteUpdate) {
      return;
    }
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      onChange(getGraphXml(ui));
    }, debounceMs);
  };
  
  const model = ui.editor.graph.model as unknown as GraphModelMock;
  const mxEvent = (window as unknown as { mxEvent?: MxEvent }).mxEvent;
  
  if (model.addListener && mxEvent && mxEvent.CHANGE) {
    model.addListener(mxEvent.CHANGE, listener);
    
    return () => {
      clearTimeout(timeoutId);
      if (model.removeListener) {
        model.removeListener(listener);
      }
    };
  }
  
  return () => {};
};

export interface CanvasCoordinates {
  canvasX: number;
  canvasY: number;
}

export interface ScreenCoordinates {
  screenX: number;
  screenY: number;
}

export const getGraphContainerBounds = (ui?: EditorUi): DOMRect | null => {
  if (ui && ui.editor && ui.editor.graph && (ui.editor.graph as any).container) {
    return (ui.editor.graph as any).container.getBoundingClientRect();
  }
  const container = document.querySelector('.geDiagramContainer') || document.querySelector('.geStage') || document.querySelector('svg');
  return container ? container.getBoundingClientRect() : null;
};

export const screenToCanvasCoordinates = (ui: EditorUi | undefined, clientX: number, clientY: number): CanvasCoordinates | null => {
  const bounds = getGraphContainerBounds(ui);
  if (!bounds) return { canvasX: clientX, canvasY: clientY };

  let scale = 1;
  let translate = { x: 0, y: 0 };

  if (ui && ui.editor && ui.editor.graph) {
    const graph = ui.editor.graph as any;
    const view = typeof graph.getView === 'function' ? graph.getView() : graph.view;
    if (view) {
      if (typeof view.getScale === 'function') scale = view.getScale() || 1;
      if (typeof view.getTranslate === 'function') translate = view.getTranslate() || { x: 0, y: 0 };
    }
  }

  const canvasX = (clientX - bounds.left - (translate.x * scale)) / scale;
  const canvasY = (clientY - bounds.top - (translate.y * scale)) / scale;
  return { canvasX, canvasY };
};

export const canvasToScreenCoordinates = (ui: EditorUi | undefined, canvasX: number, canvasY: number): ScreenCoordinates | null => {
  const bounds = getGraphContainerBounds(ui);
  if (!bounds) return { screenX: canvasX, screenY: canvasY };

  let scale = 1;
  let translate = { x: 0, y: 0 };

  if (ui && ui.editor && ui.editor.graph) {
    const graph = ui.editor.graph as any;
    const view = typeof graph.getView === 'function' ? graph.getView() : graph.view;
    if (view) {
      if (typeof view.getScale === 'function') scale = view.getScale() || 1;
      if (typeof view.getTranslate === 'function') translate = view.getTranslate() || { x: 0, y: 0 };
    }
  }

  const screenX = bounds.left + (translate.x * scale) + (canvasX * scale);
  const screenY = bounds.top + (translate.y * scale) + (canvasY * scale);
  return { screenX, screenY };
};
