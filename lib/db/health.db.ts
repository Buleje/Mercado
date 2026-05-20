import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * HealthDB
 *
 * Audit project-wide 2026-05-19 — sonda de liveness para /api/health.
 *
 * No tiene tenantId porque es un probe de infraestructura global,
 * no de datos de negocio. El caller (withCircuitBreaker) envuelve
 * este método con circuit-breaker y manejo de latencia.
 */
export const HealthDB = {
  /**
   * Ejecuta `SELECT 1` para verificar conectividad a la base de datos.
   * Lanza excepción si la conexión falla — el caller la captura.
   */
  async ping(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  },
};
