/**
 * draw.io PreConfig.js override to inject drawioAgent plugin.
 */
window.urlParams = window.urlParams || {};

// Load the drawio-agent-plugin.js automatically
const existingPlugins = window.urlParams['plugins'] ? window.urlParams['plugins'] + ';' : '';
window.urlParams['plugins'] = existingPlugins + 'js/drawio-agent-plugin.js';
