import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { trackQuery } from "@/lib/query-monitor";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  // Supabase pooler requires ?pgbouncer=true to work correctly with prepared statements
  const resolvedUrl = !isLocal && !connectionString.includes("pgbouncer=true")
    ? connectionString + (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true"
    : connectionString;

  const adapter = new PrismaPg({
    connectionString: resolvedUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

// Query methods to monitor for N+1 detection
const MONITORED_OPS = new Set(["findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow", "count"]);

// Lazy Proxy — the real PrismaClient is only created on first property access,
// NOT at module import time. This prevents Vercel build crashes when DATABASE_URL
// is not available during static page collection.
// Additionally wraps model access to detect N+1 patterns in dev mode.
export const prisma = new Proxy({}, {
  get(_: object, prop: string | symbol) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const client = globalForPrisma.prisma;
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    // Wrap model delegates (e.g., prisma.product) to track query operations
    if (value && typeof value === "object" && typeof prop === "string") {
      return new Proxy(value, {
        get(target: object, opProp: string | symbol) {
          const method = (target as Record<string | symbol, unknown>)[opProp];
          if (typeof method === "function" && typeof opProp === "string" && MONITORED_OPS.has(opProp)) {
            return (...args: unknown[]) => {
              const where = args[0] && typeof args[0] === "object" ? (args[0] as Record<string, unknown>).where : undefined;
              const keyFields = where && typeof where === "object" ? Object.keys(where as object) : [];
              trackQuery(prop, opProp, keyFields);
              return (method as (...a: unknown[]) => unknown).apply(target, args);
            };
          }
          return typeof method === "function" ? (method as (...a: unknown[]) => unknown).bind(target) : method;
        },
      });
    }
    return value;
  },
}) as unknown as PrismaClient;
