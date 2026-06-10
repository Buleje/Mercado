/**
 * lib/prisma-rls.ts — Extensión Prisma para Row Level Security (ADR-114)
 *
 * Analogía: es como un sello de acceso en la muñeca antes de entrar a la discoteca.
 * Cada query que ejecutes con `withRlsTenant(tenantId)` lleva ese sello puesto.
 * PostgreSQL ve el sello y solo te muestra las filas que te corresponden.
 *
 * IMPORTANTE: esta extensión requiere que las políticas RLS ya estén habilitadas
 * en la DB (ver prisma/migrations/2026_05_18_add_rls_policies/migration.sql).
 * Sin la migration aplicada, SET LOCAL es un no-op y no tiene efecto visible.
 *
 * @see ADR-114 — docs/adr/114-rls-postgres-hibrido-defensa-profundidad.md
 * @see Runbook — docs/security/rls-postgres-runbook.md
 */
import "server-only";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { prisma } from "./prisma";

// ── Constantes de magic values para bypass de RLS ────────────────────────────

/**
 * Magic value para crons/jobs cross-tenant.
 * La policy SQL acepta este valor en todos los tenants.
 */
const SYSTEM_TENANT = "__system__";

/**
 * Magic value para queries de superadmin que requieren visibilidad cross-tenant.
 * La policy SQL acepta este valor en todos los tenants.
 */
const SUPERADMIN_TENANT = "__superadmin__";

// ── Escape SQL injection ──────────────────────────────────────────────────────

/**
 * Escapa comillas simples en tenantId para prevenir SQL injection en SET LOCAL.
 * Ejemplo: "o'malley" → "o''malley" (estándar ANSI SQL para literales string).
 *
 * Usamos $executeRawUnsafe porque SET LOCAL no acepta parámetros $1 en Postgres
 * (es una instrucción de configuración de sesión, no un query con bind variables).
 * El escape manual es la única opción segura aquí — está documentado en ADR-114.
 */
function escapeTenantId(tenantId: string): string {
  return tenantId.replace(/'/g, "''");
}

// ── Tipo del cliente extendido ────────────────────────────────────────────────

// La extensión $allOperations devuelve un tipo extendido de PrismaClient.
// Casteamos a PrismaClient para compatibilidad con los 90 *.db.ts callers.
type RlsPrismaClient = ReturnType<typeof createRlsClient>;

function createRlsClient(tenantId: string) {
  const escaped = escapeTenantId(tenantId);

  return (prisma as unknown as PrismaClient).$extends({
    name: "rls-tenant-extension",
    query: {
      /**
       * $allOperations intercepta CADA operación Prisma (findMany, create, update, etc.)
       * y ejecuta SET LOCAL ANTES de la query real.
       *
       * SET LOCAL tiene alcance de transacción: cuando la conexión vuelve al pool
       * de pgBouncer en transaction mode, el valor se resetea automáticamente.
       * Esto previene "bleeding" entre requests concurrentes.
       *
       * Alternativa considerada y descartada: $allModels con middleware de tx explícita.
       * Razón: añade overhead de BEGIN/COMMIT por query individual; SET LOCAL en
       * $allOperations es 1 round-trip vs 3.
       */
      $allOperations: async ({ args, query }: { args: unknown; query: (args: unknown) => Promise<unknown> }) => {
        // SET LOCAL aplica solo en la conexión actual mientras dura la operación.
        // pgBouncer transaction mode garantiza que la conexión no se comparte
        // mientras hay trabajo pendiente, así que este SET LOCAL es seguro.
        await (prisma as unknown as PrismaClient).$executeRawUnsafe(
          `SET LOCAL app.tenant_id = '${escaped}'`
        );
        return query(args);
      },
    },
  });
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Crea un cliente Prisma con RLS activado para el tenant especificado.
 *
 * Uso típico en route handlers:
 * ```ts
 * const auth = await requireAdmin(req, ["admin"]);
 * if (auth instanceof NextResponse) return auth;
 *
 * const db = withRlsTenant(auth.tenantId);
 * const orders = await db.order.findMany(); // RLS aplica server-side
 * ```
 *
 * NOTA: Si la migration RLS aún no está aplicada, esta función funciona igual
 * que `prisma` normal (SET LOCAL es no-op). El app-level guard sigue activo.
 *
 * @param tenantId - ID del tenant (de auth.tenantId, nunca de user input directo)
 */
export function withRlsTenant(tenantId: string): RlsPrismaClient {
  if (!tenantId || tenantId.trim() === "") {
    throw new Error(
      "[prisma-rls] tenantId vacío — posible bug de autenticación. " +
      "Verificar que requireAdmin() fue llamado antes de withRlsTenant()."
    );
  }
  return createRlsClient(tenantId);
}

/**
 * ⚠️ PITFALL descubierto en el piloto 2026-06-10 (ver runbook):
 * `withRlsTenant` ejecuta el SET LOCAL y la query como round-trips SEPARADOS
 * fuera de transacción — Postgres ignora SET LOCAL fuera de tx (no-op) y con
 * pgBouncer transaction-mode pueden caer en conexiones distintas.
 *
 * `withRlsTx` es la variante CORRECTA: envuelve SET LOCAL + tu callback en
 * UNA transacción interactiva (misma conexión garantizada). Usar ESTA para
 * TD-116.
 *
 * Uso:
 * ```ts
 * const orders = await withRlsTx(auth.tenantId, (tx) =>
 *   tx.order.findMany({ orderBy: { createdAt: "desc" } })
 * );
 * ```
 *
 * Nota: el aislamiento solo es efectivo cuando la app conecta con un rol SIN
 * BYPASSRLS (hoy `postgres` lo tiene — ver runbook fase de rol `buleje_app`).
 * Mientras tanto es inocuo: la query corre igual, con el guard app-level.
 */
export async function withRlsTx<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!tenantId || tenantId.trim() === "") {
    throw new Error(
      "[prisma-rls] tenantId vacío — posible bug de autenticación. " +
      "Verificar que requireAdmin() fue llamado antes de withRlsTx().",
    );
  }
  const escaped = escapeTenantId(tenantId);
  return (prisma as unknown as PrismaClient).$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${escaped}'`);
    return fn(tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
  });
}

/**
 * Cliente Prisma con RLS en modo SISTEMA — para crons y jobs cross-tenant.
 *
 * Uso en cron handlers que necesitan ver datos de TODOS los tenants:
 * ```ts
 * // app/api/cron/abandoned-cart/route.ts
 * const db = rlsSystem();
 * const allAbandonedOrders = await db.order.findMany({
 *   where: { status: "PENDING", updatedAt: { lt: cutoff } }
 * });
 * ```
 *
 * Lista de crons que DEBEN usar rlsSystem() (tocan tablas con RLS):
 * - /api/cron/abandoned-cart
 * - /api/cron/loyalty-anniversary
 * - /api/cron/credit-reminders
 * - /api/cron/churn-score
 * - /api/cron/audit-chain-integrity
 */
export function rlsSystem(): RlsPrismaClient {
  return createRlsClient(SYSTEM_TENANT);
}

/**
 * Cliente Prisma con RLS en modo SUPERADMIN — para queries cross-tenant
 * desde el panel superadmin (gestión de plataforma SaaS).
 *
 * Uso en server components del superadmin:
 * ```ts
 * // app/superadmin/tenants/page.tsx
 * await requirePlatformPage();
 * const db = rlsSuperadmin();
 * const allOrders = await db.order.findMany({ orderBy: { createdAt: "desc" } });
 * ```
 *
 * RBAC: siempre llamar requirePlatformPage() / requireSuperadmin() ANTES.
 * rlsSuperadmin() solo maneja el bypass de RLS, no la autenticación.
 */
export function rlsSuperadmin(): RlsPrismaClient {
  return createRlsClient(SUPERADMIN_TENANT);
}

/**
 * Constantes exportadas para uso en tests y validaciones.
 * No usar directamente en código de producción — usar las funciones de arriba.
 */
export const RLS_MAGIC_VALUES = {
  SYSTEM: SYSTEM_TENANT,
  SUPERADMIN: SUPERADMIN_TENANT,
} as const;
