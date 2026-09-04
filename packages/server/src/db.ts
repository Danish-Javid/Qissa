/**
 * Single shared PrismaClient for the process.
 *
 * Prisma clients hold a connection pool; constructing one per request would
 * exhaust the database. Tests may call `disconnectDb` in teardown.
 */
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

/** Lazily construct the singleton. The explicit url comes from the
 *  validated env so a missing DATABASE_URL fails with our own message,
 *  not Prisma's. */
export function db(databaseUrl?: string): PrismaClient {
  if (!client) {
    client = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : new PrismaClient();
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
