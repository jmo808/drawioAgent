import { createRoot } from 'react-dom/client';
import React from 'react';
import { App } from './App';


function initPlugin() {
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
    return true;
  }
  return false;
}

if (!initPlugin()) {
  console.log('[DrawioAgent] Draw not defined yet, polling...');
  
  const interval = setInterval(() => {
    if (initPlugin()) {
      console.log('[DrawioAgent] Draw found via polling.');
      clearInterval(interval);
    }
  }, 50);
}
