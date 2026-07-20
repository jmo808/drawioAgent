declare interface DrawPlugin {
  [key: string]: any;
}

declare const Draw: {
  loadPlugin: (callback: (ui: EditorUi) => void) => void;
};

declare class mxGraphModel {
  beginUpdate(): void;
  endUpdate(): void;
}

declare class mxGraph {
  model: mxGraphModel;
}

declare class Editor {
  graph: mxGraph;
  getGraphXml(): string;
  setGraphXml(xml: Element | string, force?: boolean): void;
}

declare class EditorUi {
  editor: Editor;
  sidebar: any;
  constructor(editor: Editor, container?: HTMLElement);
}

interface Window {
  Draw?: typeof Draw;
  mxGraph?: typeof mxGraph;
  mxGraphModel?: typeof mxGraphModel;
  EditorUi?: typeof EditorUi;
}
