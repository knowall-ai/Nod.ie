// Public configuration is provided by the server or the isolated Electron bridge.
window.NodieConfig = window.NodieConfigSchema.normalize(window.ENV_CONFIG || {});
window.CONFIG = window.NodieConfig;
