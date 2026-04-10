/**
 * Plugin System Types
 *
 * Defines the interface that all CRM plugins must implement.
 * Uses Strategy pattern — plugins are interchangeable.
 * Uses Observer pattern — plugins subscribe to events.
 */

import { NextRequest, NextResponse } from "next/server";

/** An ingestion source that can extract entity data from raw input */
export interface IngestionSource {
  name: string;
  description: string;
  /** Accepted input types */
  accepts: ("text" | "file" | "url")[];
  /** Process raw input and return extracted entities */
  process(input: {
    type: "text" | "file" | "url";
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    entities: Array<{
      entityName: string;
      data: Record<string, unknown>;
    }>;
  }>;
}

/** A UI extension that adds components to the app */
export interface UIExtension {
  name: string;
  /** Where to inject the component */
  location: "dashboard" | "sidebar" | "entity-detail" | "toolbar";
  /** React component (loaded dynamically) */
  componentPath: string;
}

/** An API route contributed by a plugin */
export interface APIRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  handler: (request: NextRequest) => Promise<NextResponse>;
}

/** Events that plugins can subscribe to */
export type CRMEvent =
  | { type: "entity:created"; entityName: string; data: Record<string, unknown> }
  | { type: "entity:updated"; entityName: string; data: Record<string, unknown> }
  | { type: "entity:deleted"; entityName: string; id: number }
  | { type: "schema:loaded"; }
  | { type: "app:started"; };

export type EventHandler = (event: CRMEvent) => Promise<void>;

/** The main plugin interface */
export interface CRMPlugin {
  name: string;
  version: string;
  description?: string;

  /** Data ingestion capabilities */
  ingestionSources?: IngestionSource[];

  /** UI components to inject */
  uiExtensions?: UIExtension[];

  /** API routes to register */
  apiRoutes?: APIRoute[];

  /** Event subscriptions */
  eventHandlers?: Record<string, EventHandler>;

  /** Called when the plugin is first installed */
  onInstall?(): Promise<void>;

  /** Called when the plugin is removed */
  onUninstall?(): Promise<void>;

  /** Called on each app startup */
  onStartup?(): Promise<void>;
}
