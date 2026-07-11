import { createRoot } from 'react-dom/client'
import React from 'react'
import App from './App'

// Wait for Draw to be defined (loaded as a plugin)
if (typeof Draw !== 'undefined') {
  Draw.loadPlugin((ui: EditorUi) => {
    console.log('[DrawioAgent] Loading sidebar plugin...');
    (window as any).drawioEditorUi = ui;

    // Create container for the React sidebar
    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'drawio-agent-sidebar-root';
    
    // Append container to document body
    document.body.appendChild(sidebarContainer);

    // Mount React App, passing the EditorUi instance
    const root = createRoot(sidebarContainer);
    root.render(
      React.createElement(App, { ui })
    );

    console.log('[DrawioAgent] Sidebar plugin mounted!');
  });
}
