import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Read-only Prisma client for heavy analytics queries.
 * Uses DATABASE_READONLY_URL (read replica) when available,
 * falls back to DATABASE_URL (primary) transparently.
 */
const globalForReadonly = globalThis as unknown as { prismaReadonly: PrismaClient | undefined };

function createReadonlyClient(): PrismaClient {
  const connectionString = process.env.DATABASE_READONLY_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Neither DATABASE_READONLY_URL nor DATABASE_URL is configured");

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  const resolvedUrl = !isLocal && !connectionString.includes("pgbouncer=true")
    ? connectionString + (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true"
    : connectionString;

  const adapter = new PrismaPg({
    connectionString: resolvedUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prismaReadonly = new Proxy({}, {
  get(_: object, prop: string | symbol) {
    if (!globalForReadonly.prismaReadonly) {
      globalForReadonly.prismaReadonly = createReadonlyClient();
    }
    const client = globalForReadonly.prismaReadonly;
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
}) as unknown as PrismaClient;
