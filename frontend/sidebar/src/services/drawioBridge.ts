export const getGraphXml = (ui: EditorUi): string => {
  if (!ui || !ui.editor) return ''
  return ui.editor.getGraphXml()
}

export const setGraphXml = (ui: EditorUi, xml: string): void => {
  if (!ui || !ui.editor) return
  const graph = ui.editor.graph
  const model = graph?.model
  
  if (model) {
    model.beginUpdate()
    try {
      ui.editor.setGraphXml(xml)
    } finally {
      model.endUpdate()
    }
  } else {
    ui.editor.setGraphXml(xml)
  }
}

export const getTheme = (): 'dark' | 'light' => {
  const isDark = document.body.classList.contains('geDarkPage') ||
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
