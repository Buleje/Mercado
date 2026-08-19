/**
 * guia-ficha.ts — la guía entera en secciones, para mirarla en pantalla (ADR-350).
 *
 * El papel imprimible ya existe (ADR-348) y sirve para el expediente. Lo que
 * faltaba es la **ficha**: abrir la guía, ver todo lo que el libro sabe de ella
 * —quién la emitió, a quién viene, quién la trajo, qué trae, pieza por pieza— y
 * **recepcionarla ahí mismo**. Un documento que se revisa en un papel y se
 * recibe en otra pantalla se recibe sin revisar.
 *
 * Las secciones salen acá y no del componente para que la ficha, el papel y el
 * Excel digan lo mismo: si cada uno arma su lista de campos, el que revisa ve
 * uno y el fiscalizador otro.
 *
 * PURO y client-safe.
 */

import { leerGtfDatos } from "./ctp-gtf-datos";
import type { GuiaIngreso, LineaDeGuia } from "./ingresos-por-guia";

/** Un dato de la ficha. `null` = el libro no lo tiene (se muestra, no se oculta). */
export interface CampoFicha {
  label: string;
  valor: string | null;
  /** Casillero del formato oficial, si le corresponde uno. */
  casillero?: string;
}

export interface SeccionFicha {
  titulo: string;
  /** Los casilleros que cubre, como los cita la autoridad. */
  rango?: string;
  campos: CampoFicha[];
}

const t = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

const ubicacion = (dep?: string, prov?: string, dist?: string): string | null =>
  t([dist, prov, dep].filter((x) => (x ?? "").trim()).join(" · "));

/** Lo que el ingreso guarda del documento, además de sus asientos. */
export interface LineaConGuia extends LineaDeGuia {
  gtfDatos?: unknown;
  originType?: string | null;
  originSourceNumber?: string | null;
  originRegion?: string | null;
  originDistrict?: string | null;
  providerDocument?: string | null;
  providerDocumentType?: string | null;
  ctpProductCode?: string | null;
  notes?: string | null;
  serforNumeroRegistro?: string | null;
}

/**
 * Las secciones de la ficha, en el orden del formato.
 *
 * Se muestran **todas**, incluso las vacías: un bloque que desaparece porque no
 * tiene datos hace creer que la guía no lo necesita. Lo que falta se ve faltando
 * — que es justo lo que hay que completar antes de presentar el libro.
 */
export function seccionesDeGuia(guia: GuiaIngreso<LineaConGuia>): SeccionFicha[] {
  const p = guia.lineas[0];
  const d = leerGtfDatos(p.gtfDatos);

  return [
    {
      titulo: "Documento y origen",
      rango: "casilleros (2) a (12)",
      campos: [
        { label: "N° de guía", valor: t(guia.gtfNumber), casillero: "4" },
        { label: "Serie", valor: t(guia.gtfSeries) },
        { label: "Tipo de documento", valor: t(guia.docType) ?? "GTF", casillero: "3" },
        { label: "Fecha del documento", valor: t(guia.gtfDate ? String(guia.gtfDate).slice(0, 10) : null) },
        { label: "N° de registro SNIFFS", valor: t(p.serforNumeroRegistro) },
        { label: "Título habilitante", valor: t(p.originCode), casillero: "6" },
        { label: "N° de resolución", valor: t(p.originSourceNumber), casillero: "8" },
        { label: "Tipo de origen", valor: t(p.originType), casillero: "5" },
        { label: "Procedencia", valor: ubicacion(p.originRegion ?? "", "", p.originDistrict ?? "") },
        { label: "Código de CTP de procedencia", valor: t(p.ctpProductCode), casillero: "9" },
      ],
    },
    {
      titulo: "Proveedor / titular del recurso",
      rango: "casilleros (7) y (13) a (21)",
      campos: [
        { label: "Nombre o razón social", valor: t(p.providerName), casillero: "7" },
        {
          label: "Documento",
          valor: t(p.providerDocument) ? `${t(p.providerDocumentType) ?? "DOC"} ${t(p.providerDocument)}` : null,
        },
        { label: "Propietario del producto", valor: t(d.propietario?.nombre), casillero: "13" },
        {
          label: "Documento del propietario",
          valor: t(d.propietario?.docNumero) ? `${d.propietario.docTipo} ${d.propietario.docNumero}` : null,
          casillero: "14/15",
        },
        { label: "Dirección", valor: t(d.propietario?.direccion), casillero: "16" },
        {
          label: "Ubicación",
          valor: ubicacion(d.propietario?.departamento, d.propietario?.provincia, d.propietario?.distrito),
          casillero: "17/18/19",
        },
      ],
    },
    {
      titulo: "Destinatario",
      rango: "casilleros (22) a (28)",
      campos: [
        { label: "Nombre o razón social", valor: t(d.destinatario?.nombre), casillero: "22" },
        {
          label: "Documento",
          valor: t(d.destinatario?.docNumero) ? `${d.destinatario.docTipo} ${d.destinatario.docNumero}` : null,
          casillero: "23/24",
        },
        { label: "Dirección", valor: t(d.destinatario?.direccion), casillero: "25" },
        {
          label: "Ubicación",
          valor: ubicacion(d.destinatario?.departamento, d.destinatario?.provincia, d.destinatario?.distrito),
          casillero: "26/27/28",
        },
      ],
    },
    {
      titulo: "Transportista y vehículo",
      rango: "casilleros (29) a (34)",
      campos: [
        { label: "Modo de transporte", valor: t(d.vehiculo?.modo), casillero: "30" },
        { label: "Empresa de transporte", valor: t(d.transportista?.nombre) },
        { label: "Tipo de vehículo", valor: t(d.vehiculo?.tipo), casillero: "31" },
        {
          /* Placa o matrícula según el modo: en la selva central buena parte de
             la madera sale por río y una guía fluvial no lleva placa. */
          label: d.vehiculo?.modo === "fluvial" ? "Embarcación / matrícula" : "Placa",
          valor: t(d.vehiculo?.modo === "fluvial" ? d.vehiculo?.embarcacion || d.vehiculo?.placa : d.vehiculo?.placa),
          casillero: "31",
        },
        { label: "Conductor", valor: t(d.vehiculo?.conductor), casillero: "32" },
        { label: "DNI del conductor", valor: t(d.vehiculo?.conductorDni), casillero: "33" },
        { label: "Licencia de conducir", valor: t(d.vehiculo?.licencia), casillero: "34" },
      ],
    },
  ];
}

/** Cuántos casilleros de la ficha están llenos — el «qué falta» en un número. */
export function completitudFicha(secciones: readonly SeccionFicha[]): {
  llenos: number;
  total: number;
  pct: number;
  faltan: string[];
} {
  const campos = secciones.flatMap((s) => s.campos);
  const llenos = campos.filter((c) => c.valor != null).length;
  return {
    llenos,
    total: campos.length,
    pct: campos.length > 0 ? Math.round((llenos / campos.length) * 100) : 0,
    faltan: campos.filter((c) => c.valor == null).map((c) => c.label),
  };
}
