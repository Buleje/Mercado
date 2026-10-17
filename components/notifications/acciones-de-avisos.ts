/**
 * «Para atender ahora» agrupado por lo que hay que HACER (M08, noche 17-10):
 * «Cuadrar la caja», «Cobrar 3», «Revisar 2 comprobantes», «Reponer 5». Cada
 * grupo dice cuántos son, desde cuándo, a quién le toca, cómo se resuelve y
 * lleva al lugar donde se resuelve (o al registro que lo originó, si es uno).
 *
 * Orden por impacto (pedido del PDF): caja pendiente, cobros, pagos,
 * papeles, stock, pedidos. Dos fuentes:
 *  - el ESTADO de hoy (stock bajo, pedidos pendientes, caja abierta,
 *    comprobantes rechazados): es la cifra verdadera y manda;
 *  - los avisos SIN LEER que dejó el sistema (un fiado vencido, una
 *    diferencia de caja): se cuentan sólo si no hay estado, y una vez por
 *    registro (`entityId`), así cinco recordatorios del mismo fiado son 1.
 *
 * Puro: el hook (`use-acciones-de-avisos`) trae lo que falta y el permiso.
 */
import type { CategoriaId } from "./notificaciones-categorias";

export type AccionId = "caja" | "cobrar" | "pagar" | "comprobantes" | "documentos" | "reponer" | "vencen" | "pedidos";

export interface DestinoAccion {
  tab: string;
  vista?: string;
  sub?: string;
}

export interface DefAccion {
  id: AccionId;
  categoria: CategoriaId;
  rotulo: (n: number) => string;
  /** Cómo se resuelve, en una línea. */
  como: string;
  /** A quién le toca si el registro no dice un responsable. */
  quien: string;
  destino: DestinoAccion;
  /** `type` de los avisos guardados que caen acá. */
  tipos: readonly string[];
  /** `id` de las alertas del estado de hoy (`use-alertas-consolidadas`). */
  alertas: readonly string[];
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** En orden de impacto: el primero es el que más plata o clientes pone en juego. */
export const ACCIONES: readonly DefAccion[] = [
  {
    id: "caja",
    categoria: "plata",
    rotulo: (n) => (n === 1 ? "Cuadrar la caja" : `Cuadrar ${n} cajas`),
    como: "Cuenta el efectivo y cierra el turno; si no cuadra, anota por qué.",
    quien: "Quien atiende la caja",
    destino: { tab: "ventas-caja", vista: "caja-registradora", sub: "cuadrar" },
    tipos: ["DIFERENCIA_CAJA", "TURNO_SIN_CERRAR", "arqueo", "cash_register_anomaly"],
    alertas: [],
  },
  {
    id: "cobrar",
    categoria: "plata",
    rotulo: (n) => `Cobrar ${n}`,
    como: "Escríbele o llámale y anota el abono en Cobranza.",
    quien: "Quien cobra los fiados",
    destino: { tab: "ventas-caja", vista: "cuentas-cobrar", sub: "cobranza" },
    tipos: ["FIADO_REMINDER", "FIADO_VENCIDO", "ADELANTO_VENCIDO", "CREDIT_REMINDER"],
    alertas: [],
  },
  {
    id: "pagar",
    categoria: "plata",
    rotulo: (n) => `Pagar ${n} ${plural(n, "deuda", "deudas")}`,
    como: "Paga o acuerda otra fecha con el proveedor.",
    quien: "El dueño o el encargado",
    destino: { tab: "compras", vista: "cuentas-por-pagar" },
    tipos: ["PROVEEDOR_VENCIDO"],
    alertas: ["pagos-vencidos"],
  },
  {
    id: "comprobantes",
    categoria: "plata",
    rotulo: (n) => `Revisar ${n} ${plural(n, "comprobante", "comprobantes")}`,
    como: "Corrige lo que SUNAT observó o espera su respuesta; no emitas otro.",
    quien: "Quien emite boletas y facturas",
    destino: { tab: "facturacion", vista: "seguimiento", sub: "pendientes" },
    tipos: [],
    alertas: [],
  },
  {
    id: "documentos",
    categoria: "sistema",
    rotulo: (n) => `Revisar ${n} ${plural(n, "documento", "documentos")}`,
    como: "Renueva el que vence o apruébalo en el Archivo.",
    quien: "Quien lleva los papeles",
    destino: { tab: "documentos" },
    tipos: ["DOCUMENTO_VENCIMIENTO", "DOCUMENTO_APROBACION"],
    alertas: [],
  },
  {
    id: "reponer",
    categoria: "inventario",
    rotulo: (n) => `Reponer ${n}`,
    como: "Pide lo que falta antes de quedarte sin nada.",
    quien: "Almacén",
    destino: { tab: "inventario", vista: "stock" },
    tipos: ["STOCK_CRITICO"],
    alertas: ["stock-bajo"],
  },
  {
    id: "vencen",
    categoria: "inventario",
    rotulo: (n) => `Vender ${n} por vencer`,
    como: "Ponlos en oferta o retíralos antes de que venzan.",
    quien: "Almacén",
    destino: { tab: "inventario", vista: "lotes" },
    tipos: [],
    alertas: ["vencimiento-critico", "vencimiento-pronto"],
  },
  {
    id: "pedidos",
    categoria: "pedidos",
    rotulo: (n) => `Atender ${n} ${plural(n, "pedido", "pedidos")}`,
    como: "Confírmalos o despáchalos: el cliente está esperando.",
    quien: "Quien despacha",
    destino: { tab: "pedidos", vista: "tablero" },
    tipos: ["marketplace_order"],
    alertas: ["pedidos-pendientes"],
  },
];

/** Una alerta del estado de hoy (lo mínimo de `AlertaAhora`). */
export interface AlertaDeEstado {
  id: string;
  severity: "critical" | "warning";
  title: string;
  cantidad?: number;
}

/** Un aviso guardado (lo mínimo de `NotificationItem`). */
export interface AvisoGuardado {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  readAt?: string | null;
  actionUrl?: string | null;
  entityId?: string | null;
  severity?: "HIGH" | "MEDIUM" | "LOW";
}

/** Estado que el hook trae aparte (la caja abierta, los comprobantes pendientes). */
export interface EstadoExtra {
  accion: AccionId;
  cantidad: number;
  titulo: string;
  /** ISO: desde cuándo está así. */
  desde?: string | null;
  urgente?: boolean;
  responsable?: string | null;
}

export interface GrupoAccion {
  id: AccionId;
  categoria: CategoriaId;
  rotulo: string;
  cantidad: number;
  urgente: boolean;
  como: string;
  /** El responsable que trae el registro o, si no, a quién le toca. */
  quien: string;
  destino: DestinoAccion;
  /** El registro que lo originó, si es uno solo y está en el panel. */
  registro: string | null;
  /** ISO. `desde` = desde cuándo está así (estado); `ultimo` = el aviso más nuevo. */
  fecha: { iso: string; es: "desde" | "ultimo" } | null;
  /** Lo que agrupa, en sus palabras (hasta 3). */
  detalle: string[];
}

const esDelPanel = (url: string | null | undefined): url is string => !!url && url.startsWith("/admin");

const masViejo = (a: string | null, b: string | null | undefined) => (!b ? a : !a || b < a ? b : a);
const masNuevo = (a: string | null, b: string) => (!a || b > a ? b : a);

/** Hasta 3 textos distintos; el que se repite lleva cuántos son: «Documento por vencer (2)». */
function sinRepetir(textos: readonly string[]): string[] {
  const cuenta = new Map<string, number>();
  for (const t of textos) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  return [...cuenta].slice(0, 3).map(([t, n]) => (n > 1 ? `${t} (${n})` : t));
}

/**
 * Los grupos con algo para hacer, en orden de impacto. Las alertas que no son
 * de ningún grupo (recordatorios) vuelven en `sueltas` para mostrarse igual.
 */
export function agruparPorAccion<A extends AlertaDeEstado>(
  alertas: readonly A[],
  avisos: readonly AvisoGuardado[],
  extra: readonly EstadoExtra[] = [],
): { grupos: GrupoAccion[]; sueltas: A[] } {
  const usadas = new Set<string>();
  const grupos: GrupoAccion[] = [];

  for (const def of ACCIONES) {
    const deEstado = alertas.filter((a) => def.alertas.includes(a.id));
    const deExtra = extra.filter((e) => e.accion === def.id && e.cantidad > 0);
    deEstado.forEach((a) => usadas.add(a.id));

    const sinLeer = avisos.filter((n) => !n.readAt && def.tipos.includes(n.type));
    // Una vez por registro: los recordatorios repetidos del mismo fiado son uno,
    // y el resumen diario sin registro («Adelantos vencidos por cobrar», uno
    // por día) también: se reconoce por su tipo y su título.
    const porRegistro = new Map<string, AvisoGuardado>();
    for (const n of sinLeer) {
      const clave = n.entityId || `${n.type}|${n.title}`;
      const previo = porRegistro.get(clave);
      if (!previo || n.createdAt > previo.createdAt) porRegistro.set(clave, n);
    }
    const unicos = [...porRegistro.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const enEstado =
      deEstado.reduce((s, a) => s + (a.cantidad ?? 1), 0) + deExtra.reduce((s, e) => s + e.cantidad, 0);
    const cantidad = enEstado > 0 ? enEstado : unicos.length;
    if (cantidad === 0) continue;

    const desde = deExtra.reduce<string | null>((f, e) => masViejo(f, e.desde), null);
    const ultimo = unicos.reduce<string | null>((f, n) => masNuevo(f, n.createdAt), null);
    const fecha = desde ? { iso: desde, es: "desde" as const } : ultimo ? { iso: ultimo, es: "ultimo" as const } : null;

    const responsable = deExtra.find((e) => e.responsable)?.responsable ?? null;
    const unSoloAviso = enEstado === 0 && unicos.length === 1 ? unicos[0] : null;

    grupos.push({
      id: def.id,
      categoria: def.categoria,
      rotulo: def.rotulo(cantidad),
      cantidad,
      urgente:
        deEstado.some((a) => a.severity === "critical") ||
        deExtra.some((e) => e.urgente) ||
        (enEstado === 0 && unicos.some((n) => n.severity === "HIGH")),
      como: def.como,
      quien: responsable ?? def.quien,
      destino: def.destino,
      registro: unSoloAviso && esDelPanel(unSoloAviso.actionUrl) ? unSoloAviso.actionUrl : null,
      fecha,
      detalle: sinRepetir(enEstado > 0 ? [...deExtra.map((e) => e.titulo), ...deEstado.map((a) => a.title)] : unicos.map((n) => n.title)),
    });
  }

  return { grupos, sueltas: alertas.filter((a) => !usadas.has(a.id)) };
}

/** Las causas de la bandeja de comprobantes que son de SUNAT (lo demás son papeles internos). */
const CAUSAS_SUNAT = new Set(["rechazado", "sin-respuesta"]);

/**
 * Lo que devuelve `/api/admin/comprobantes/pendientes` → estado extra. Sólo
 * cuenta lo que SUNAT observó o no respondió: los borradores y las
 * cotizaciones tienen su propia pantalla y no apuran igual.
 */
export function extraDeComprobantes(datos: unknown): EstadoExtra | null {
  const lista = (datos as { pendientes?: unknown } | null)?.pendientes;
  if (!Array.isArray(lista)) return null;
  const sunat = lista.filter(
    (p): p is { causa: string; fecha?: string; responsable?: string | null; gravedad?: string } =>
      typeof p === "object" && p !== null && CAUSAS_SUNAT.has(String((p as { causa?: unknown }).causa)),
  );
  if (sunat.length === 0) return null;
  const rechazados = sunat.filter((p) => p.causa === "rechazado").length;
  const sinRespuesta = sunat.length - rechazados;
  const partes = [
    rechazados > 0 ? `${rechazados} ${plural(rechazados, "rechazado", "rechazados")} por SUNAT` : null,
    sinRespuesta > 0 ? `${sinRespuesta} sin respuesta de SUNAT` : null,
  ].filter(Boolean);
  return {
    accion: "comprobantes",
    cantidad: sunat.length,
    titulo: partes.join(" · "),
    desde: sunat.reduce<string | null>((f, p) => masViejo(f, p.fecha), null),
    urgente: rechazados > 0,
    responsable: sunat.find((p) => p.responsable)?.responsable ?? null,
  };
}
