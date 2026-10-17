/**
 * «Nueva guía de remisión» — reglas puras (auditoría de comprobantes p3, 17-10:
 * F17 F18 F19 F20 F22 F23 M56). Sin React ni fetch: qué falta en cada etapa,
 * qué conviene revisar antes de crear, la precarga desde un pedido, los datos
 * frecuentes y el cuerpo del POST (que el backend valida otra vez).
 */
import { normalizarUnidad } from "./guia-unidades";
import { FORM_VACIO, MOTIVO_ROTULO, STATUS_META, type DraftItem, type FormGuia, type GuiaRemision } from "./tipos";

export type PasoGuia = "origen" | "destino" | "transporte" | "carga" | "revisar";

export const PASOS_GUIA: readonly { id: PasoGuia; rotulo: string }[] = [
  { id: "origen", rotulo: "Origen" },
  { id: "destino", rotulo: "Destino" },
  { id: "transporte", rotulo: "Transporte" },
  { id: "carga", rotulo: "Carga" },
  { id: "revisar", rotulo: "Revisar" },
];

/** El pedido elegido como origen: lo que se muestra de él y lo que sustenta la guía. */
export interface PedidoVinculado {
  id: string;
  codigo: string;
  cliente: string;
  total: number;
  /** La referencia de la dirección que dejó el cliente. */
  referencia: string;
  /** Serie-número del comprobante del pedido, si ya tiene. */
  comprobante: string | null;
}

/** Lo que manda `GET /api/orders/<id>` (mapOrder), leído sin confiar en los tipos. */
export interface OrdenParaGuia {
  id?: unknown;
  total?: unknown;
  customer?: { name?: unknown; location?: unknown; reference?: unknown };
  items?: Array<{ id?: unknown; name?: unknown; quantity?: unknown; unit?: unknown }>;
}

export interface ComprobanteDelPedido {
  numero: string;
  ruc: string;
}

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const simple = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** «Jr. Tarapacá 244, GPS: -8.38, -74.53» → «Jr. Tarapacá 244»: las coordenadas no van en una guía. */
export function limpiarDireccion(texto: unknown): string {
  return txt(texto).split(/,?\s*GPS\s*:/i)[0].trim();
}

/** `2026-10-17T09:05` en la hora del navegador (el formato de `datetime-local`). */
export function ahoraLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formNuevo(partidaSugerida: string, ahora: Date = new Date()): FormGuia {
  return { ...FORM_VACIO, puntoPartida: partidaSugerida, fechaTraslado: ahoraLocal(ahora) };
}

/** Las líneas del pedido como ítems de la guía: misma cantidad, unidad con su código SUNAT. */
export function itemsDelPedido(orden: OrdenParaGuia): DraftItem[] {
  return (orden.items ?? [])
    .filter((it) => txt(it.name) && num(it.quantity) > 0)
    .map((it) => {
      const unidad = normalizarUnidad(txt(it.unit));
      const producto = txt(it.id);
      return {
        descripcion: txt(it.name),
        cantidad: String(num(it.quantity)),
        unidad: unidad.codigo,
        pesoUnitario: "",
        ...(producto && producto !== "0" ? { productoId: producto } : {}),
        ...(unidad.exacta ? {} : { unidadOrigen: txt(it.unit) }),
      };
    });
}

/**
 * Lo que el pedido llena (F17/M56): quién recibe, a dónde llega, el motivo
 * «Venta» y el comprobante que lo sustenta. Partida, fecha y transporte se
 * quedan como estaban: no son del pedido.
 */
export function formConPedido(form: FormGuia, orden: OrdenParaGuia, comprobante: ComprobanteDelPedido | null): FormGuia {
  const direccion = limpiarDireccion(orden.customer?.location);
  const referencia = txt(orden.customer?.reference);
  const conRef = referencia && !simple(direccion).includes(simple(referencia)) ? `${direccion}${direccion ? " · " : ""}Ref.: ${referencia}` : direccion;
  const ruc = comprobante && /^(\d{8}|\d{11})$/.test(comprobante.ruc) ? comprobante.ruc : "";
  return {
    ...form,
    fuente: "pedido",
    motivoTraslado: "VENTA",
    destinatarioNombre: txt(orden.customer?.name),
    destinatarioRuc: ruc,
    destinatarioDireccion: direccion,
    puntoLlegada: conRef,
    documentoRef: comprobante?.numero ?? "",
  };
}

export function pedidoVinculado(orden: OrdenParaGuia, comprobante: ComprobanteDelPedido | null): PedidoVinculado {
  const id = txt(orden.id);
  return {
    id,
    codigo: `#${id.slice(-6)}`,
    cliente: txt(orden.customer?.name),
    total: num(orden.total),
    referencia: txt(orden.customer?.reference),
    comprobante: comprobante?.numero ?? null,
  };
}

/**
 * El comprobante vivo del pedido en la respuesta de `/api/admin/sunat/invoices`
 * (`{ data: [{ orderId, type, series, number, sunatStatus, customerRuc }] }`):
 * boleta o factura, ni rechazada ni anulada. Las notas no sustentan un traslado.
 */
export function comprobanteDeFilas(respuesta: unknown, orderId: string): ComprobanteDelPedido | null {
  const filas = (respuesta as { data?: unknown } | null)?.data;
  if (!Array.isArray(filas)) return null;
  for (const f of filas as Array<Record<string, unknown>>) {
    if (f?.orderId !== orderId) continue;
    if (f.type !== "factura" && f.type !== "boleta") continue;
    if (f.sunatStatus === "rejected" || f.sunatStatus === "voided") continue;
    const serie = txt(f.series);
    const numero = txt(f.number);
    if (!serie || !numero) continue;
    return { numero: `${serie}-${numero}`, ruc: txt(f.customerRuc) };
  }
  return null;
}

/** Hay algo que valga guardar como borrador (la partida y la fecha se llenan solas: no cuentan). */
export function tieneDatos(form: FormGuia, items: readonly DraftItem[], pedido: PedidoVinculado | null): boolean {
  if (pedido) return true;
  const escritos: (keyof FormGuia)[] = ["destinatarioNombre", "destinatarioDireccion", "puntoLlegada", "vehiculoPlaca", "conductorNombre", "transportistaNombre", "documentoRef", "bultos", "pesoBruto"];
  return escritos.some((k) => form[k].trim() !== "") || items.some((i) => i.descripcion.trim() !== "");
}

// ── Lo que falta y lo que conviene revisar ──────────────────────────────────

export interface Pendiente {
  paso: PasoGuia;
  texto: string;
  /** El campo que lo resuelve: la etapa lo marca debajo de él. */
  campo?: keyof FormGuia;
}

/** Las líneas que viajan: con descripción y cantidad mayor que cero. */
export function lineasValidas(items: readonly DraftItem[]): DraftItem[] {
  return items.filter((i) => i.descripcion.trim() && (parseFloat(i.cantidad) || 0) > 0);
}

/** Lo que impide crear la guía, por etapa (F18: se localiza sin recorrer el formulario). */
export function pendientesDe(form: FormGuia, items: readonly DraftItem[], pedido: PedidoVinculado | null): Pendiente[] {
  const p: Pendiente[] = [];
  if (form.fuente === "pedido" && !pedido) p.push({ paso: "origen", texto: "Elige el pedido o cambia a «Sin pedido»" });
  if (!form.motivoTraslado) p.push({ paso: "origen", texto: "Elige el motivo del traslado", campo: "motivoTraslado" });
  if (!form.fechaTraslado || Number.isNaN(new Date(form.fechaTraslado).getTime())) p.push({ paso: "origen", texto: "Pon la fecha y hora del traslado", campo: "fechaTraslado" });

  if (!form.destinatarioNombre.trim()) p.push({ paso: "destino", texto: "Escribe quién recibe", campo: "destinatarioNombre" });
  const ruc = form.destinatarioRuc.trim();
  if (ruc && !/^(\d{8}|\d{11})$/.test(ruc)) p.push({ paso: "destino", texto: "El RUC o DNI de quien recibe tiene 11 u 8 números", campo: "destinatarioRuc" });
  if (!form.destinatarioDireccion.trim()) p.push({ paso: "destino", texto: "Escribe la dirección de quien recibe", campo: "destinatarioDireccion" });
  if (!form.puntoPartida.trim()) p.push({ paso: "destino", texto: "Escribe de dónde sale la carga", campo: "puntoPartida" });
  if (!form.puntoLlegada.trim()) p.push({ paso: "destino", texto: "Escribe a dónde llega la carga", campo: "puntoLlegada" });

  const dni = form.conductorDni.trim();
  if (dni && !/^\d{8}$/.test(dni)) p.push({ paso: "transporte", texto: "El DNI del conductor tiene 8 números", campo: "conductorDni" });
  const rucT = form.transportistaRuc.trim();
  if (form.modalidad === "publico" && rucT && !/^\d{11}$/.test(rucT)) p.push({ paso: "transporte", texto: "El RUC de la empresa de transporte tiene 11 números", campo: "transportistaRuc" });

  if (lineasValidas(items).length === 0) p.push({ paso: "carga", texto: "Agrega al menos un ítem con descripción y cantidad" });
  for (const it of items) {
    if (it.descripcion.trim() && !((parseFloat(it.cantidad) || 0) > 0)) p.push({ paso: "carga", texto: `«${it.descripcion.trim()}» no tiene cantidad` });
  }
  const bultos = form.bultos.trim();
  if (bultos && !/^\d+$/.test(bultos)) p.push({ paso: "carga", texto: "Los bultos son un número entero", campo: "bultos" });
  const bruto = form.pesoBruto.trim();
  if (bruto && !(parseFloat(bruto) >= 0)) p.push({ paso: "carga", texto: "El peso bruto es un número en kg", campo: "pesoBruto" });
  return p;
}

/** Peso que suman los ítems (cantidad × peso por unidad): es ESTIMADO, no pesado. */
export function pesoEstimado(items: readonly DraftItem[]): { kg: number; sinPeso: number } {
  let kg = 0;
  let sinPeso = 0;
  for (const it of lineasValidas(items)) {
    const unitario = parseFloat(it.pesoUnitario) || 0;
    if (unitario > 0) kg += (parseFloat(it.cantidad) || 0) * unitario;
    else sinPeso += 1;
  }
  return { kg: Math.round(kg * 1000) / 1000, sinPeso };
}

export interface GuiaPrevia {
  numero: string;
  estado: string;
}

/** La guía viva (no anulada) que ya tiene ese pedido, la más reciente. */
export function guiaPreviaDelPedido(guias: readonly GuiaRemision[], orderId: string | null): GuiaPrevia | null {
  if (!orderId) return null;
  const g = guias
    .filter((x) => x.orderId === orderId && x.status !== "ANULADA")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return g ? { numero: g.numero, estado: STATUS_META[g.status].label.toLowerCase() } : null;
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/** Lo que no impide crear pero conviene mirar (F20/F23: faltantes e incompatibles antes de confirmar). */
export function avisosDe(
  form: FormGuia,
  items: readonly DraftItem[],
  pedido: PedidoVinculado | null,
  previa: GuiaPrevia | null,
  ahora: Date = new Date(),
): Pendiente[] {
  const a: Pendiente[] = [];
  if (form.fuente === "pedido" && previa) a.push({ paso: "origen", texto: `El pedido ya tiene la guía ${previa.numero} (${previa.estado}): haz otra sólo si lo llevas en otra salida` });
  if (form.fuente === "pedido" && pedido && form.motivoTraslado && form.motivoTraslado !== "VENTA")
    a.push({ paso: "origen", texto: `El pedido es una venta, pero el motivo dice «${MOTIVO_ROTULO[form.motivoTraslado] ?? form.motivoTraslado}»` });
  if (form.fuente === "sin-pedido" && form.motivoTraslado === "VENTA" && !form.documentoRef.trim())
    a.push({ paso: "origen", texto: "Venta sin pedido ni comprobante: anota la boleta o factura en «Doc. de referencia»" });
  const fecha = new Date(form.fechaTraslado).getTime();
  if (Number.isFinite(fecha) && fecha < ahora.getTime() - UN_DIA_MS) a.push({ paso: "origen", texto: "La fecha del traslado ya pasó: pon la del día que sale" });

  if (form.puntoPartida.trim() && simple(form.puntoPartida) === simple(form.puntoLlegada)) a.push({ paso: "destino", texto: "La partida y la llegada son la misma dirección" });

  if (form.modalidad === "privado") {
    if (!form.vehiculoPlaca.trim()) a.push({ paso: "transporte", texto: "Sin placa: en un control de carretera te la piden" });
    if (!form.conductorNombre.trim() || !form.conductorDni.trim()) a.push({ paso: "transporte", texto: "Falta el conductor o su DNI" });
  } else if (!form.transportistaRuc.trim() || !form.transportistaNombre.trim()) {
    a.push({ paso: "transporte", texto: "Falta el nombre o el RUC de la empresa de transporte" });
  }

  const { kg, sinPeso } = pesoEstimado(items);
  if (sinPeso > 0) a.push({ paso: "carga", texto: `${n(sinPeso, "ítem", "ítems")} sin peso: el peso estimado sale incompleto` });
  const bruto = parseFloat(form.pesoBruto);
  if (bruto > 0 && kg > 0 && Math.abs(bruto - kg) / kg > 0.25)
    a.push({ paso: "carga", texto: `El peso bruto (${bruto} kg) se aleja del estimado (${kg} kg): revisa uno de los dos` });
  const sinCodigo = items.filter((i) => i.unidadOrigen).length;
  if (sinCodigo > 0) a.push({ paso: "carga", texto: `${n(sinCodigo, "ítem del pedido no tiene", "ítems del pedido no tienen")} unidad SUNAT y va como «Unidad»: revísalo` });
  return a;
}

// ── El POST ─────────────────────────────────────────────────────────────────

const opcional = (s: string) => s.trim() || undefined;

/** El cuerpo de `POST /api/guias-remision`: sólo los datos de la modalidad elegida. */
export function cuerpoGuia(form: FormGuia, items: readonly DraftItem[], pedido: PedidoVinculado | null) {
  const publico = form.modalidad === "publico";
  return {
    orderId: form.fuente === "pedido" && pedido ? pedido.id : undefined,
    motivoTraslado: form.motivoTraslado,
    fechaTraslado: new Date(form.fechaTraslado).toISOString(),
    destinatarioNombre: form.destinatarioNombre.trim(),
    destinatarioRuc: opcional(form.destinatarioRuc),
    destinatarioDireccion: form.destinatarioDireccion.trim(),
    puntoPartida: form.puntoPartida.trim(),
    puntoLlegada: form.puntoLlegada.trim(),
    transportistaNombre: publico ? opcional(form.transportistaNombre) : undefined,
    transportistaRuc: publico ? opcional(form.transportistaRuc) : undefined,
    vehiculoPlaca: opcional(form.vehiculoPlaca.toUpperCase()),
    conductorNombre: opcional(form.conductorNombre),
    conductorDni: opcional(form.conductorDni),
    bultos: form.bultos.trim() ? parseInt(form.bultos, 10) : undefined,
    documentoRef: opcional(form.documentoRef),
    pesoBruto: form.pesoBruto.trim() ? parseFloat(form.pesoBruto) : undefined,
    items: lineasValidas(items).map((i) => ({
      descripcion: i.descripcion.trim(),
      cantidad: parseFloat(i.cantidad),
      unidad: i.unidad || "NIU",
      pesoUnitario: parseFloat(i.pesoUnitario) > 0 ? parseFloat(i.pesoUnitario) : undefined,
      productoId: i.productoId,
    })),
  };
}

const CAMPO_ROTULO: Record<string, string> = {
  motivoTraslado: "motivo", fechaTraslado: "fecha", destinatarioNombre: "quién recibe", destinatarioRuc: "RUC o DNI",
  destinatarioDireccion: "dirección de quien recibe", puntoPartida: "partida", puntoLlegada: "llegada",
  transportistaRuc: "RUC del transportista", vehiculoPlaca: "placa", conductorDni: "DNI del conductor", items: "ítems",
};

/** La respuesta del POST que falló, dicha con la causa y el paso siguiente (no «Error al crear»). */
export function mensajeDeError(status: number | null, cuerpo: unknown): string {
  if (status === null) return "No hubo respuesta: revisa la lista antes de reintentar, pudo haberse creado. Tu borrador sigue guardado.";
  const error = (cuerpo as { error?: unknown } | null)?.error;
  if (status === 400 && error && typeof error === "object") {
    const campos = Object.keys(error).map((k) => CAMPO_ROTULO[k] ?? k);
    return `Revisa: ${campos.join(", ")}.`;
  }
  if (status === 404) return "Ese pedido no está en este negocio o ya no existe: elige otro.";
  if (status === 401 || status === 403) return "Tu usuario no puede crear guías: pídeselo al dueño.";
  if (status === 429) return "Muchos intentos seguidos: espera un momento y vuelve a tocar «Crear guía».";
  return typeof error === "string" && error !== "Database error" ? error : "No se pudo crear la guía. Vuelve a intentar en un momento.";
}

// ── Datos frecuentes (F19/M56) ──────────────────────────────────────────────

export interface DestinoFrecuente {
  nombre: string;
  ruc: string;
  direccion: string;
  llegada: string;
}

export interface TransporteFrecuente {
  modalidad: FormGuia["modalidad"];
  transportistaNombre: string;
  transportistaRuc: string;
  vehiculoPlaca: string;
  conductorNombre: string;
  conductorDni: string;
}

export interface Frecuentes {
  partidas: string[];
  destinos: DestinoFrecuente[];
  transportes: TransporteFrecuente[];
}

function masUsados<T>(guias: readonly GuiaRemision[], de: (g: GuiaRemision) => T | null, clave: (t: T) => string, tope: number): T[] {
  const cuenta = new Map<string, { valor: T; veces: number; ultima: string }>();
  for (const g of guias) {
    if (g.status === "ANULADA") continue;
    const v = de(g);
    if (!v) continue;
    const k = clave(v);
    const previo = cuenta.get(k);
    if (previo) {
      previo.veces += 1;
      if (g.createdAt > previo.ultima) previo.ultima = g.createdAt;
    } else cuenta.set(k, { valor: v, veces: 1, ultima: g.createdAt });
  }
  return [...cuenta.values()]
    .sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima))
    .slice(0, tope)
    .map((x) => x.valor);
}

/**
 * Lo que ya se usó en guías anteriores para elegirlo de nuevo. Se COPIA a la
 * guía nueva: cambiar la siguiente no toca la que ya se creó.
 */
export function datosFrecuentes(guias: readonly GuiaRemision[]): Frecuentes {
  return {
    partidas: masUsados(guias, (g) => g.puntoPartida?.trim() || null, simple, 3),
    destinos: masUsados(
      guias,
      (g) => (g.destinatarioNombre?.trim() ? { nombre: g.destinatarioNombre.trim(), ruc: g.destinatarioRuc ?? "", direccion: g.destinatarioDireccion ?? "", llegada: g.puntoLlegada ?? "" } : null),
      (d) => simple(`${d.nombre}|${d.llegada}`),
      4,
    ),
    transportes: masUsados(
      guias,
      (g) => {
        const placa = g.vehiculoPlaca || g.transportistaPlaca || "";
        if (!placa && !g.transportistaNombre && !g.conductorNombre) return null;
        return {
          modalidad: g.transportistaRuc ? "publico" : "privado",
          transportistaNombre: g.transportistaNombre ?? "",
          transportistaRuc: g.transportistaRuc ?? "",
          vehiculoPlaca: placa,
          conductorNombre: g.conductorNombre ?? "",
          conductorDni: g.conductorDni ?? "",
        };
      },
      (t) => simple(`${t.transportistaRuc}|${t.vehiculoPlaca}|${t.conductorDni}|${t.conductorNombre}`),
      4,
    ),
  };
}

/** Lo que dice la línea de resumen que acompaña todas las etapas. */
export function resumenGuia(form: FormGuia, items: readonly DraftItem[], pedido: PedidoVinculado | null): string[] {
  const partes: string[] = [];
  if (pedido) partes.push(`${pedido.codigo}${pedido.cliente ? ` · ${pedido.cliente}` : ""}`);
  else if (form.fuente === "sin-pedido") partes.push(MOTIVO_ROTULO[form.motivoTraslado] ?? "Sin pedido");
  const llegada = form.puntoLlegada.trim();
  if (llegada) partes.push(`→ ${llegada.split(" · ")[0]}`);
  const placa = form.vehiculoPlaca.trim().toUpperCase();
  if (placa) partes.push(placa);
  const lineas = lineasValidas(items).length;
  if (lineas > 0) partes.push(n(lineas, "ítem", "ítems"));
  const bruto = parseFloat(form.pesoBruto);
  const { kg } = pesoEstimado(items);
  if (bruto > 0) partes.push(`${bruto} kg pesados`);
  else if (kg > 0) partes.push(`${kg} kg estimados`);
  return partes;
}
