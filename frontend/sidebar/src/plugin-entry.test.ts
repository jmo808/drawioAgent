import { describe, test, expect, vi } from 'vitest'

describe('plugin-entry', () => {
  test('should load plugin when Draw is defined', async () => {
    const mockLoadPlugin = vi.fn()
    const mockUi = {} as any

    // Mock global Draw
    (global as any).Draw = {
      loadPlugin: mockLoadPlugin
    } as any

    (global as any).EditorUi = vi.fn().mockImplementation(() => mockUi) as any

    // Import plugin-entry to trigger execution
    await import('./plugin-entry')

    expect(mockLoadPlugin).toHaveBeenCalled()
    
    // Call the callback to simulate draw.io loading it
    const callback = mockLoadPlugin.mock.calls[0][0]
    callback(mockUi)

    // Check if the sidebar root was appended to the document body
    const rootEl = document.getElementById('drawio-agent-sidebar-root')
    expect(rootEl).not.toBeNull()
  })
})
