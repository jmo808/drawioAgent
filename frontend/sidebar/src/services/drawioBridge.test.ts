import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGraphXml, setGraphXml, setGraphXmlPreservingViewport, getTheme, getDiagramStats, subscribeToGraphChanges } from './drawioBridge';

describe('drawioBridge', () => {
  test('getGraphXml calls ui.editor.getGraphXml', () => {
    const mockGetGraphXml = vi.fn().mockReturnValue('<mxfile>test-xml</mxfile>');
    const mockUi = {
      editor: {
        getGraphXml: mockGetGraphXml
      }
    } as unknown as EditorUi;

    const result = getGraphXml(mockUi);
    expect(mockGetGraphXml).toHaveBeenCalled();
    expect(result).toBe('<mxfile>test-xml</mxfile>');
  });

  test('setGraphXml calls ui.editor.setGraphXml within transaction', () => {
    const mockSetGraphXml = vi.fn();
    const mockBegin = vi.fn();
    const mockEnd = vi.fn();
    
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
    } as unknown as EditorUi;

    setGraphXml(mockUi, '<mxfile>new-xml</mxfile>');
    expect(mockBegin).toHaveBeenCalled();
    expect(mockSetGraphXml).toHaveBeenCalled();
    const calledArg = mockSetGraphXml.mock.calls[0][0] as Element;
    expect(calledArg.tagName).toBe('mxfile');
    expect(mockEnd).toHaveBeenCalled();
  });

  test('setGraphXmlPreservingViewport saves and restores scale/translate', () => {
    const mockSetGraphXml = vi.fn();
    const mockBegin = vi.fn();
    const mockEnd = vi.fn();
    const mockGetScale = vi.fn().mockReturnValue(1.5);
    const mockGetTranslate = vi.fn().mockReturnValue({ x: 10, y: 20 });
    const mockSetScale = vi.fn();
    const mockSetTranslate = vi.fn();
    const mockRefresh = vi.fn();

    const mockUi = {
      editor: {
        setGraphXml: mockSetGraphXml,
        graph: {
          refresh: mockRefresh,
          model: {
            beginUpdate: mockBegin,
            endUpdate: mockEnd
          },
          view: {
            getScale: mockGetScale,
            getTranslate: mockGetTranslate,
            setScale: mockSetScale,
            setTranslate: mockSetTranslate
          }
        }
      }
    } as unknown as EditorUi;

    setGraphXmlPreservingViewport(mockUi, '<mxfile>new-xml</mxfile>');

    expect(mockGetScale).toHaveBeenCalled();
    expect(mockGetTranslate).toHaveBeenCalled();
    expect(mockSetScale).toHaveBeenCalledWith(1.5);
    expect(mockSetTranslate).toHaveBeenCalledWith(10, 20);
    expect(mockRefresh).toHaveBeenCalled();
  });

  test('getTheme detects dark theme from class name', () => {
    document.body.classList.add('geDarkPage');
    expect(getTheme()).toBe('dark');

    document.body.classList.remove('geDarkPage');
    expect(getTheme()).toBe('light');
  });

  test('getDiagramStats counts vertices and edges in cells list', () => {
    const mockCells = {
      '1': { vertex: true },
      '2': { vertex: true },
      '3': { edge: true }
    };
    const mockUi = {
      editor: {
        graph: {
          model: {
            cells: mockCells
          }
        }
      }
    } as unknown as EditorUi;

    const stats = getDiagramStats(mockUi);
    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
  });

  describe('subscribeToGraphChanges', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (window as unknown as { mxEvent: { CHANGE: string } }).mxEvent = { CHANGE: 'change' };
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test('debounces changes and calls onChange with xml', () => {
      const mockAddListener = vi.fn();
      const mockRemoveListener = vi.fn();
      const mockGetGraphXml = vi.fn().mockReturnValue('<xml/>');
      
      const mockUi = {
        editor: {
          getGraphXml: mockGetGraphXml,
          graph: {
            model: {
              addListener: mockAddListener,
              removeListener: mockRemoveListener
            }
          }
        }
      } as unknown as EditorUi;

      const onChange = vi.fn();
      const unsubscribe = subscribeToGraphChanges(mockUi, onChange, 500);

      expect(mockAddListener).toHaveBeenCalledWith('change', expect.any(Function));
      const listener = mockAddListener.mock.calls[0][1] as () => void;

      // Trigger 3 changes rapidly
      listener();
      listener();
      listener();

      // Before timer fires, shouldn't be called
      vi.advanceTimersByTime(200);
      expect(onChange).not.toHaveBeenCalled();

      // After 500ms since LAST call
      vi.advanceTimersByTime(300); // total 500
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('<xml/>');

      // Clean up
      unsubscribe();
      expect(mockRemoveListener).toHaveBeenCalledWith(listener);
    });
  });
});
