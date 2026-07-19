export const getGraphXml = (ui: EditorUi): string => {
  if (!ui || !ui.editor) return ''
  const xmlNode = ui.editor.getGraphXml()
  if (!xmlNode) return ''
  if (typeof xmlNode === 'string') {
    return xmlNode
  }
  const mxUtils = (window as any).mxUtils
  if (mxUtils && typeof mxUtils.getXml === 'function') {
    return mxUtils.getXml(xmlNode)
  }
  return new XMLSerializer().serializeToString(xmlNode)
}

export const setGraphXml = (ui: EditorUi, xml: string): void => {
  if (!ui || !ui.editor) return
  
  let xmlNode: any
  const mxUtils = (window as any).mxUtils
  if (mxUtils && typeof mxUtils.parseXml === 'function') {
    const doc = mxUtils.parseXml(xml)
    xmlNode = doc.documentElement
  } else {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    xmlNode = doc.documentElement
  }

  const graph = ui.editor.graph
  const model = graph?.model
  
  if (model) {
    model.beginUpdate()
    try {
      ui.editor.setGraphXml(xmlNode)
    } finally {
      model.endUpdate()
    }
  } else {
    ui.editor.setGraphXml(xmlNode)
  }
}

export const setGraphXmlPreservingViewport = (ui: EditorUi, xml: string): void => {
  if (!ui || !ui.editor || !ui.editor.graph) {
    setGraphXml(ui, xml)
    return
  }

  const graph = ui.editor.graph as any
  const view = graph.view
  if (!view || typeof view.getScale !== 'function' || typeof view.getTranslate !== 'function') {
    setGraphXml(ui, xml)
    return
  }

  const scale = view.getScale()
  const translate = view.getTranslate() || { x: 0, y: 0 }

  setGraphXml(ui, xml)

  if (typeof view.setScale === 'function') {
    view.setScale(scale)
  }
  if (typeof view.setTranslate === 'function') {
    view.setTranslate(translate.x, translate.y)
  }
  if (typeof graph.refresh === 'function') {
    graph.refresh()
  }
}

export const getTheme = (): 'dark' | 'light' => {
  const isDark = document.body.classList.contains('geDarkPage') ||
                 document.body.classList.contains('geDark') ||
                 document.body.classList.contains('dark') ||
                 (window as any).mxClient?.IS_DARK
  return isDark ? 'dark' : 'light'
}

export const getDiagramStats = (ui: EditorUi): { nodeCount: number; edgeCount: number } => {
  if (!ui || !ui.editor || !ui.editor.graph || !ui.editor.graph.model) {
    return { nodeCount: 0, edgeCount: 0 }
  }

  const model = ui.editor.graph.model as any
  const cells = model.cells || {}
  
  let nodeCount = 0
  let edgeCount = 0

  for (const id in cells) {
    const cell = cells[id]
    if (cell.vertex) nodeCount++
    if (cell.edge) edgeCount++
  }

  return { nodeCount, edgeCount }
}

export const subscribeToGraphChanges = (
  ui: EditorUi, 
  onChange: (xml: string) => void, 
  debounceMs: number = 500
): () => void => {
  if (!ui || !ui.editor || !ui.editor.graph || !ui.editor.graph.model) {
    return () => {}
  }

  let timeoutId: ReturnType<typeof setTimeout>
  
  const listener = () => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      onChange(getGraphXml(ui))
    }, debounceMs)
  }
  
  const model = ui.editor.graph.model as any
  const mxEvent = (window as any).mxEvent
  
  if (model.addListener && mxEvent && mxEvent.CHANGE) {
    model.addListener(mxEvent.CHANGE, listener)
    
    return () => {
      clearTimeout(timeoutId)
      model.removeListener(listener)
    }
  }
  
  return () => {}
}
