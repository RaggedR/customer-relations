/**
 * Plugin Loader
 *
 * Scans the /plugins directory for plugin modules and loads them.
 * Each plugin directory should contain an index.ts exporting a CRMPlugin.
 */

import fs from "fs";
import path from "path";
import type { CRMPlugin, CRMEvent, EventHandler } from "./types";

const PLUGINS_DIR = path.resolve(process.cwd(), "plugins");

/** Registry of loaded plugins */
const plugins: Map<string, CRMPlugin> = new Map();

/** Event subscribers */
const eventHandlers: Map<string, EventHandler[]> = new Map();

export function getLoadedPlugins(): CRMPlugin[] {
  return Array.from(plugins.values());
}

export function getPlugin(name: string): CRMPlugin | undefined {
  return plugins.get(name);
}

/**
 * Load all plugins from the /plugins directory.
 * Each subdirectory with an index.ts/index.js is treated as a plugin.
 */
export async function loadPlugins(): Promise<void> {
  if (!fs.existsSync(PLUGINS_DIR)) {
    console.log("[plugins] No plugins directory found, skipping.");
    return;
  }

  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.join(PLUGINS_DIR, entry.name);
    const indexPath = path.join(pluginDir, "index.ts");
    const indexJsPath = path.join(pluginDir, "index.js");

    const entryFile = fs.existsSync(indexPath)
      ? indexPath
      : fs.existsSync(indexJsPath)
        ? indexJsPath
        : null;

    if (!entryFile) {
      console.log(`[plugins] Skipping ${entry.name} — no index file found.`);
      continue;
    }

    try {
      const mod = await import(entryFile);
      const plugin: CRMPlugin = mod.default || mod;

      if (!plugin.name || !plugin.version) {
        console.warn(
          `[plugins] Skipping ${entry.name} — missing name or version.`
        );
        continue;
      }

      // Register the plugin
      plugins.set(plugin.name, plugin);

      // Register event handlers
      if (plugin.eventHandlers) {
        for (const [eventType, handler] of Object.entries(plugin.eventHandlers)) {
          if (!eventHandlers.has(eventType)) {
            eventHandlers.set(eventType, []);
          }
          eventHandlers.get(eventType)!.push(handler);
        }
      }

      console.log(`[plugins] Loaded: ${plugin.name} v${plugin.version}`);
    } catch (error) {
      console.error(`[plugins] Failed to load ${entry.name}:`, error);
    }
  }
}

/**
 * Emit an event to all subscribed plugins.
 */
export async function emitEvent(event: CRMEvent): Promise<void> {
  const handlers = eventHandlers.get(event.type) || [];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (error) {
      console.error(`[plugins] Event handler error for ${event.type}:`, error);
    }
  }
}

/**
 * Run onStartup for all loaded plugins.
 */
export async function startPlugins(): Promise<void> {
  for (const plugin of plugins.values()) {
    if (plugin.onStartup) {
      try {
        await plugin.onStartup();
      } catch (error) {
        console.error(`[plugins] Startup error for ${plugin.name}:`, error);
      }
    }
  }
}
