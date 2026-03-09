import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const adapter = new PrismaPg({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 600_000,       // keep idle connections alive for 10 minutes
    connectionTimeoutMillis: 10_000,
    keepAlive: true,                   // send TCP keepalives so idle connections aren't silently killed
    keepAliveInitialDelayMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
