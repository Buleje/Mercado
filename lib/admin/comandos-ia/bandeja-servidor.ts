import "server-only";
/**
 * «A quién escribir» — lee la base (solo lectura, lib/db, tenantId primero) y
 * arma la bandeja con las reglas puras de `candidatos.ts`.
 *
 * La usan dos rutas: el GET de la bandeja y el POST de redactar. Redactar NO
 * acepta montos del navegador: vuelve a leer todo aquí y se queda solo con los
 * ids pedidos, así el borrador lleva el saldo de este momento.
 */
import { FiadosDB } from "@/lib/db/fiados.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { SalesDB } from "@/lib/db/sales.db";
import { RemindersDB } from "@/lib/db/reminders.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { listEnabledSpecializations } from "@/lib/specializations";
import { limaDateKey } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { armarBandeja, type AdelantoEntrada, type Candidato } from "./candidatos";

/** Ventana de compras para medir el ritmo de cada cliente. */
const DIAS_DE_COMPRAS = 180;
const TOPE_VENTAS = 3000;

export interface BandejaLeida {
  hoy: string;
  candidatos: Candidato[];
  negocio: string;
  /** Qué fuentes se miraron (para el ⓘ y para decir qué quedó fuera). */
  fuentes: { fiados: number; clientesConCompras: number; adelantos: boolean; seguimientos: number };
}

async function adelantosAbiertos(tenantId: string): Promise<{ filas: AdelantoEntrada[]; activo: boolean }> {
  const specs = await listEnabledSpecializations(tenantId);
  if (!specs.some((s) => s.startsWith("spec:forestal:"))) return { filas: [], activo: false };
  const lista = await AdelantosDB.list(tenantId, { status: "ABIERTO" });
  return {
    activo: true,
    // Descuento por planilla se cobra solo al pagar: no hay que escribirle.
    filas: lista.filter((a) => a.modalidad !== "DESCUENTO_PLANILLA").map((a) => ({
      id: a.id,
      beneficiarioId: a.beneficiarioId,
      nombre: a.beneficiario?.nombre ?? "Sin nombre",
      telefono: a.beneficiario?.telefono ?? null,
      saldo: a.saldoPendiente,
      moneda: a.moneda,
      fecha: a.fechaAdelanto,
    })),
  };
}

export async function leerBandeja(tenantId: string): Promise<BandejaLeida> {
  const hoy = limaDateKey();
  const desde = new Date(Date.now() - DIAS_DE_COMPRAS * 86_400_000);

  const [fiados, clientes, ventas, recordatorios, adelantos, ajustes] = await Promise.all([
    FiadosDB.list(tenantId),
    CustomersDB.getAll(tenantId),
    SalesDB.getAllFilteredPaginated({ tenantId, page: 1, limit: TOPE_VENTAS, from: desde }),
    RemindersDB.list(tenantId),
    adelantosAbiertos(tenantId).catch((err) => {
      logger.warn("[comandos-ia/bandeja] adelantos no disponibles", { err: String(err) });
      return { filas: [] as AdelantoEntrada[], activo: false };
    }),
    SettingsDB.get(tenantId),
  ]);

  const compras = ventas.items
    .filter((v) => v.customerPhone)
    .map((v) => ({ telefono: v.customerPhone as string, fecha: limaDateKey(v.createdAt) }));

  const candidatos = armarBandeja({
    hoy,
    fiados,
    nombres: new Map(clientes.filter((c) => c.name).map((c) => [c.phone, c.name])),
    compras,
    adelantos: adelantos.filas,
    recordatorios: recordatorios.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      status: r.status,
      dueDate: limaDateKey(r.dueDate),
    })),
  });

  return {
    hoy,
    candidatos,
    negocio: ajustes.businessName?.trim() || "",
    fuentes: {
      fiados: fiados.length,
      clientesConCompras: new Set(compras.map((c) => c.telefono)).size,
      adelantos: adelantos.activo,
      seguimientos: candidatos.filter((c) => c.tipo === "seguimiento").length,
    },
  };
}
