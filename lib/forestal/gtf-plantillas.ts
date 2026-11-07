/**
 * Plantillas de guía (Brandon 16-10-2026: «guardar datos o varios bloques y
 * ponerle un nombre (referencia permiso y destino) para usar ese guardado y
 * rellenarse todos los campos a la vez»).
 *
 * Una plantilla guarda BLOQUES enteros de «Datos de la guía» —el permiso y su
 * título, el propietario, la partida, el destinatario, el transporte— y nunca
 * lo que es de un solo viaje: el N° de guía, las fechas, las trozas, los
 * volúmenes, la lista, la guía de remisión ni el comprobante.
 *
 * Al usarla:
 *   · el PERMISO no se copia campo por campo: se cambia el plan de la guía y
 *     el título sale de ese plan (`loth-guia-cambio-de-plan`). La plantilla
 *     sólo llena los huecos del título. Un permiso que ya no existe o venció
 *     se avisa y no se aplica; el resto sí.
 *   · los demás bloques PISAN lo escrito: para eso se eligió la plantilla. La
 *     vista previa dice antes qué llena y qué pisa (`aplicarPlantilla`).
 *
 * PURO: sin React, sin fetch, sin Prisma. El almacén (lista, tope, nombres)
 * vive en `gtf-plantillas-almacen.ts`.
 */

import { z } from "zod";
import {
  componerPunto,
  conPunto,
  gtfDatosSchema,
  llegadaDelDestinatario,
  ubicacionDelPunto,
  type GtfDatos,
} from "./ctp-gtf-datos";

export const BLOQUES_PLANTILLA = [
  "titulo",
  "propietario",
  "partida",
  "destinatario",
  "transportista",
  "conductor",
  "vehiculo",
  "observaciones",
] as const;
export type BloquePlantilla = (typeof BLOQUES_PLANTILLA)[number];

export const ROTULO_BLOQUE: Record<BloquePlantilla, string> = {
  titulo: "Permiso y título habilitante",
  propietario: "Propietario",
  partida: "Punto de partida",
  destinatario: "Destinatario (destino)",
  transportista: "Transportista",
  conductor: "Conductor",
  vehiculo: "Vehículo",
  observaciones: "Observaciones",
};

/** Los que Brandon nombró: se marcan solos al guardar si tienen algo escrito. */
export const BLOQUES_POR_DEFECTO: readonly BloquePlantilla[] = ["titulo", "propietario", "partida", "destinatario"];

// ── Esquema ─────────────────────────────────────────────────────────────────

const texto = (max: number) => z.string().trim().max(max);
const sh = gtfDatosSchema.shape;
/* `.unwrap()` saca el `.default()`: con él, un bloque ausente volvería lleno
   de vacíos (Zod 4 aplica el default dentro de `.optional()`). */
const tituloSchema = sh.guia
  .unwrap()
  .pick({
    autoridad: true,
    origenRecurso: true,
    resolucion: true,
    representanteLegal: true,
    planManejoTipo: true,
    departamento: true,
    provincia: true,
    distrito: true,
  })
  .extend({
    /** El plan del Libro TH (el permiso): al usarla, la guía pasa a ese plan. */
    planId: z.string().trim().min(1).max(64).nullable().default(null),
    /** Cómo se llamaba el plan al guardar (por si después ya no existe). */
    permiso: texto(200).default(""),
    /** (6) N° del título habilitante. */
    numero: texto(80).default(""),
  });
const vehiculo = sh.vehiculo.unwrap();

export const contenidoPlantillaSchema = z
  .object({
    titulo: tituloSchema.optional(),
    propietario: sh.propietario.unwrap().optional(),
    partida: sh.traslado.unwrap().shape.partida.unwrap().optional(),
    /** Con la ruta sólo si se escribió a mano (la armada sola se vuelve a armar). */
    destinatario: sh.destinatario.unwrap().extend({ ruta: texto(400).default("") }).optional(),
    transportista: sh.transportista.unwrap().optional(),
    conductor: vehiculo.pick({ conductor: true, conductorDni: true, licencia: true }).optional(),
    vehiculo: vehiculo
      .pick({ modo: true, placa: true, placaRemolque: true, marca: true, tipo: true, embarcacion: true, tipoTransporte: true })
      .optional(),
    observaciones: texto(600).optional(),
  })
  .refine((c) => BLOQUES_PLANTILLA.some((b) => c[b] !== undefined), { message: "La plantilla no trae ningún bloque." });

export type ContenidoPlantilla = z.infer<typeof contenidoPlantillaSchema>;

export const plantillaSchema = z.object({
  id: z.string().trim().min(1).max(64),
  nombre: z.string().trim().min(1).max(80),
  contenido: contenidoPlantillaSchema,
  creadaEn: z.string().max(40),
  creadaPor: z.string().max(120).default(""),
  actualizadaEn: z.string().max(40),
  usadaEn: z.string().max(40).nullable().default(null),
  usos: z.number().int().min(0).max(1_000_000).default(0),
});
export type PlantillaGuia = z.infer<typeof plantillaSchema>;

/** Los bloques que trae, en el orden del papel. */
export function bloquesDe(c: ContenidoPlantilla): BloquePlantilla[] {
  return BLOQUES_PLANTILLA.filter((b) => c[b] !== undefined);
}

// ── Guardar ─────────────────────────────────────────────────────────────────

/** El permiso de la guía de ahora: el plan y cómo se llama. */
export interface PermisoDeLaGuia {
  planId: string | null;
  etiqueta: string;
}

const lleno = (...v: (string | null | undefined)[]) => v.some((x) => (x ?? "").trim() !== "");
const recorte = (v: string | null | undefined) => (v ?? "").trim();

/** La ruta escrita a mano; la que se armó sola con los puntos vuelve `""`. */
function rutaPropia(t: GtfDatos["traslado"]): string {
  const ruta = recorte(t.ruta);
  const sola = [recorte(t.puntoPartida), recorte(t.puntoLlegada)].filter(Boolean).join(" → ");
  const sola2 = [componerPunto(t.partida), componerPunto(t.llegada)].filter(Boolean).join(" → ");
  return ruta && ruta !== sola && ruta !== sola2 && ruta !== recorte(t.puntoPartida) ? ruta : "";
}

/** ¿El bloque tiene algo que valga la pena guardar? */
export function bloqueConDatos(d: GtfDatos, b: BloquePlantilla, permiso: PermisoDeLaGuia | null): boolean {
  const g = d.guia;
  const v = d.vehiculo;
  switch (b) {
    case "titulo":
      return Boolean(permiso?.planId) || lleno(d.titulos[0], g.autoridad, g.resolucion, g.planManejoTipo, g.origenRecurso);
    case "propietario":
      return lleno(d.propietario.nombre, d.propietario.docNumero);
    case "partida":
      return Boolean(componerPunto(ubicacionDelPunto(d.traslado, "partida"))) || lleno(d.traslado.partida.nombre);
    case "destinatario":
      return lleno(d.destinatario.nombre, d.destinatario.docNumero, d.destinatario.direccion);
    case "transportista":
      return lleno(d.transportista.nombre, d.transportista.docNumero);
    case "conductor":
      return lleno(v.conductor, v.conductorDni, v.licencia);
    case "vehiculo":
      return lleno(v.placa, v.placaRemolque, v.marca, v.tipo, v.embarcacion);
    case "observaciones":
      return lleno(d.observaciones);
  }
}

/** Los que se marcan solos al abrir «Guardar como plantilla». */
export function bloquesMarcados(d: GtfDatos, permiso: PermisoDeLaGuia | null): BloquePlantilla[] {
  return BLOQUES_POR_DEFECTO.filter((b) => bloqueConDatos(d, b, permiso));
}

/** Lo que se guarda de la guía de ahora: SÓLO los bloques elegidos. */
export function contenidoDesdeDatos(d: GtfDatos, bloques: readonly BloquePlantilla[], permiso: PermisoDeLaGuia | null): ContenidoPlantilla {
  const c: ContenidoPlantilla = {};
  const v = d.vehiculo;
  for (const b of BLOQUES_PLANTILLA) {
    if (!bloques.includes(b)) continue;
    if (b === "titulo") {
      const { autoridad, origenRecurso, resolucion, representanteLegal, planManejoTipo, departamento, provincia, distrito } = d.guia;
      c.titulo = {
        planId: permiso?.planId ?? null,
        permiso: recorte(permiso?.etiqueta),
        numero: recorte(d.titulos[0]),
        autoridad, origenRecurso, resolucion, representanteLegal, planManejoTipo, departamento, provincia, distrito,
      };
    } else if (b === "propietario") c.propietario = { ...d.propietario };
    else if (b === "partida") c.partida = { ...d.traslado.partida, ...ubicacionDelPunto(d.traslado, "partida") };
    else if (b === "destinatario") c.destinatario = { ...d.destinatario, ruta: rutaPropia(d.traslado) };
    else if (b === "transportista") c.transportista = { ...d.transportista };
    else if (b === "conductor") c.conductor = { conductor: v.conductor, conductorDni: v.conductorDni, licencia: v.licencia };
    else if (b === "vehiculo") {
      const { modo, placa, placaRemolque, marca, tipo, embarcacion, tipoTransporte } = v;
      c.vehiculo = { modo, placa, placaRemolque, marca, tipo, embarcacion, tipoTransporte };
    } else c.observaciones = d.observaciones;
  }
  return c;
}

/** «<permiso> → <destino>», el nombre que se propone (editable). */
export function nombrePropuesto(d: GtfDatos, permiso: PermisoDeLaGuia | null): string {
  const p = recorte(d.titulos[0]) || recorte(permiso?.etiqueta) || "Sin permiso";
  const dest = d.destinatario;
  const destino = recorte(dest.nombre) || recorte(dest.distrito) || recorte(dest.departamento) || "sin destino";
  return `${p} → ${destino}`.slice(0, 80);
}

// ── Mostrar ─────────────────────────────────────────────────────────────────

const unir = (...v: (string | null | undefined)[]) => v.map(recorte).filter(Boolean).join(" · ");
const MODO_PARTIDA: Record<string, string> = {
  inicio: "Del área del título («No aplica»)",
  establecimiento: "De un establecimiento",
  continua: "Continúa un transporte",
};

/** Una línea por bloque: qué trae (la vista de «qué se guarda» y de la tarjeta). */
export function lineaDelBloque(c: ContenidoPlantilla, b: BloquePlantilla): string {
  switch (b) {
    case "titulo":
      return c.titulo ? unir(c.titulo.numero, c.titulo.permiso, c.titulo.autoridad) || "Sin título" : "";
    case "propietario":
      return c.propietario ? unir(c.propietario.esElCtp ? "Es el titular" : "", c.propietario.nombre, c.propietario.docNumero) : "";
    case "partida":
      return c.partida ? unir(MODO_PARTIDA[c.partida.modo] ?? "", c.partida.nombre, componerPunto(c.partida)) : "";
    case "destinatario":
      return c.destinatario
        ? unir(c.destinatario.nombre, c.destinatario.docNumero, componerPunto(c.destinatario), c.destinatario.ruta ? `ruta: ${c.destinatario.ruta}` : "")
        : "";
    case "transportista":
      return c.transportista ? unir(c.transportista.nombre, c.transportista.docNumero, c.transportista.registroMtc) : "";
    case "conductor":
      return c.conductor ? unir(c.conductor.conductor, c.conductor.conductorDni && `DNI ${c.conductor.conductorDni}`, c.conductor.licencia) : "";
    case "vehiculo":
      return c.vehiculo ? unir(c.vehiculo.placa, c.vehiculo.placaRemolque, c.vehiculo.marca, c.vehiculo.tipo, c.vehiculo.embarcacion) : "";
    case "observaciones":
      return recorte(c.observaciones).slice(0, 120);
  }
}

/** Para la tarjeta y el buscador: el permiso y el destino de la plantilla. */
export function resumenPlantilla(p: PlantillaGuia): { permiso: string; destino: string; bloques: BloquePlantilla[] } {
  const c = p.contenido;
  const d = c.destinatario;
  return {
    permiso: unir(c.titulo?.numero, c.titulo?.permiso) || "",
    destino: d ? unir(d.nombre, d.distrito || d.provincia || d.departamento) : "",
    bloques: bloquesDe(c),
  };
}

// ── Usar ────────────────────────────────────────────────────────────────────

/** Qué pasa con el permiso de la plantilla en la guía de ahora. */
export type EstadoPermiso =
  | { tipo: "sin_bloque" }
  | { tipo: "sin_permiso" }
  | { tipo: "mismo"; etiqueta: string }
  | { tipo: "cambia"; planId: string; etiqueta: string }
  | { tipo: "no_existe"; etiqueta: string }
  /** Existe y vale, pero no tiene trozas para despachar: la guía no puede pasarse a él. */
  | { tipo: "sin_trozas"; planId: string; etiqueta: string }
  | { tipo: "vencido"; planId: string; etiqueta: string; vencio: string };

export interface PlanesDeLaGuia {
  planIdActual: string | null;
  /** Los planes del libro con su nombre. */
  planes: readonly { id: string; etiqueta: string }[];
  /** `YYYY-MM-DD…` hasta cuándo vale el permiso de cada plan (sin dato = no vence). */
  vigenciaDe: (planId: string) => string | null | undefined;
  /** Hoy en Lima, `YYYY-MM-DD`. */
  hoy: string;
  /** Si el plan tiene trozas para despachar (el selector de la guía sólo ofrece esos). Sin dato = todos. */
  conTrozas?: (planId: string) => boolean;
}

export function estadoDelPermiso(c: ContenidoPlantilla, x: PlanesDeLaGuia): EstadoPermiso {
  const t = c.titulo;
  if (!t) return { tipo: "sin_bloque" };
  if (!t.planId) return { tipo: "sin_permiso" };
  const plan = x.planes.find((p) => p.id === t.planId);
  const etiqueta = plan?.etiqueta || t.permiso || t.numero || "el de la plantilla";
  if (!plan) return { tipo: "no_existe", etiqueta };
  const vence = recorte(x.vigenciaDe(t.planId)).slice(0, 10);
  if (vence && vence < x.hoy) return { tipo: "vencido", planId: t.planId, etiqueta, vencio: vence };
  if (t.planId === x.planIdActual) return { tipo: "mismo", etiqueta };
  if (x.conTrozas && !x.conTrozas(t.planId)) return { tipo: "sin_trozas", planId: t.planId, etiqueta };
  return { tipo: "cambia", planId: t.planId, etiqueta };
}

/**
 * Por qué el título de la plantilla NO va en esta guía (media frase), o `null`
 * si va. Single source del salto (`aplicarPlantilla`) y de su aviso.
 *
 * Una plantilla SIN permiso sobre una guía que YA tiene uno no toca el título:
 * la guía declara el título de su permiso (`titulos[0]` del plan) y mezclarle
 * la autoridad o el N° de otro título la vuelve falsa.
 */
export function tituloQueNoVa(e: EstadoPermiso, planIdActual: string | null): string | null {
  switch (e.tipo) {
    case "no_existe":
    case "vencido":
      return "su permiso ya no vale";
    case "sin_trozas":
      return "ese permiso no tiene trozas para despachar";
    case "sin_permiso":
      return planIdActual != null ? "esta guía ya tiene su permiso" : null;
    default:
      return null;
  }
}

/** Un casillero que la plantilla cambia. */
export interface CambioPlantilla {
  bloque: BloquePlantilla;
  campo: string;
  antes: string;
  despues: string;
}

export interface PlantillaAplicada {
  datos: GtfDatos;
  /** Estaba vacío y se llena. */
  llena: CambioPlantilla[];
  /** Tenía algo escrito y cambia. */
  pisa: CambioPlantilla[];
  /** Bloques de la plantilla que NO se aplicaron (el permiso vencido o que ya no existe). */
  saltados: BloquePlantilla[];
}

const PARTE: [string, string][] = [
  ["nombre", "Nombre"],
  ["docTipo", "Tipo de documento"],
  ["docNumero", "N° de documento"],
  ["direccion", "Dirección"],
  ["departamento", "Departamento"],
  ["provincia", "Provincia"],
  ["distrito", "Distrito"],
];
const de = (raiz: string, campos: [string, string][]) => campos.map(([k, e]) => [`${raiz}.${k}`, e] as [string, string]);

/** Los casilleros que mira la vista previa, por bloque. */
const CAMPOS: Record<BloquePlantilla, [string, string][]> = {
  titulo: [
    ["titulos.0", "N° del título habilitante"],
    ["guia.autoridad", "Autoridad forestal"],
    ["guia.origenRecurso", "Tipo de título"],
    ["guia.resolucion", "N° de resolución"],
    ["guia.representanteLegal", "Representante legal"],
    ["guia.planManejoTipo", "Plan de manejo"],
    ["guia.departamento", "Departamento del título"],
    ["guia.provincia", "Provincia del título"],
    ["guia.distrito", "Distrito del título"],
  ],
  propietario: de("propietario", PARTE),
  partida: de("traslado.partida", [
    ["modo", "Desde dónde sale"],
    ["nombre", "Establecimiento o referencia"],
    ["autorizacion", "N° de autorización"],
    ["tipoEstablecimiento", "Tipo de establecimiento"],
    ["direccion", "Dirección"],
    ["departamento", "Departamento"],
    ["provincia", "Provincia"],
    ["distrito", "Distrito"],
    ["ruc", "RUC (interno)"],
    ["encargado", "Encargado (interno)"],
    ["telefono", "Teléfono (interno)"],
  ]),
  destinatario: de("destinatario", [...PARTE, ["zona", "Zona"], ["autorizacion", "N° de autorización (22)"]]),
  transportista: de("transportista", [...PARTE.slice(0, 4), ["registroMtc", "Registro MTC"]]),
  conductor: de("vehiculo", [
    ["conductor", "Conductor"],
    ["conductorDni", "DNI del conductor"],
    ["licencia", "Licencia"],
  ]),
  vehiculo: de("vehiculo", [
    ["modo", "Modo"],
    ["placa", "Placa o matrícula"],
    ["placaRemolque", "Placa del remolque"],
    ["marca", "Marca"],
    ["tipo", "Tipo de vehículo"],
    ["embarcacion", "Embarcación"],
    ["tipoTransporte", "Tipo de transporte"],
  ]),
  observaciones: [["observaciones", "Observaciones"]],
};

function leer(d: unknown, ruta: string): string {
  let v: unknown = d;
  for (const k of ruta.split(".")) {
    if (v == null || typeof v !== "object" || !Object.hasOwn(v, k)) return "";
    v = (v as Record<string, unknown>)[k];
  }
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

/** Sólo los campos con algo escrito: un vacío de la plantilla no borra lo de la guía. */
function conTexto<T extends Record<string, unknown>>(b: T): Partial<T> {
  return Object.fromEntries(Object.entries(b).filter(([, v]) => typeof v === "string" && v.trim() !== "")) as Partial<T>;
}

/** Lo vacío de `a` se llena con lo de `b` (el título: el permiso manda). */
function soloLoVacio<T extends Record<string, unknown>>(a: T, b: Partial<T>): T {
  const r: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b)) {
    if (!Object.hasOwn(a, k)) continue;
    const va = a[k];
    if (typeof va === "string" && !va.trim() && typeof b[k] === "string") r[k] = b[k];
  }
  return r as T;
}

/**
 * La guía con la plantilla encima, y qué llena y qué pisa.
 *
 * `permiso` sale de `estadoDelPermiso`. Con `cambia`, quien llama primero
 * cambia el plan y DESPUÉS aplica con `mismo` (el título sale del plan nuevo);
 * acá `cambia` sólo sirve para la vista previa de lo demás.
 * `propietarioDelTitular`: el titular del plan de ahora, para una plantilla
 * que dice «Es el titular».
 */
export function aplicarPlantilla(
  datos: GtfDatos,
  c: ContenidoPlantilla,
  opts: { permiso: EstadoPermiso; planIdActual: string | null; propietarioDelTitular?: Partial<GtfDatos["propietario"]> | null },
): PlantillaAplicada {
  let d: GtfDatos = { ...datos, guia: { ...datos.guia }, vehiculo: { ...datos.vehiculo }, traslado: { ...datos.traslado } };
  const saltados: BloquePlantilla[] = [];
  const aplicados: BloquePlantilla[] = [];

  if (c.titulo) {
    const tipo = opts.permiso.tipo;
    if (tituloQueNoVa(opts.permiso, opts.planIdActual)) saltados.push("titulo");
    else {
      const t = c.titulo;
      const guia = {
        autoridad: t.autoridad,
        origenRecurso: t.origenRecurso,
        resolucion: t.resolucion,
        representanteLegal: t.representanteLegal,
        planManejoTipo: t.planManejoTipo,
        departamento: t.departamento,
        provincia: t.provincia,
        distrito: t.distrito,
      };
      /* Sin permiso en la plantilla NI en la guía (con permiso en la guía ya se
         saltó arriba), lo escrito es el título: va como está, menos lo que la
         plantilla trae vacío, que no borra lo ya escrito. Con permiso, el plan
         manda y la plantilla tapa huecos. */
      const comoEsta = tipo === "sin_permiso";
      d.guia = comoEsta ? { ...d.guia, ...conTexto(guia) } : soloLoVacio(d.guia, guia);
      if (t.numero && (comoEsta || !recorte(d.titulos[0]))) d.titulos = [t.numero];
      aplicados.push("titulo");
    }
  }
  if (c.propietario) {
    if (!c.propietario.esElCtp) d.propietario = { ...c.propietario };
    else if (opts.propietarioDelTitular) d.propietario = { ...d.propietario, ...opts.propietarioDelTitular, esElCtp: true };
    aplicados.push("propietario");
  }
  if (c.partida) {
    d.traslado = conPunto(d.traslado, "partida", c.partida);
    aplicados.push("partida");
  }
  if (c.destinatario) {
    const { ruta, ...dest } = c.destinatario;
    d.destinatario = dest;
    /* La llegada ES el destinatario (formato 2024): se pone ya, no al render siguiente. */
    d.traslado = conPunto(d.traslado, "llegada", llegadaDelDestinatario(d));
    if (ruta) d.traslado = { ...d.traslado, ruta };
    aplicados.push("destinatario");
  }
  if (c.transportista) {
    d.transportista = { ...c.transportista };
    aplicados.push("transportista");
  }
  if (c.conductor) {
    d.vehiculo = { ...d.vehiculo, ...c.conductor };
    aplicados.push("conductor");
  }
  if (c.vehiculo) {
    d.vehiculo = { ...d.vehiculo, ...c.vehiculo };
    aplicados.push("vehiculo");
  }
  if (c.observaciones !== undefined) {
    d = { ...d, observaciones: c.observaciones };
    aplicados.push("observaciones");
  }

  const llena: CambioPlantilla[] = [];
  const pisa: CambioPlantilla[] = [];
  for (const b of aplicados) {
    const campos = b === "destinatario" && c.destinatario?.ruta ? [...CAMPOS[b], ["traslado.ruta", "Ruta"] as [string, string]] : CAMPOS[b];
    for (const [ruta, campo] of campos) {
      const antes = leer(datos, ruta);
      const despues = leer(d, ruta);
      if (antes === despues) continue;
      (antes ? pisa : llena).push({ bloque: b, campo, antes, despues });
    }
  }
  return { datos: d, llena, pisa, saltados };
}
