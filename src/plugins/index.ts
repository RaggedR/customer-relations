export type {
  CRMPlugin,
  IngestionSource,
  UIExtension,
  APIRoute,
  CRMEvent,
  EventHandler,
} from "./types";
export {
  loadPlugins,
  startPlugins,
  emitEvent,
  getLoadedPlugins,
  getPlugin,
} from "./loader";
