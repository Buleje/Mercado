/**
 * Guía de remisión remitente desde la GTF forestal (carril C, 18-10).
 *
 * La GTF ya trae placa, chofer, licencia, transportista y destino: se vuelcan en
 * el borrador de la guía para no tipearlos dos veces. PURO (sin Prisma ni React).
 * Regla: un dato que la GTF no trae NO se inventa — va en `faltan` o en `avisos`.
 * El peso no está en la GTF (sólo volumen y piezas): lo escribe quien pesa.
 */
import { componerPunto, leerGtfDatos, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { resolveUbigeo, ubigeoDeNombres } from "@/lib/peru-ubigeo";

export type OrigenGtf = "ctp_salida" | "loth_gtf";

/** El mismo body de `POST /api/guias-remision`. */
export interface CreateGuiaInput {
  motivoTraslado: string;
  fechaTraslado?: string;
  destinatarioNombre: string;
  destinatarioRuc?: string;
  destinatarioDireccion: string;
  transportistaRuc?: string;
  transportistaNombre?: string;
  vehiculoPlaca?: string;
  conductorNombre?: string;
  conductorDni?: string;
  conductorLicencia?: string;
  bultos?: number;
  documentoRef?: string;
  puntoPartida: string;
  puntoLlegada: string;
  ubigeoPartida?: string;
  ubigeoLlegada?: string;
  modalidadTraslado?: "01" | "02";
  origenTipo: OrigenGtf;
  origenId: string;
  items: { descripcion: string; cantidad: number; unidad: string }[];
}

export type Faltante = "pesoBruto" | "ubigeoPartida" | "ubigeoLlegada" | "licencia" | "destinatarioRuc";

export interface BorradorGuiaDesdeGtf {
  borrador: CreateGuiaInput;
  faltan: Faltante[];
  avisos: string[];
  guiaExistente: { id: string; numero: string } | null;
}

export interface ItemDespacho {
  descripcion: string;
  cantidad: number;
  unidad: string;
}

export interface ContextoGuiaDesdeGtf {
  origenTipo: OrigenGtf;
  origenId: string;
  /** Ubigeo del domicilio fiscal (`TenantSunatConfig.ubigeo`). */
  ubigeoFiscal: string | null;
  direccionFiscal: string | null;
  items: ItemDespacho[];
  guiaExistente?: { id: string; numero: string } | null;
}

const UNIDAD_SUNAT: Record<string, string> = { m3: "MTQ", kg: "KGM", unidad: "NIU", und: "NIU" };

/** Una línea del despacho → ítem de guía. El pie tablar no tiene código en el catálogo: va como «Unidad» y la descripción lo dice. */
export function itemDeLinea(l: { especie?: string | null; producto?: string | null; presentacion?: string | null; cantidad: number | null; unidad?: string | null }): ItemDespacho | null {
  const cantidad = Number(l.cantidad ?? 0);
  if (!(cantidad > 0)) return null;
  const unidad = (l.unidad ?? "").trim().toLowerCase();
  const base = [l.producto, l.especie, l.presentacion].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || "Madera";
  const codigo = UNIDAD_SUNAT[unidad];
  return { descripcion: codigo || !unidad ? base : `${base} (${unidad === "pt" ? "pies tablares" : unidad})`, cantidad, unidad: codigo ?? "NIU" };
}

/** La guía corta del Libro TH (sin `gtfDatos`) guarda chofer/placa en columnas: se completan sólo los huecos. */
export function gtfDatosDeFilaLoth(fila: {
  gtfDatos: unknown; conductor?: string | null; conductorLicencia?: string | null; placaVehiculo?: string | null;
  transportista?: string | null; transportistaDoc?: string | null; destino?: string | null; origen?: string | null;
}): GtfDatos {
  const d = leerGtfDatos(fila.gtfDatos);
  const v = (x?: string | null) => (x ?? "").trim();
  return {
    ...d,
    vehiculo: {
      ...d.vehiculo,
      placa: d.vehiculo.placa || v(fila.placaVehiculo),
      conductor: d.vehiculo.conductor || v(fila.conductor),
      licencia: d.vehiculo.licencia || v(fila.conductorLicencia),
    },
    transportista: { ...d.transportista, nombre: d.transportista.nombre || v(fila.transportista), docNumero: d.transportista.docNumero || v(fila.transportistaDoc) },
    destinatario: { ...d.destinatario, direccion: d.destinatario.direccion || v(fila.destino) },
    traslado: { ...d.traslado, puntoPartida: d.traslado.puntoPartida || v(fila.origen) },
  };
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");
const opc = (s: string) => (s.trim() ? s.trim() : undefined);

export function guiaDesdeGtf(gtfCrudo: GtfDatos, ctx: ContextoGuiaDesdeGtf): BorradorGuiaDesdeGtf {
  const gtf = gtfCrudo;
  const avisos: string[] = [];
  const faltan: Faltante[] = ["pesoBruto"];
  const { vehiculo: v, destinatario: d, transportista: t, traslado: tr } = gtf;

  // ── Transporte ──
  const fluvial = v.modo === "fluvial";
  if (fluvial) avisos.push("La GTF viaja por río: la guía de remisión terrestre no aplica tal cual (la matrícula de la embarcación no se copia como placa).");
  else if (v.modo === "multimodal") avisos.push("La GTF es multimodal: revisa la placa y el tramo terrestre.");
  const dni = soloDigitos(v.conductorDni);
  if (v.conductorDni && dni.length !== 8) avisos.push(`El DNI del conductor en la GTF («${v.conductorDni}») no tiene 8 números: no se copió.`);
  if (!v.licencia.trim()) faltan.push("licencia");
  const rucT = soloDigitos(t.docNumero);
  const modalidad = v.tipoTransporte === "publico" ? "01" : "02";

  // ── Destino ──
  const llegadaGtf = tr.llegada;
  const destNombres = d.distrito || d.provincia || d.departamento ? d : null;
  const fuenteLlegada = llegadaGtf.distrito ? llegadaGtf : destNombres ?? llegadaGtf;
  const textoDest = componerPunto({ direccion: d.direccion, departamento: d.departamento, provincia: d.provincia, distrito: d.distrito });
  const puntoLlegada = tr.puntoLlegada.trim() || componerPunto(tr.llegada) || textoDest;
  const ubigeoLlegada = ubigeoDeNombres(fuenteLlegada.departamento, fuenteLlegada.provincia, fuenteLlegada.distrito);
  if (ubigeoLlegada) {
    const r = resolveUbigeo(ubigeoLlegada);
    avisos.push(`Ubigeo de llegada deducido por nombre: ${r?.distrito ?? fuenteLlegada.distrito} (${ubigeoLlegada}). Confírmalo.`);
  } else faltan.push("ubigeoLlegada");
  const rucDest = soloDigitos(d.docNumero);
  if (!rucDest) faltan.push("destinatarioRuc");

  // ── Origen ──
  const textoPartida = tr.puntoPartida.trim() || componerPunto(tr.partida);
  const usaFiscal = !textoPartida && !!ctx.direccionFiscal?.trim();
  const puntoPartida = textoPartida || (ctx.direccionFiscal ?? "").trim();
  let ubigeoPartida = ubigeoDeNombres(tr.partida.departamento, tr.partida.provincia, tr.partida.distrito);
  if (!ubigeoPartida && usaFiscal && /^\d{6}$/.test(ctx.ubigeoFiscal ?? "")) ubigeoPartida = ctx.ubigeoFiscal as string;
  if (usaFiscal) avisos.push("La GTF no dice de dónde sale: se puso la dirección fiscal del negocio.");
  if (!puntoPartida) avisos.push("No hay punto de partida en la GTF ni dirección fiscal: escríbelo.");
  if (!ubigeoPartida) faltan.push("ubigeoPartida");

  // ── Comprobante, motivo, ítems ──
  const documentoRef = gtf.comprobante.numero.trim();
  if (!documentoRef) avisos.push("La GTF no trae el comprobante de la venta: el motivo quedó en «Venta», cámbialo si es otro.");
  if (ctx.items.length === 0) avisos.push("No se encontraron líneas del despacho: agrega los ítems a mano.");
  if (ctx.items.some((i) => i.descripcion.includes("pies tablares"))) avisos.push("Los pies tablares no tienen código propio en el catálogo SUNAT: van como «Unidad»; revisa la unidad si te lo piden.");
  if (ctx.guiaExistente) avisos.push(`Esta GTF ya tiene la guía ${ctx.guiaExistente.numero}.`);

  const borrador: CreateGuiaInput = {
    motivoTraslado: "VENTA",
    fechaTraslado: /^\d{4}-\d{2}-\d{2}$/.test(tr.fechaInicio) ? tr.fechaInicio : undefined,
    destinatarioNombre: d.nombre.trim(),
    destinatarioRuc: opc(rucDest),
    destinatarioDireccion: textoDest || d.direccion.trim() || puntoLlegada,
    transportistaRuc: opc(rucT),
    transportistaNombre: opc(t.nombre),
    vehiculoPlaca: fluvial ? undefined : opc(v.placa.toUpperCase()),
    conductorNombre: opc(v.conductor),
    conductorDni: dni.length === 8 ? dni : undefined,
    conductorLicencia: opc(v.licencia),
    documentoRef: opc(documentoRef),
    puntoPartida,
    puntoLlegada,
    ubigeoPartida: opc(ubigeoPartida),
    ubigeoLlegada: opc(ubigeoLlegada),
    modalidadTraslado: modalidad,
    origenTipo: ctx.origenTipo,
    origenId: ctx.origenId,
    items: ctx.items.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, unidad: i.unidad })),
  };
  return { borrador, faltan, avisos, guiaExistente: ctx.guiaExistente ?? null };
}
