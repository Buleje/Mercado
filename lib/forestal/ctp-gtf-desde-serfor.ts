"use client";

/**
 * Reimprimir la GTF con la que ENTRÓ la madera, desde la ficha de SERFOR.
 *
 * Cuando el ingreso se cargó consultando la guía, `WoodEntry.serforGtf` guarda
 * el documento oficial completo, casillero por casillero. Esto lo vuelve a
 * dibujar con el MISMO renderer que la guía de salida (`cuerpoGtfOficial`): si
 * cada una tuviera su plantilla, dos hojas del mismo trámite se verían distintas
 * y la que se presenta dejaría de ser reconocible.
 *
 * ── Acá el estado SÍ se imprime ──────────────────────────────────────────────
 * La guía de salida deja el recuadro vacío porque Buleje no registra ante la
 * autoridad. Esta es distinta: el número de constancia y el estado los devolvió
 * SERFOR al consultarla, así que imprimirlos es reproducir lo que la autoridad
 * dice, no fabricar un trámite. La condición sigue siendo la misma —sólo con el
 * dato de SERFOR—, y por eso se pasa `registroSerfor` únicamente si vino.
 */

import { cuerpoGtfOficial, type CuerpoGtfInput, type LineaProducto } from "./ctp-gtf-formato";
import type { TrozaListada } from "./ctp-lista-trozas";
import type { GtfSerfor } from "./serfor-gtf";
import type { CtpFicha } from "./ctp-ficha-types";
import type { GtfDatos } from "./ctp-gtf-datos";

/** Mapea el texto del origen que publica SERFOR a la clave del casillero (5). */
export function claveOrigen(texto: string | null | undefined): string {
  const t = (texto ?? "").toLowerCase();
  if (!t.trim()) return "";
  if (t.includes("concesi")) return "concesion";
  if (t.includes("permiso")) return "permiso";
  if (t.includes("autoriza")) return "autorizacion";
  if (t.includes("bosque local")) return "bosque_local";
  if (t.includes("desbosque")) return "desbosque";
  if (t.includes("cambio")) return "cambio_uso";
  if (t.includes("plantaci")) return "plantacion";
  if (t.includes("consolidado")) return "plan_consolidado";
  return "otros";
}

/**
 * La ficha publica el documento sin decir de qué tipo es, y a veces trae los DOS
 * en el mismo campo ("20605859438 / 80186494"). Se separan por longitud: 11
 * dígitos es RUC, 8 es DNI. Sin esto el casillero (23) mostraba los dos números
 * pegados y el (24) quedaba vacío teniendo el RUC ahí al lado.
 */
export function separarDocumento(crudo: string | null | undefined): { ruc: string; dni: string } {
  const piezas = (crudo ?? "").split(/[^0-9]+/).filter(Boolean);
  return {
    ruc: piezas.find((n) => n.length === 11) ?? "",
    dni: piezas.find((n) => n.length >= 7 && n.length <= 9) ?? "",
  };
}

const t = (v: string | null | undefined) => (v ?? "").trim();

/** El RUC manda como documento principal; el DNI viaja aparte para su casillero. */
function docsDe(crudo: string | null | undefined) {
  const { ruc, dni } = separarDocumento(crudo);
  return ruc
    ? { docTipo: "RUC" as const, docNumero: ruc, dniExtra: dni }
    : { docTipo: "DNI" as const, docNumero: dni, dniExtra: "" };
}

/** La ficha y los datos que `cuerpoGtfOficial` espera, armados desde SERFOR. */
export function insumosDesdeSerfor(g: GtfSerfor): { ficha: CtpFicha; datos: GtfDatos } {
  const ficha = {
    razonSocial: t(g.titular),
    arffs: t(g.instanciaRegistra),
    representante: t(g.representanteLegal),
    region: t(g.departamento),
    provincia: t(g.provincia),
    distrito: t(g.distrito),
    direccion: t(g.direccionTitular),
    titulos: [{
      tipo: claveOrigen(g.origenRecurso),
      codigo: t(g.numeroTitulo),
      resolucion: t(g.numeroResolucion),
      // La ficha pública no publica el tipo de plan por separado: va vacío en
      // vez de deducirlo, que es como se llena mal un casillero.
      planManejo: "",
      vencimiento: "",
    }],
  } as unknown as CtpFicha;

  const datos = {
    propietario: {
      nombre: t(g.propietario),
      ...docsDe(g.propietarioDoc),
      direccion: t(g.propietarioDireccion), departamento: t(g.propietarioDepartamento),
      provincia: t(g.propietarioProvincia), distrito: t(g.propietarioDistrito), esElCtp: false,
    },
    destinatario: {
      nombre: t(g.destinatario),
      ...docsDe(g.destinatarioDoc),
      direccion: t(g.destinatarioDireccion), departamento: t(g.destinatarioDepartamento),
      provincia: t(g.destinatarioProvincia), distrito: t(g.destinatarioDistrito),
    },
    vehiculo: {
      modo: "terrestre", placa: t(g.placa), marca: "", tipo: t(g.tipoVehiculo), embarcacion: "",
      conductor: t(g.transportista), conductorDni: t(g.transportistaDni), licencia: t(g.licenciaConducir),
    },
    traslado: { puntoPartida: "", puntoLlegada: "", ruta: "", fechaInicio: "", fechaFin: t(g.fechaVencimiento) },
    comprobante: { tipo: g.guiaRemision ? "guia_remision" : "ninguno", numero: t(g.guiaRemision) },
    observaciones: "",
  } as unknown as GtfDatos;

  return { ficha, datos };
}

/** El detalle (37) tal como lo declara la guía — no se recalcula ni se agrupa. */
export function lineasDesdeSerfor(g: GtfSerfor): LineaProducto[] {
  return (g.productos ?? []).map((p) => ({
    cientifico: t(p.cientifico),
    comun: t(p.comun),
    tipoProducto: t(p.tipoProducto),
    presentacion: t(p.presentacion),
    cantidad: Number(p.cantidad ?? 0) || 0,
    unidad: t(p.unidad),
    total: Number(p.volumen ?? 0) || 0,
  }));
}

/**
 * SERFOR publica las medidas en UN string ("105.0 x 101.0 x 6.16"), no en tres
 * columnas. Se parte en d1 × d2 × largo —el orden que usa la guía— y sólo si el
 * texto trae exactamente tres números: con dos o con cuatro no se adivina, se
 * deja vacío. Rellenar una medida mal es peor que dejar el casillero en blanco.
 */
export function partirDimensiones(
  texto: string | null | undefined,
): { d1Cm: number | null; d2Cm: number | null; largoM: number | null } {
  const nums = (texto ?? "").match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (nums.length !== 3) return { d1Cm: null, d2Cm: null, largoM: null };
  const n = nums.map((v) => Number(v.replace(",", ".")));
  return n.every(Number.isFinite)
    ? { d1Cm: n[0], d2Cm: n[1], largoM: n[2] }
    : { d1Cm: null, d2Cm: null, largoM: null };
}

/** Las trozas de la guía para su lista anexa, con las medidas que publicó SERFOR. */
export function trozasDesdeSerfor(g: GtfSerfor): TrozaListada[] {
  return (g.trozas ?? []).map((x) => ({
    codificacion: t(x.codificacion) || null,
    especieComun: t(x.comun) || null,
    especieCientifica: t(x.cientifico) || null,
    producto: t(x.tipoProducto) || null,
    ...partirDimensiones(x.dimensiones),
    cantidad: Number(x.cantidad ?? 1) || 1,
    volumenM3: x.volumen ?? null,
  }));
}

/** El cuerpo completo de la guía de ingreso, listo para el visor. */
export function cuerpoDesdeSerfor(g: GtfSerfor): string {
  const { ficha, datos } = insumosDesdeSerfor(g);
  const input: CuerpoGtfInput = {
    ficha,
    datos,
    lineas: lineasDesdeSerfor(g),
    numeroGtf: t(g.gtfNumber),
    fechaExpedicion: t(g.fechaExpedicion),
    listasTrozas: t(g.listaTrozas),
    gtfOrigen: "",
    origenRecurso: claveOrigen(g.origenRecurso),
    // Sólo si SERFOR lo devolvió Y la guía está vigente: reproducir "REGISTRADA"
    // sobre una guía anulada diría lo contrario de lo que dice la autoridad.
    registroSerfor: /anulad/i.test(t(g.estado)) ? "" : t(g.numeroRegistro),
  };
  return cuerpoGtfOficial(input);
}
