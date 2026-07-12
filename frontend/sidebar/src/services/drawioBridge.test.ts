import { describe, test, expect, vi } from 'vitest'
import { getGraphXml, setGraphXml, getTheme, getDiagramStats } from './drawioBridge'

describe('drawioBridge', () => {
  test('getGraphXml calls ui.editor.getGraphXml', () => {
    const mockGetGraphXml = vi.fn().mockReturnValue('<mxfile>test-xml</mxfile>')
    const mockUi = {
      editor: {
        getGraphXml: mockGetGraphXml
      }
    } as any

    const result = getGraphXml(mockUi)
    expect(mockGetGraphXml).toHaveBeenCalled()
    expect(result).toBe('<mxfile>test-xml</mxfile>')
  })

  test('setGraphXml calls ui.editor.setGraphXml within transaction', () => {
    const mockSetGraphXml = vi.fn()
    const mockBegin = vi.fn()
    const mockEnd = vi.fn()
    
    const mockUi = {
      editor: {
        setGraphXml: mockSetGraphXml,
        graph: {
          model: {
            beginUpdate: mockBegin,
            endUpdate: mockEnd
          }
        }
      }
    } as any

    setGraphXml(mockUi, '<mxfile>new-xml</mxfile>')
    expect(mockBegin).toHaveBeenCalled()
    expect(mockSetGraphXml).toHaveBeenCalled()
    const calledArg = mockSetGraphXml.mock.calls[0][0]
    expect(calledArg.tagName).toBe('mxfile')
    expect(mockEnd).toHaveBeenCalled()
  })

  test('getTheme detects dark theme from class name', () => {
    document.body.classList.add('geDarkPage')
    expect(getTheme()).toBe('dark')

    document.body.classList.remove('geDarkPage')
    expect(getTheme()).toBe('light')
  })

  test('getDiagramStats counts vertices and edges in cells list', () => {
    const mockCells = {
      '1': { vertex: true },
      '2': { vertex: true },
      '3': { edge: true }
    }
    const mockUi = {
      editor: {
        graph: {
          model: {
            cells: mockCells
          }
        }
      }
    } as any

    const stats = getDiagramStats(mockUi)
    expect(stats.nodeCount).toBe(2)
    expect(stats.edgeCount).toBe(1)
  })
})
