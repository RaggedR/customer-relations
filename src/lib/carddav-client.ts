/**
 * CardDAV Client
 *
 * Push/update/delete contacts on external CardDAV servers
 * (Google Contacts, Apple iCloud, Radicale, etc.).
 *
 * All operations are fire-and-forget — failures are logged but
 * never block the HTTP response.
 */

import { DAVClient } from "tsdav";
import { generateVCard } from "./vcard";
import type { Row } from "./parsers";

interface ContactConnection {
  id: number;
  provider: string;
  addressbook_url: string;
  access_token: string | null;
  refresh_token: string | null;
}

/**
 * Push a contact (patient or nurse) to an external CardDAV server.
 */
export async function pushContact(
  connection: ContactConnection,
  entityName: string,
  record: Row
): Promise<void> {
  try {
    const client = await getClient(connection);
    const addressBooks = await client.fetchAddressBooks();
    if (addressBooks.length === 0) return;

    const addressBook = addressBooks[0];
    const vcard = generateVCard(entityName, record);
    const uid = `${entityName}-${record.id}@customer-relations`;

    await client.createVCard({
      addressBook,
      filename: `${uid}.vcf`,
      vCardString: vcard,
    });
  } catch (err) {
    console.error(
      `CardDAV push failed for connection ${connection.id}:`,
      (err as Error).message
    );
  }
}

/**
 * Update a contact on an external CardDAV server.
 */
export async function updateContact(
  connection: ContactConnection,
  entityName: string,
  record: Row
): Promise<void> {
  try {
    const client = await getClient(connection);
    const addressBooks = await client.fetchAddressBooks();
    if (addressBooks.length === 0) return;

    const addressBook = addressBooks[0];
    const uid = `${entityName}-${record.id}@customer-relations`;
    const vcard = generateVCard(entityName, record);

    const vcards = await client.fetchVCards({ addressBook });
    const existing = vcards.find(
      (v) => v.data?.includes(uid) || v.url.includes(uid)
    );

    if (existing) {
      await client.updateVCard({
        vCard: { ...existing, data: vcard },
      });
    } else {
      await client.createVCard({
        addressBook,
        filename: `${uid}.vcf`,
        vCardString: vcard,
      });
    }
  } catch (err) {
    console.error(
      `CardDAV update failed for connection ${connection.id}:`,
      (err as Error).message
    );
  }
}

/**
 * Delete a contact from an external CardDAV server.
 */
export async function deleteContact(
  connection: ContactConnection,
  entityName: string,
  id: number
): Promise<void> {
  try {
    const client = await getClient(connection);
    const addressBooks = await client.fetchAddressBooks();
    if (addressBooks.length === 0) return;

    const addressBook = addressBooks[0];
    const uid = `${entityName}-${id}@customer-relations`;

    const vcards = await client.fetchVCards({ addressBook });
    const existing = vcards.find(
      (v) => v.data?.includes(uid) || v.url.includes(uid)
    );

    if (existing) {
      await client.deleteVCard({ vCard: existing });
    }
  } catch (err) {
    console.error(
      `CardDAV delete failed for connection ${connection.id}:`,
      (err as Error).message
    );
  }
}

// ── Internal ──────────────────────────────────────────────

async function getClient(conn: ContactConnection): Promise<DAVClient> {
  const isGoogle = conn.provider === "google";

  const client = new DAVClient({
    serverUrl: isGoogle
      ? "https://www.googleapis.com/.well-known/carddav"
      : conn.addressbook_url,
    credentials: isGoogle
      ? {
          tokenUrl: "https://oauth2.googleapis.com/token",
          refreshToken: conn.refresh_token ?? undefined,
          accessToken: conn.access_token ?? undefined,
        }
      : {
          username: "",
          password: conn.access_token ?? "",
        },
    authMethod: isGoogle ? "Oauth" : "Basic",
    defaultAccountType: "carddav",
  });

  await client.login();
  return client;
}
