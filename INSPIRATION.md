# Inspiration — Open Source CRM Projects

Projects researched before building our schema-driven CRM. None had the exact combination we want (schema.yaml config + plugin system + CardDAV + AI ingestion), but each offers lessons.

---

## Top Tier — Most Relevant

### Twenty CRM
- **GitHub:** https://github.com/twentyhq/twenty
- **Stars:** ~43,400
- **Stack:** NestJS, React, PostgreSQL, Redis, Nx monorepo
- **What it does:** Fully customizable open-source CRM with workflow automation, role-based access, email/calendar integration.
- **What we can learn:** Custom objects/fields system, workflow automation patterns, community governance at scale.
- **Why we didn't fork:** Uses NestJS (not Next.js), much heavier than we need, no CardDAV.

### NextCRM
- **GitHub:** https://github.com/pdovhomilja/nextcrm-app
- **Stack:** Next.js 16, React 19, Prisma 7.5, PostgreSQL + pgvector, OpenAI + Claude
- **What it does:** Full CRM with activity tracking, AI enrichment, invoicing, documents, email client. 127 tools via MCP server.
- **What we can learn:** Closest to our stack. AI integration patterns. Prisma schema for 15+ modules.
- **Why we didn't fork:** No schema-driven config, no CardDAV, no plugin system.

### NocoBase
- **GitHub:** https://github.com/nocobase/nocobase
- **Stars:** ~22,100
- **Stack:** TypeScript, plugin-based microkernel architecture
- **What it does:** Data model-driven no-code/low-code platform. Plugin system similar to WordPress.
- **What we can learn:** Best plugin architecture of any project reviewed. Data-model-first design is close to our schema.yaml approach.
- **Why we didn't fork:** General-purpose platform, not CRM-specific. Over-engineered for our needs.

---

## Worth Watching

### Erxes
- **GitHub:** https://github.com/erxes/erxes
- **Stars:** ~3,900
- **Stack:** Node.js, TypeScript, GraphQL Federation + tRPC, MongoDB, React 18
- **What it does:** Unified marketing, sales, operations, customer support. Microservices architecture.
- **What we can learn:** Plugin ecosystem design. Omnichannel integration patterns.

### Steedos Platform
- **GitHub:** https://github.com/steedos/steedos-platform
- **Stars:** ~1,600
- **Stack:** TypeScript, React, Tailwind CSS, Node.js
- **What it does:** Schema-driven platform with ObjectQL metadata protocol. Auto-generates GraphQL/REST APIs from schema. Text-to-schema AI modeling.
- **What we can learn:** Closest to our schema-driven philosophy. ObjectStack architecture is metadata-first.

### Frappe CRM
- **GitHub:** https://github.com/frappe/crm
- **Stars:** ~2,500
- **Stack:** Python (Frappe Framework), Vue.js 3
- **What it does:** CRM built on Frappe with Twilio, WhatsApp, ERPNext integrations.
- **What we can learn:** Custom fields/tables system. Mature app extension model.
- **Not our stack:** Python backend.

### QRev
- **GitHub:** https://github.com/qrev-ai/qrev
- **Stars:** ~360
- **Stack:** React, TypeScript, Node.js, MongoDB, LangChain
- **What it does:** AI-first CRM with superagent architecture.
- **What we can learn:** AI-driven workflow patterns.

---

## CardDAV / Contact Sync Libraries

### Nephele (chosen)
- **GitHub:** https://github.com/sciactive/nephele
- **What:** Pluggable WebDAV/CardDAV/CalDAV server for Node.js + Express
- **License:** Apache-2.0
- **Why chosen:** Runs in-process with our Next.js app, no extra containers, custom storage adapters.

### tsdav
- **GitHub:** https://github.com/natelindev/tsdav
- **What:** TypeScript WebDAV/CalDAV/CardDAV client library
- **Useful for:** Testing our CardDAV server, or syncing with external CardDAV servers in the future.

### Fennel
- **GitHub:** https://github.com/andris9/fennel
- **What:** Lightweight CardDAV/CalDAV server in pure JavaScript, Sequelize storage.
- **Alternative to Nephele** if we need something simpler.

### Radicale
- **GitHub:** https://github.com/Kozea/Radicale
- **What:** Mature Python CardDAV/CalDAV server.
- **Considered but rejected:** Would require a separate Docker container and Python dependency.

---

## Architecture References

- **HubSpot Architecture:** Four-layer data model (Objects → Records → Properties → Associations). 9,000+ deployable units. [Reference](https://www.fastslowmotion.com/hubspot-architecture-saas-revenue/)
- **CRM Microservices Patterns:** Domain-driven services, event-driven communication, multi-tenant SaaS, event sourcing. [Reference](https://dzone.com/articles/scalable-crm-architecture-and-data-modeling)
- **CalConnect CardDAV Implementations:** Comprehensive list of CardDAV servers. [Reference](https://devguide.calconnect.org/CardDAV/Server-Implementations/)
