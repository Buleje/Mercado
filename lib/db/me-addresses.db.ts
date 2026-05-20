import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * MeAddressesDB
 * Audit project-wide 2026-05-19 — migración de /api/me/addresses.
 *
 * Acceso canónico a SavedLocation (direcciones guardadas del customer).
 *
 * NOTA DE SEGURIDAD: SavedLocation no tiene campo `tenantId` en el schema
 * (TD-ADR-085 pendiente). El aislamiento multi-tenant se garantiza mediante
 * el guard explícito `assertCustomerBelongsToTenant` en el route handler,
 * que verifica que el customerPhone pertenezca al tenantId de la sesión
 * antes de llegar a estas queries. Los métodos aquí solo reciben
 * `customerPhone` ya validado.
 *
 * tenantId se recibe en los métodos de write para logging y trazabilidad,
 * aunque no se usa en la query de SavedLocation (que no tiene ese campo).
 * Cuando ADR-085 se implemente, agregar `tenantId` al where de findMany/delete.
 */
export const MeAddressesDB = {
  /**
   * Lista todas las direcciones guardadas del customer.
   * Cross-tenant guard: debe haberse ejecutado ANTES de llamar este método.
   *
   * @param customerPhone teléfono ya validado contra el tenant de la sesión
   */
  async list(customerPhone: string) {
    // eslint-disable-next-line no-restricted-properties -- SavedLocation sin tenantId; cross-tenant guard en route handler.
    return prisma.savedLocation.findMany({
      where: { customerPhone },
      orderBy: { id: "desc" },
      select: {
        id: true,
        location: true,
        reference: true,
      },
    });
  },

  /**
   * Cuenta las direcciones del customer (para límite de 10).
   *
   * @param customerPhone teléfono ya validado contra el tenant de la sesión
   */
  async count(customerPhone: string): Promise<number> {
    // eslint-disable-next-line no-restricted-properties -- SavedLocation sin tenantId; cross-tenant guard en route handler.
    return prisma.savedLocation.count({ where: { customerPhone } });
  },

  /**
   * Crea una nueva dirección guardada.
   *
   * @param tenantId      para logging de trazabilidad
   * @param customerPhone teléfono ya validado contra el tenant de la sesión
   * @param location      dirección textual
   * @param reference     referencia adicional (ej. "puerta azul")
   */
  async create(
    tenantId: string,
    customerPhone: string,
    location: string,
    reference: string,
  ) {
    // eslint-disable-next-line no-restricted-properties -- SavedLocation sin tenantId; cross-tenant guard en route handler.
    const address = await prisma.savedLocation.create({
      data: { customerPhone, location, reference },
      select: { id: true, location: true, reference: true },
    });
    logger.info("[MeAddressesDB.create] address saved", { tenantId, customerPhone: customerPhone.slice(0, 4) + "***" });
    return address;
  },

  /**
   * Verifica propiedad de una dirección (ownership check antes de delete).
   * Retorna el registro si existe y pertenece al customerPhone, o null.
   *
   * @param id            id de la dirección
   * @param customerPhone teléfono ya validado contra el tenant de la sesión
   */
  async findOwned(id: string, customerPhone: string) {
    // eslint-disable-next-line no-restricted-properties -- SavedLocation sin tenantId; cross-tenant guard en route handler.
    return prisma.savedLocation.findFirst({
      where: { id, customerPhone },
    });
  },

  /**
   * Elimina una dirección por id.
   * Ownership debe verificarse con `findOwned` antes de llamar este método.
   *
   * @param id id de la dirección
   */
  async delete(id: string) {
    // eslint-disable-next-line no-restricted-properties -- SavedLocation sin tenantId; ownership verificado por caller via findOwned.
    return prisma.savedLocation.delete({ where: { id } });
  },
};
