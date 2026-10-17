/**
 * Cotizaciones: tipos, estados, secciones y helpers puros (sin React).
 *
 * Las dos secciones salen del estado, no de una pestaña: «En curso» = lo que
 * todavía pide algo (mandarla, esperar la respuesta, convertirla en pedido) y
 * «Cerradas» = lo que ya terminó (pedido, rechazo o vencimiento).
 */
import { formatCurrency, formatDate } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { telefonoWhatsAppPE } from "@/lib/whatsapp-link";
import { diaEnDias, textoDia, vigenciaVencida } from "@/lib/cotizaciones/vigencia";
import { cierreDelNegocio, conNombreDelNegocio, type FirmaNegocio } from "@/lib/admin/membrete";

export type CotizacionStatus = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "VENCIDA" | "CONVERTIDA";

export type CotizacionItem = {
  id?: string;
  descripcion: string;
  cantidad: number;
  precioUnit: number;
  descuento: number;
  subtotal: number;
  productoId?: string;
};

export type Cotizacion = {
  id: string;
  /** Ya viene formateado del backend (ej. "Buleje-COT-0001"): no re-prefijar ni padStart. */
  numero: string;
  clienteNombre: string;
  clienteRuc?: string;
  /** Celular del cliente de tu lista (`Customer.phone`), si se eligió de ahí. */
  customerId?: string;
  subtotal: number;
  igv: number;
  total: number;
  status: CotizacionStatus;
  validoHasta: string;
  notas?: string;
  items: CotizacionItem[];
  /** Usuario que la armó: el responsable del seguimiento. */
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

/** Texto chico semántico en /admin = `-ink` en claro y `-500` en oscuro (el `-500` da 2:1 sobre blanco). */
export const STATUS_META: Record<CotizacionStatus, { label: string; plural: string; clase: string }> = {
  BORRADOR: { label: "Borrador", plural: "Borradores", clase: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
  ENVIADA: { label: "Enviada", plural: "Enviadas", clase: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  ACEPTADA: { label: "Aceptada", plural: "Aceptadas", clase: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  RECHAZADA: { label: "Rechazada", plural: "Rechazadas", clase: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" },
  VENCIDA: { label: "Vencida", plural: "Vencidas", clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
  CONVERTIDA: { label: "Convertida", plural: "Convertidas", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

export const SECCIONES_COTIZACIONES = ["en-curso", "cerradas"] as const;
export type SeccionCotizaciones = (typeof SECCIONES_COTIZACIONES)[number];

export const SECCION: Record<SeccionCotizaciones, { rotulo: string; estados: readonly CotizacionStatus[]; vacio: string }> = {
  "en-curso": {
    rotulo: "En curso",
    estados: ["BORRADOR", "ENVIADA", "ACEPTADA"],
    vacio: "No tienes cotizaciones en curso.",
  },
  cerradas: {
    rotulo: "Cerradas",
    estados: ["CONVERTIDA", "RECHAZADA", "VENCIDA"],
    vacio: "Todavía no se cerró ninguna cotización.",
  },
};

export const ID_PANEL_COTIZACIONES = "cotizaciones-panel";
export const PER_PAGE = 10;

export const seccionDe = (s: CotizacionStatus): SeccionCotizaciones =>
  SECCION["en-curso"].estados.includes(s) ? "en-curso" : "cerradas";

/** Sin tildes ni mayúsculas: «Ríos» se encuentra escribiendo «rios». */
const plano = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export interface FiltroCotizaciones {
  seccion: SeccionCotizaciones;
  estado: CotizacionStatus | "";
  texto: string;
}

/** Por cliente o por número, como buscaba el servidor (`contains`), pero sin pedir de nuevo. */
export function filtrarCotizaciones(lista: readonly Cotizacion[], f: FiltroCotizaciones): Cotizacion[] {
  const q = plano(f.texto.trim());
  return lista.filter(
    (c) =>
      seccionDe(c.status) === f.seccion &&
      (!f.estado || c.status === f.estado) &&
      (!q || plano(c.clienteNombre).includes(q) || plano(c.numero).includes(q)),
  );
}

/** Enviada y con su día de vigencia ya terminado (en Lima): nadie contestó a tiempo. */
export const vencioSinRespuesta = (c: Cotizacion, ahora = Date.now()) =>
  c.status === "ENVIADA" && vigenciaVencida(c.validoHasta, ahora);

/** «2026-10» del día en Pucallpa (a las 20:00 el UTC ya es mañana). */
export const mesLima = (iso: string | Date) => limaDateKey(iso).slice(0, 7);

// ── Borrador del formulario ─────────────────────────────────────────────────

/** Cliente elegido de tu lista (`GET /api/cotizaciones/clientes`). `phone` es lo que se guarda en `customerId`. */
export type ClienteDeLista = {
  phone: string;
  nombre: string;
  razonSocial?: string;
  documento?: string;
  tipoDocumento?: string;
};

/** El nombre que va en la cotización: la razón social si es empresa. */
export const nombreDeCliente = (c: ClienteDeLista) => c.razonSocial?.trim() || c.nombre;

/** `productoId` = la línea salió del catálogo (se le revisa el stock); escribir encima lo suelta. */
export type DraftItem = { descripcion: string; cantidad: string; precioUnit: string; descuento: string; productoId?: string };
export const emptyItem = (): DraftItem => ({ descripcion: "", cantidad: "1", precioUnit: "", descuento: "0" });

/** Ítems de una cotización o de una plantilla → filas editables del formulario. */
export const draftDeItems = (items: readonly (Pick<CotizacionItem, "descripcion" | "cantidad" | "precioUnit" | "productoId"> & { descuento?: number })[]): DraftItem[] =>
  items.map((it) => ({
    descripcion: it.descripcion,
    cantidad: String(it.cantidad),
    precioUnit: String(it.precioUnit),
    descuento: String(it.descuento ?? 0),
    ...(it.productoId && { productoId: it.productoId }),
  }));

/** Subtotal de una línea con la MISMA cuenta que el servidor (`POST /api/cotizaciones`). Sólo vista previa. */
export const subtotalDeLinea = (i: DraftItem) =>
  (parseFloat(i.cantidad) || 0) * (parseFloat(i.precioUnit) || 0) * (1 - (parseFloat(i.descuento) || 0) / 100);

/** «yyyy-mm-dd» de hoy + n días EN LIMA, para el `<input type="date">` (de noche el UTC ya es mañana). */
export const fechaEnDias = (n: number) => diaEnDias(n);

// ── Plantillas (en este navegador) ──────────────────────────────────────────

/** `descuento` y `productoId` desde el 17-10 (las guardadas antes no los traen). */
export type PlantillaItem = { descripcion: string; cantidad: number; precioUnit: number; descuento?: number; productoId?: string };
export type Plantilla = { id: string; nombre: string; items: PlantillaItem[]; createdAt: string };

const TEMPLATES_KEY = "cotizacion_templates";
export const MAX_TEMPLATES = 10;

export function loadTemplates(): Plantilla[] {
  try {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as Plantilla[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplates(templates: Plantilla[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
  } catch {
    /* modo privado o sin cuota: la plantilla vive hasta recargar */
  }
}

// ── WhatsApp ────────────────────────────────────────────────────────────────

/** El presupuesto entero como mensaje (Mejora M10), firmado por el negocio de la sesión. */
export function textoWhatsApp(c: Cotizacion, firma?: FirmaNegocio | null): string {
  const itemsText = (c.items ?? [])
    .map((it, i) => `${i + 1}. ${it.descripcion} x ${it.cantidad} — ${formatCurrency(Number(it.subtotal))}`)
    .join("\n");
  return [
    `*${conNombreDelNegocio(`Cotización ${c.numero}`, firma)}*`,
    `Cliente: ${c.clienteNombre}`,
    `Fecha: ${formatDate(c.createdAt)}`,
    `Válida hasta: ${textoDia(c.validoHasta)}`,
    `─────────`,
    itemsText,
    `─────────`,
    `Subtotal: ${formatCurrency(Number(c.subtotal))}`,
    `IGV (18%): ${formatCurrency(Number(c.igv))}`,
    `*Total: ${formatCurrency(Number(c.total))}*`,
    `─────────`,
    `¿Te interesa? Responde a este mensaje.`,
    ...cierreDelNegocio(firma, ""),
  ].join("\n");
}

/** El recordatorio corto (F31): número, total y hasta cuándo vale. */
export function textoRecordatorio(c: Cotizacion, firma?: FirmaNegocio | null): string {
  return [
    `Hola ${c.clienteNombre}, te escribimos por la cotización ${c.numero} por ${formatCurrency(Number(c.total))}; vale hasta el ${textoDia(c.validoHasta)}. ¿Te interesa?`,
    ...cierreDelNegocio(firma, ""),
  ].join("\n");
}

export function abrirWhatsApp(texto: string, telefono = ""): void {
  const fono = telefonoWhatsAppPE(telefono) ?? "";
  const url = fono ? `https://wa.me/${fono}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
