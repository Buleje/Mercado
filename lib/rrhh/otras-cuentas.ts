/**
 * otras-cuentas.ts — «Sus cuentas» de la ficha del colaborador (Brandon 24-10:
 * «que se vinculen los sistemas así para evitar confusiones»).
 *
 * La misma persona suele estar anotada en varios lados: trabajador en RRHH,
 * persona en Mi Plata (Adelantos), proveedor que te vende, cliente con fiado,
 * comunidad del directorio forestal. Acá se decide, SIN base, si otra cuenta
 * es de él: mismo documento (normalizado) o mismo celular (últimos 9 dígitos).
 * Nunca por nombre: dos «Juan Pérez» no son la misma persona.
 *
 * PURO: sin Prisma, React ni fetch. El servidor (`CuentasColaboradorDB`) busca
 * y arma; el panel dibuja.
 */

import { formatCurrency } from "@/lib/currency";
import { normalizarDocumento } from "./documento";

export type TipoOtraCuenta = "persona" | "proveedor" | "cliente" | "comunidad";
export type MotivoCoincidencia = "documento" | "celular";
export type TonoCuenta = "bien" | "atencion" | "neutro";

export interface OtraCuentaDTO {
  /** `tipo:id` — la clave con que el panel recuerda «No es él». */
  clave: string;
  tipo: TipoOtraCuenta;
  id: string;
  nombre: string;
  /** Por qué se cree que es él; documento primero. */
  por: MotivoCoincidencia[];
  /** «Te debe S/ 150», «Al día»… o `null` si no hay plata que mostrar. */
  cifra: string | null;
  tono: TonoCuenta;
  /** A la ficha de esa cuenta en su módulo, o `null`. */
  href: string | null;
  /** Sólo una persona de Mi Plata sin dueño, y si él todavía no tiene cuenta. */
  vinculable: boolean;
}

export interface OtrasCuentasDTO {
  /** Con qué se buscó: sin documento ni celular no hay cómo encontrar nada. */
  buscaPor: { documento: boolean; celular: boolean };
  cuentas: OtraCuentaDTO[];
}

export const ETIQUETA_TIPO: Record<TipoOtraCuenta, string> = {
  persona: "Persona en Mi Plata",
  proveedor: "Proveedor",
  cliente: "Cliente",
  comunidad: "Comunidad / tercero forestal",
};

/** Los últimos 9 dígitos (celular peruano sin +51). Menos de 9 dígitos → `null`: no une nada. */
export function ultimos9(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

/**
 * ¿Por qué esta otra cuenta sería de él? Lista vacía = no es.
 * `documentos` y `telefonos` traen todo lo que la otra cuenta tiene anotado
 * (un proveedor tiene `documento` y `ruc`).
 */
export function motivosDeCoincidencia(
  el: { documento: string | null | undefined; celular: string | null | undefined },
  otra: { documentos: (string | null | undefined)[]; telefonos: (string | null | undefined)[] },
): MotivoCoincidencia[] {
  const motivos: MotivoCoincidencia[] = [];
  const doc = normalizarDocumento(el.documento);
  if (doc && otra.documentos.some((d) => normalizarDocumento(d) === doc)) motivos.push("documento");
  const tel = ultimos9(el.celular);
  if (tel && otra.telefonos.some((t) => ultimos9(t) === tel)) motivos.push("celular");
  return motivos;
}

const soles = (n: number) => formatCurrency(Math.abs(n));

/** Convención de `unificarCuentas`: positivo = TE debe; negativo = le debes. */
export function textoDeSaldo(neto: number | null | undefined): { cifra: string | null; tono: TonoCuenta } {
  if (neto == null || !Number.isFinite(neto)) return { cifra: null, tono: "neutro" };
  if (Math.abs(neto) < 0.005) return { cifra: "Al día", tono: "bien" };
  return neto > 0 ? { cifra: `Te debe ${soles(neto)}`, tono: "atencion" } : { cifra: `Le debes ${soles(neto)}`, tono: "atencion" };
}

const ORDEN_TIPO: Record<TipoOtraCuenta, number> = { persona: 0, comunidad: 1, proveedor: 2, cliente: 3 };

/** Por documento antes que sólo por celular; después por tipo y nombre. */
export function ordenarCuentas(cuentas: OtraCuentaDTO[]): OtraCuentaDTO[] {
  const peso = (c: OtraCuentaDTO) => (c.por.includes("documento") ? 0 : 1);
  return [...cuentas].sort(
    (a, b) => peso(a) - peso(b) || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** «Mismo DNI», «Mismo celular», «Mismo DNI y celular». */
export function textoDeMotivos(por: MotivoCoincidencia[]): string {
  const doc = por.includes("documento");
  const cel = por.includes("celular");
  if (doc && cel) return "Mismo documento y celular";
  if (doc) return "Mismo documento";
  return "Mismo celular";
}
