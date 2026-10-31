/**
 * Los datos del alta de persona, como se editan en pantalla (todo string) y
 * como viajan a `POST/PATCH /api/adelantos/beneficiarios`.
 *
 * Los cinco campos del 30-10 (qué es para el negocio, Yape, contacto de
 * referencia, fecha de nacimiento y la foto del DNI) son opcionales en la API
 * y en la base. Mientras el servidor no los conozca, el Zod de la ruta los
 * descarta sin error (no es `.strict()`): la persona se crea igual.
 */
import { normalizarNumero, type ResultadoDocumento } from "@/lib/documento/tipos";
import {
  ETIQUETA_RELACION,
  TIPOS_RELACION as VALORES_RELACION,
  type TipoRelacion,
} from "@/lib/adelantos/persona-campos";
import type { BeneficiarioConSaldo } from "../../crear-adelanto/tipos";
import { celularParaGuardar } from "./validacion";

export type Hallado = Extract<ResultadoDocumento, { encontrado: true }>;
export type { TipoRelacion };

/**
 * Qué es la persona para el negocio: los valores de la API (una sola fuente,
 * `persona-campos`). En el chip, «Proveedor de madera»: así lo pidió Brandon y
 * así se distingue del que vende otra cosa; en la tabla basta «Proveedor».
 */
export const TIPOS_RELACION = VALORES_RELACION.map((valor) => ({
  valor,
  rotulo: valor === "proveedor" ? "Proveedor de madera" : ETIQUETA_RELACION[valor],
}));

const esTipoRelacion = (v: unknown): v is TipoRelacion =>
  VALORES_RELACION.some((t) => t === v);

/** Lo que la API devuelve desde el 30-10 (puede faltar si el servidor es viejo). */
export type CamposNuevosPersona = {
  tipoRelacion?: string | null;
  yape?: string | null;
  referenciaNombre?: string | null;
  referenciaTelefono?: string | null;
  fechaNacimiento?: string | Date | null;
  tieneFotoDocumento?: boolean;
};

export type PersonaEditable = BeneficiarioConSaldo & CamposNuevosPersona;

export type DatosPersona = {
  documento: string;
  nombre: string;
  telefono: string;
  email: string;
  tipoRelacion: TipoRelacion | "";
  fechaNacimiento: string;
  yape: string;
  /** El Yape es el mismo número que el celular: se copia al guardar. */
  yapeIgualCelular: boolean;
  referenciaNombre: string;
  referenciaTelefono: string;
  direccion: string;
  departamento: string;
  provincia: string;
  distrito: string;
  limite: string;
  banco: string;
  cuentaBancaria: string;
  cci: string;
  notas: string;
};

/** «AAAA-MM-DD» para el `<input type="date">`. La base la guarda como fecha sola (UTC). */
export function fechaParaInput(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return "";
}

export function datosDe(p?: PersonaEditable): DatosPersona {
  const yape = p?.yape ?? "";
  const telefono = p?.telefono ?? "";
  return {
    documento: p?.documento ?? "",
    nombre: p?.nombre ?? "",
    telefono,
    email: p?.email ?? "",
    tipoRelacion: esTipoRelacion(p?.tipoRelacion) ? p.tipoRelacion : "",
    fechaNacimiento: fechaParaInput(p?.fechaNacimiento),
    yape,
    yapeIgualCelular: !!yape && celularParaGuardar(yape) === celularParaGuardar(telefono),
    referenciaNombre: p?.referenciaNombre ?? "",
    referenciaTelefono: p?.referenciaTelefono ?? "",
    direccion: p?.direccion ?? "",
    departamento: p?.departamento ?? "",
    provincia: p?.provincia ?? "",
    distrito: p?.distrito ?? "",
    limite: p?.limiteCredito != null ? String(p.limiteCredito) : "",
    banco: p?.banco ?? "",
    cuentaBancaria: p?.cuentaBancaria ?? "",
    cci: p?.cci ?? "",
    notas: p?.notas ?? "",
  };
}

/** El número de Yape que se guarda: el celular si se marcó «es el mismo». */
export function yapeQueSeGuarda(d: DatosPersona): string {
  return celularParaGuardar(d.yapeIgualCelular ? d.telefono : d.yape);
}

/** Es una empresa (RUC): no tiene fecha de nacimiento ni foto de DNI. */
export function esEmpresa(d: DatosPersona, oficial: Hallado | null): boolean {
  return oficial?.tipo === "RUC" || normalizarNumero(d.documento).length === 11;
}

export function cuerpoDe(d: DatosPersona, oficial: Hallado | null): Record<string, unknown> {
  const lim = d.limite.trim() ? Number(d.limite) : null;
  const empresa = esEmpresa(d, oficial);
  return {
    nombre: d.nombre.trim(),
    documento: normalizarNumero(d.documento) || undefined,
    telefono: d.telefono.trim() || undefined,
    notas: d.notas.trim() || undefined,
    limiteCredito: lim && lim > 0 ? lim : null,
    email: d.email.trim() || null,
    direccion: d.direccion.trim() || null,
    departamento: d.departamento.trim() || null,
    provincia: d.provincia.trim() || null,
    distrito: d.distrito.trim() || null,
    banco: d.banco || null,
    cuentaBancaria: d.cuentaBancaria.trim() || null,
    /* Sin espacios ni guiones: «002-193-…» copiado del voucher es el mismo CCI. */
    cci: d.cci.replace(/[\s-]/g, "") || null,
    tipoRelacion: d.tipoRelacion || null,
    yape: yapeQueSeGuarda(d) || null,
    referenciaNombre: d.referenciaNombre.trim() || null,
    referenciaTelefono: celularParaGuardar(d.referenciaTelefono) || null,
    fechaNacimiento: empresa ? null : d.fechaNacimiento || null,
    /* Sólo si el padrón contestó DE VERDAD en esta edición. Un dato de
       demostración no puede quedar guardado como «verificado». */
    ...(oficial && !oficial.demo
      ? {
          tipoDocumento: oficial.tipo,
          razonSocial: oficial.razonSocial ?? null,
          estadoSunat: oficial.estado ?? null,
          condicionSunat: oficial.condicion ?? null,
          verificadoEn: new Date().toISOString(),
        }
      : oficial
        ? { tipoDocumento: oficial.tipo }
        : {}),
  };
}
