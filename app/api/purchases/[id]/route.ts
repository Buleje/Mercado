import { NextRequest, NextResponse } from "next/server";
import { revalidateTenantTag } from "@/lib/cache";
import { z } from "zod";
import { PurchasesDB, type DbPurchaseOrder } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { claveDeDia, diaCorto, esperaEntrega } from "@/lib/compras/ciclo-oc";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { getRecibidoAcumulado, saldoPendiente } from "@/lib/compras/recibido-acumulado";
import { costoUnitarioReal, totalDeOrden } from "@/lib/compras/totales-oc";
import { OrdenCambioDeEstadoError, TRANSICIONES_OC, mensajeOrdenCambiada, transicionValida, type EstadoOC } from "@/lib/compras/estados-oc";
import { getFaltantesAcreditados } from "@/lib/compras/aplicar-credito-recepcion";
import { esServicio } from "@/lib/compras/naturaleza";
import { cerrarCuentaDeOrdenCancelada, type CuentaAlCancelar } from "@/lib/db/purchases-cancelar.db";

const DiferenciaSchema = z.object({
  productoId: z.number().int().positive(),
  cantidadEsperada: z.number().min(0),
  cantidadRecibida: z.number().min(0),
  motivo: z.string().max(500).optional(),
});

// Las transiciones viven en lib/compras/estados-oc.ts — la misma tabla que
// alimenta el <select> de la pantalla. 2026-08-11: la copia que había acá
// enrutaba `pendiente` hacia "emitida" y `recibido` hacia "pagada", dos
// estados que no existen en el enum PurchaseStatus ni los aceptaba el Zod de
// abajo; medido, todo cambio de estado desde `pendiente` devolvía 422 salvo
// cancelar.

const PatchSchema = z.object({
  // Alineado con el enum PurchaseStatus de Prisma (lib/db/misc.db.ts).
  // `auto_generated` es estado de origen, no destino: el admin la aprueba
  // pasándola a pendiente, no vuelve a marcarla como auto-generada.
  status: z.enum(["pendiente", "parcial", "recibido", "cancelado"]).optional(),
  notes: z.string().max(1000).optional(),
  diferencias: z.array(DiferenciaSchema).optional(),
  // ADR-377 — datos que se completan después de emitir: la factura llega con
  // la mercadería, el flete se sabe cuando el mototaxi cobra.
  invoiceNumber: z.string().max(60).optional(),
  invoiceType: z.enum(["factura", "boleta", "guia", "ninguno"]).optional(),
  igvIncluded: z.boolean().optional(),
  flete: z.number().min(0).optional(),
  otrosCostos: z.number().min(0).optional(),
  cancelReason: z.string().max(300).optional(),
  // C14: el proveedor avisó otro día. "" = sin fecha prometida.
  deliveryDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const po = await withDbRetry(() => PurchasesDB.getById(auth.tenantId, id));
    if (!po) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    return NextResponse.json(po);
  } catch (e) {
    logger.error("[purchases/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/**
 * Reparte un flete cargado DESPUÉS de recibir la mercadería (ADR-377).
 *
 * El costo de esos productos se calculó sin ese gasto. No se puede rehacer la
 * historia —el promedio ponderado ya se mezcló con otras compras y parte del
 * lote quizá ya se vendió—, así que el sobrecosto se reparte entre las
 * unidades que TODAVÍA están en stock: es la revaluación de inventario que
 * haría un contador cuando la factura del flete llega tarde.
 *
 * Si no queda stock de un producto, no hay nada que revaluar: esa mercadería
 * ya salió y su costo histórico quedó como quedó. Se dice, no se disimula.
 */
async function revaluarPorSobrecosto(
  tenantId: string,
  oc: DbPurchaseOrder,
  deltaSobrecosto: number,
  username: string,
): Promise<number> {
  const subtotal = oc.items.reduce((s, i) => s + i.quantity * toNumOrZero(i.unitCost), 0);
  if (subtotal <= 0) return 0;

  let revaluados = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of oc.items) {
      const product = await tx.product.findFirst({ where: { id: item.productId, tenantId } });
      if (!product) continue;

      const stockActual = product.stock ?? 0;
      if (stockActual <= 0) continue; // ya se vendió: nada que revaluar

      const valorLinea = item.quantity * toNumOrZero(item.unitCost);
      const parteDeLaLinea = deltaSobrecosto * (valorLinea / subtotal);
      const ajustePorUnidad = parteDeLaLinea / stockActual;

      const costoAnterior = toNumOrZero(product.costPrice);
      const costoNuevo = Math.max(0, costoAnterior + ajustePorUnidad);

      await tx.product.updateMany({ where: { id: product.id, tenantId }, data: { costPrice: costoNuevo } });
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: product.id,
          type: "ajuste",
          quantity: 0, // no cambia el stock: cambia lo que vale
          previousStock: stockActual,
          newStock: stockActual,
          reference: oc.id,
          notes:
            `Costo de traer la mercadería en la OC ${oc.id}: ` +
            `S/${parteDeLaLinea.toFixed(2)} repartidos entre ${stockActual} en stock ` +
            `(S/${costoAnterior.toFixed(2)} → S/${costoNuevo.toFixed(2)} por unidad)`,
          createdBy: username,
        },
      });
      revaluados++;
    }
  });
  return revaluados;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "purchases-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json();
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const existing = await PurchasesDB.getById(auth.tenantId, id);
    if (!existing) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    // F5: Validar transición de estado
    const statusChanged = parsed.data.status && parsed.data.status !== existing.status;
    if (statusChanged && parsed.data.status) {
      if (!transicionValida(existing.status, parsed.data.status)) {
        const allowed = TRANSICIONES_OC[existing.status as EstadoOC] ?? [];
        return NextResponse.json(
          { error: `Transición inválida: ${existing.status} → ${parsed.data.status}. Permitidas: [${allowed.join(", ")}]` },
          { status: 422 }
        );
      }
    }

    // C14: la fecha prometida sólo se mueve mientras se espera la mercadería.
    const cambiaEntrega =
      parsed.data.deliveryDate !== undefined &&
      parsed.data.deliveryDate !== (claveDeDia(existing.deliveryDate) ?? "");
    if (cambiaEntrega && !esperaEntrega(existing.status)) {
      return NextResponse.json(
        { error: "Esta orden ya no espera mercadería: su fecha de entrega no se cambia." },
        { status: 422 },
      );
    }

    // 10-10: recibir mueve stock y costo. Una orden cruzada (proveedor o
    // productos de otro negocio) no se recibe; cancelarla sí se puede.
    if (statusChanged && (parsed.data.status === "recibido" || parsed.data.status === "parcial")) {
      const pertenencia = await PurchasesDB.pertenencia(auth.tenantId, id);
      if (pertenencia.proveedorAjeno || pertenencia.productosAjenos.length > 0) {
        return NextResponse.json(
          {
            error: "Esta orden tiene un proveedor o productos de otro negocio: no se puede recibir. Cancélala y crea una nueva.",
            proveedorAjeno: pertenencia.proveedorAjeno,
            productosAjenos: pertenencia.productosAjenos,
          },
          { status: 403 },
        );
      }
    }

    // diferencias no es campo de DbPurchaseOrder — se procesa más abajo.
    const { diferencias: _diferencias, ...campos } = parsed.data;

    // ADR-377: quién y cuándo. `deliveryDate` es lo que el proveedor prometió;
    // esto es lo que pasó de verdad, y la diferencia entre ambas es la que
    // mide si el proveedor cumple.
    // Corregir «¿los costos ya incluían IGV?» después de emitida la orden tiene
    // que mover el total: el flag se podía cambiar acá y el número quedaba
    // igual, así que la orden decía una cosa y su casilla, otra.
    const cambiaIgv =
      parsed.data.igvIncluded !== undefined && parsed.data.igvIncluded !== existing.igvIncluded;
    const totalRecalculado = cambiaIgv
      ? totalDeOrden({
          subtotal: existing.items.reduce((s, i) => s + i.quantity * toNumOrZero(i.unitCost), 0),
          discountPct: existing.discount ?? 0,
          igvIncluded: parsed.data.igvIncluded,
        })
      : null;

    const patch: Partial<DbPurchaseOrder> = {
      ...campos,
      ...(totalRecalculado != null ? { total: totalRecalculado } : {}),
      ...(statusChanged && parsed.data.status === "recibido"
        ? { receivedDate: new Date().toISOString(), receivedBy: auth.username }
        : {}),
    };

    // ADR-377 · backfill: cargarle el flete a una orden YA recibida. El costo
    // de esos productos se calculó sin ese gasto, así que hay que revaluar el
    // inventario que queda. Se mide el delta ANTES de escribir.
    const sobrecostoAntes = (existing.flete ?? 0) + (existing.otrosCostos ?? 0);
    const sobrecostoDespues =
      (parsed.data.flete ?? existing.flete ?? 0) + (parsed.data.otrosCostos ?? existing.otrosCostos ?? 0);
    const deltaSobrecosto = sobrecostoDespues - sobrecostoAntes;
    const revaluarInventario =
      !statusChanged && existing.status === "recibido" && Math.abs(deltaSobrecosto) > 0.005;

    // Revisión 17-10 (punto 4): el cambio de estado sólo se escribe si la orden
    // sigue como se leyó. Dos «Marcar recibida entera» a la vez sumaban dos
    // veces lo que faltaba; ahora el segundo encuentra «recibido» y no escribe.
    let updated: Awaited<ReturnType<typeof PurchasesDB.update>>;
    try {
      updated = statusChanged
        ? await PurchasesDB.update(auth.tenantId, id, patch, { siEstadoEs: existing.status })
        : await PurchasesDB.update(auth.tenantId, id, patch);
    } catch (e) {
      if (e instanceof OrdenCambioDeEstadoError) {
        return NextResponse.json({ error: mensajeOrdenCambiada(e.estado, "cambiar"), estado: e.estado }, { status: 409 });
      }
      throw e;
    }

    if (!updated) return NextResponse.json({ error: "Error updating" }, { status: 500 });

    /**
     * Cancelar una orden a crédito tiene que cerrar la deuda que abrió.
     *
     * El POST crea un `Payable` automático cuando la forma de pago es
     * `credito_*`. Al cancelar, la deuda sin pagos baja a lo que vale lo que
     * llegó en buen estado y, si no llegó nada, se borra (revisión 17-10: antes
     * se borraba entera aunque hubiera llegado mercadería). Con pagos NO se
     * toca: esa plata salió de verdad. Regla en `cerrarCuentaDeOrdenCancelada`.
     */
    let cuenta: CuentaAlCancelar | null = null;
    if (statusChanged && parsed.data.status === "cancelado") {
      cuenta = await cerrarCuentaDeOrdenCancelada(auth.tenantId, updated);
      if (cuenta) {
        revalidateTenantTag(auth.tenantId, "payables");
        const corto = id.slice(-6);
        const texto = cuenta.resultado === "anulada"
          ? `Orden ${corto} cancelada: se anuló su cuenta por pagar (no llegó nada)`
          : cuenta.resultado === "ajustada"
            ? `Orden ${corto} cancelada: la cuenta por pagar bajó de ${cuenta.montoAntes.toFixed(2)} a ${cuenta.montoDespues.toFixed(2)} (lo que llegó)`
            : cuenta.resultado === "sin_cambio"
              ? `Orden ${corto} cancelada: la cuenta por pagar se queda (vale lo que llegó)`
              : `Orden ${corto} cancelada: la cuenta por pagar se conservó porque ya tenía pagos`;
        logActivity("Actualizar", "compra", texto, id, auth.username)
          .catch((err) => logger.warn("[purchases/id] activity log failed", { err: String(err) }));
      }
    }

    let productosRevaluados = 0;
    if (revaluarInventario) {
      productosRevaluados = await revaluarPorSobrecosto(
        auth.tenantId, updated, deltaSobrecosto, auth.username,
      ).catch((err) => {
        logger.error("[purchases/id] revaluación por flete falló", { err: String(err), id });
        return 0;
      });
    }

    if (statusChanged && updated.status === "recibido") {
      // Build a map of diferencias by productoId for quick lookup
      const difMap = new Map<number, { cantidadRecibida: number; motivo?: string }>();
      if (parsed.data.diferencias) {
        for (const dif of parsed.data.diferencias) {
          difMap.set(dif.productoId, { cantidadRecibida: dif.cantidadRecibida, motivo: dif.motivo });
        }
      }

      try {

        await prisma.$transaction(async (tx) => {
          // 2026-08-11: descontar lo que las recepciones ya metieron al stock.
          // Sin esto, cerrar por el <select> una OC con recepción parcial
          // sumaba la cantidad ENTERA otra vez (medido: OC de 10 con 4
          // recibidos terminaba en stock 14).
          const yaRecibido = await getRecibidoAcumulado(tx, auth.tenantId, updated.id, updated.items);
          // Revisión 17-10 (punto 6): lo marcado «no llegará» en una recepción ya
          // se acreditó; no es mercadería que entre al cerrar la orden.
          const noLlegara = await getFaltantesAcreditados(
            tx, auth.tenantId, updated.id,
            updated.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost })),
            "",
          );
          // ADR-377: flete + otros costos se reparten por valor entre los items.
          const subtotalOrden = updated.items.reduce((s, i) => s + i.quantity * toNumOrZero(i.unitCost), 0);
          const sobrecostos = (updated.flete ?? 0) + (updated.otrosCostos ?? 0);

          for (const item of updated.items) {
            // `findFirst` con tenantId, igual que el camino de revaluación de
            // arriba (línea ~86). Con `findUnique({ where: { id } })` este
            // camino —cerrar la OC desde el `<select>` de estado— buscaba el
            // producto por id a secas y después le escribía stock y costo: un
            // `productId` de otro negocio en los items de la orden alcanzaba
            // para moverle el inventario a un tercero.
            const product = await tx.product.findFirst({
              where: { id: item.productId, tenantId: auth.tenantId },
            });
            // Un servicio (flete, mano de obra) no tiene stock (revisión 17-10, punto 8).
            if (!product || esServicio(product)) continue;

            // Con diferencias declaradas manda lo declarado; si no, lo que
            // falte por recibir según las recepciones ya registradas, menos lo
            // que el proveedor ya no mandará.
            const dif = difMap.get(item.productId);
            const quantityReceived = dif
              ? dif.cantidadRecibida
              : saldoPendiente(item.quantity, (yaRecibido.get(item.productId) ?? 0) + (noLlegara.get(item.productId) ?? 0));

            if (quantityReceived <= 0) continue; // Nothing received for this item

            const prevStock = product.stock ?? 0;
            const newStock = prevStock + quantityReceived;

            // TD-018: item.unitCost y product.costPrice son Decimal.
            // ADR-377: el costo lleva la parte de flete que le toca — si no,
            // el margen que muestra el sistema es optimista por unidad.
            const unitCostNum = costoUnitarioReal(item, subtotalOrden, sobrecostos);
            let avgCost = unitCostNum;
            if (prevStock > 0) {
              const oldVal = prevStock * toNumOrZero(product.costPrice);
              const newVal = quantityReceived * unitCostNum;
              avgCost = (oldVal + newVal) / newStock;
            }

            // Update Product
            // Dueño en el WHERE (regla 8), no sólo en el `findFirst` de arriba.
            await tx.product.updateMany({
               where: { id: product.id, tenantId: auth.tenantId },
               data: { stock: newStock, costPrice: avgCost }
            });

            // Insert Movement atomically
            const diffNote = dif
              ? ` (esperado: ${item.quantity}, recibido: ${quantityReceived}${dif.motivo ? `, motivo: ${dif.motivo}` : ""})`
              : "";
            await tx.inventoryMovement.create({
              data: {
                tenantId: auth.tenantId,
                productId: product.id,
                type: "compra",
                quantity: quantityReceived,
                previousStock: prevStock,
                newStock: newStock,
                reference: updated.id,
                notes: `Recepción de OC ${updated.id}${diffNote}`,
                createdBy: auth.username,
              }
            });
          }
        });

        // Store diferencias as JSON note on the purchase
        if (parsed.data.diferencias && parsed.data.diferencias.length > 0) {
          const difNotes = parsed.data.diferencias
            .map((d) => `Producto ${d.productoId}: esperado ${d.cantidadEsperada}, recibido ${d.cantidadRecibida}${d.motivo ? ` (${d.motivo})` : ""}`)
            .join("; ");
          const currentNotes = updated.notes ?? "";
          const newNotes = currentNotes
            ? `${currentNotes}\n[DIFERENCIAS] ${difNotes}`
            : `[DIFERENCIAS] ${difNotes}`;
          await PurchasesDB.update(auth.tenantId, id, { notes: newNotes } as Record<string, unknown>);
        }
      } catch (err) {
        logger.error("[purchases/id] transaction failed", { err: err instanceof Error ? err.message : String(err) });
        return NextResponse.json({ error: "Fallo de transacción al actualizar stock" }, { status: 500 });
      }
    }

    if (cambiaEntrega) {
      const antes = claveDeDia(existing.deliveryDate);
      const despues = parsed.data.deliveryDate || null;
      logActivity(
        "Actualizar",
        "compra",
        `Entrega de la orden ${id.slice(-6)}: ${antes ? diaCorto(antes) : "sin fecha"} → ${despues ? diaCorto(despues) : "sin fecha"}`,
        id,
        auth.username,
      ).catch((err) => logger.warn("[purchases/id] activity log failed", { err: String(err) }));
    }

    if (statusChanged) {
       logActivity("Actualizar", "compra", `Estado de orden ${id.slice(-6)} cambiado a ${updated.status}`, id, auth.username).catch((err) => logger.warn("[purchases/id] activity log failed", { err: String(err) }));
    }

    // Este camino también mueve stock y costo con `tx.product.update` fuera de
    // ProductsDB, así que la invalidación corre por cuenta del endpoint: si no,
    // el Inventario muestra lo de antes de recibir.
    revalidateTenantTag(auth.tenantId, "products");

    // `productosRevaluados` deja que la pantalla diga qué pasó con el costo,
    // en vez de cambiarlo en silencio.
    return NextResponse.json({
      ...updated,
      ...(revaluarInventario ? { productosRevaluados } : {}),
      // Que la pantalla pueda decir qué pasó con la deuda al cancelar.
      ...(cuenta ? { cuentaPorPagar: cuenta.resultado, montoAntes: cuenta.montoAntes, montoDespues: cuenta.montoDespues } : {}),
    });
  } catch (e) {
    logger.error("[purchases/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "purchases-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await PurchasesDB.delete(auth.tenantId, id);
    logActivity("Eliminar", "compra", `Orden de compra ${id.slice(-6)} eliminada`, id, auth.username).catch((err) => logger.warn("[purchases/id] activity log failed", { err: String(err) }));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    logger.error("[purchases/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
