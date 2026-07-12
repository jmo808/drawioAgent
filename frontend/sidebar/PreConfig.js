/**
 * draw.io PreConfig.js override to inject drawioAgent plugin.
 */
window.ALLOW_CUSTOM_PLUGINS = true;
window.urlParams = window.urlParams || {};

// Inject the plugin script directly to bypass draw.io's registry checks
var script = document.createElement('script');
script.src = '/draw/js/drawio-agent-plugin.js';
script.defer = true;
var t = document.getElementsByTagName('script')[0];
if (t != null) {
  t.parentNode.insertBefore(script, t);
} else {
  document.head.appendChild(script);
}
