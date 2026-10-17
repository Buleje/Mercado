/**
 * proveedor-identidad.ts — quién es un proveedor y si ya lo tienes (C34, noche 17-10).
 *
 * Tres preguntas, una sola regla para la API y la pantalla:
 *  1. ¿El documento tiene el formato de su tipo? (RUC 11 dígitos, DNI 8).
 *  2. ¿Se parece a uno que ya está? (mismo documento, mismo nombre sin
 *     «S.A.C.» ni tildes, mismo teléfono o correo). Avisa; nunca une solo.
 *  3. ¿Lo que escribes en el buscador está en algún dato del proveedor?
 *
 * El dígito verificador del RUC (módulo 11 de SUNAT) sólo AVISA: el formato
 * es lo que bloquea. Un RUC con 11 dígitos que no cuadra suele ser un dígito
 * mal tipeado, y el usuario lo corrige mejor viendo el aviso que con un 400.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { esDniValido, normalizarDocumento } from "@/lib/rrhh/documento";
import { rucValido } from "@/lib/documents/sunat-comprobante";

/** Lo mínimo de un proveedor para cruzarlo con otro. */
export interface ProveedorParaCruce {
  id: string;
  name: string;
  razonSocial?: string | null;
  tipoDocumento?: string | null;
  documento?: string | null;
  ruc?: string | null;
  phone?: string | null;
  whatsappSecundario?: string | null;
  email?: string | null;
  personaContacto?: string | null;
}

export type MotivoCoincidencia = "documento" | "nombre" | "telefono" | "correo";

export interface Coincidencia {
  id: string;
  nombre: string;
  motivos: MotivoCoincidencia[];
}

const ETIQUETA_MOTIVO: Record<MotivoCoincidencia, string> = {
  documento: "documento",
  nombre: "nombre",
  telefono: "teléfono",
  correo: "correo",
};

/** Formas societarias que no distinguen a un proveedor de otro. */
const FORMAS_SOCIETARIAS = new Set([
  "sac", "saa", "sa", "srl", "eirl", "ltda", "scrl",
  "sociedad", "anonima", "cerrada", "abierta", "limitada", "responsabilidad", "individual", "empresa", "de",
]);

/** «Distribuidora Ucayali S.A.C.» y «DISTRIBUIDORA UCAYALI SAC» → «distribuidora ucayali». */
export function nombreNormalizado(nombre: string | null | undefined): string {
  const tokens = (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  // Se quitan sólo al FINAL y dejando al menos una palabra: «Empresa de
  // Transportes Lima» conserva su «Empresa».
  while (tokens.length > 1 && FORMAS_SOCIETARIAS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/** Los 9 dígitos del celular, sin +51 ni espacios. Menos de 6 dígitos no identifica a nadie. */
export function telefonoNormalizado(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 6) return null;
  return d.length > 9 ? d.slice(-9) : d;
}

function correoNormalizado(correo: string | null | undefined): string | null {
  const c = (correo ?? "").trim().toLowerCase();
  return c.includes("@") ? c : null;
}

/** El tipo de documento que vale: el declarado o, si falta, RUC (el default del formulario). */
export function tipoDeDocumento(tipo: string | null | undefined): string {
  const t = (tipo ?? "").trim().toUpperCase();
  return t || "RUC";
}

/**
 * Formato del documento según su tipo. `null` = bien (o vacío: el documento es
 * opcional). El texto sale tal cual en la pantalla y en el 400 de la API.
 */
export function errorDeDocumento(tipo: string | null | undefined, documento: string | null | undefined): string | null {
  const n = normalizarDocumento(documento);
  if (!n) return null;
  switch (tipoDeDocumento(tipo)) {
    case "RUC":
      return /^\d{11}$/.test(n) ? null : `El RUC tiene 11 dígitos (escribiste ${n.length}).`;
    case "DNI":
      return esDniValido(n) ? null : `El DNI tiene 8 dígitos (escribiste ${n.length}).`;
    default:
      return n.length >= 6 && n.length <= 15 ? null : "El documento tiene entre 6 y 15 letras o números.";
  }
}

/** Aviso que no bloquea: RUC con 11 dígitos cuyo dígito verificador no cuadra. */
export function avisoDeDocumento(tipo: string | null | undefined, documento: string | null | undefined): string | null {
  const n = normalizarDocumento(documento);
  if (!n || tipoDeDocumento(tipo) !== "RUC" || !/^\d{11}$/.test(n)) return null;
  return rucValido(n) ? null : "El último dígito del RUC no cuadra con los otros 10: revisa si está bien escrito.";
}

/** Documentos con los que se reconoce a un proveedor (el RUC «10» lleva su DNI adentro). */
function documentosDe(p: ProveedorParaCruce): string[] {
  const docs = new Set<string>();
  for (const d of [p.documento, p.ruc]) {
    const n = normalizarDocumento(d);
    if (!n) continue;
    docs.add(n);
    if (/^10\d{9}$/.test(n)) docs.add(n.slice(2, 10));
  }
  return [...docs];
}

function nombresDe(p: ProveedorParaCruce): string[] {
  // Menos de 4 letras («SA», «JJ») une proveedores que no tienen nada que ver.
  return [...new Set([p.name, p.razonSocial].map(nombreNormalizado).filter((n) => n.length >= 4))];
}

function telefonosDe(p: ProveedorParaCruce): string[] {
  return [...new Set([p.phone, p.whatsappSecundario].map(telefonoNormalizado).filter((t): t is string => t !== null))];
}

function clavesDe(p: ProveedorParaCruce): Array<[MotivoCoincidencia, string]> {
  const correo = correoNormalizado(p.email);
  return [
    ...documentosDe(p).map((d) => ["documento", d] as [MotivoCoincidencia, string]),
    ...nombresDe(p).map((n) => ["nombre", n] as [MotivoCoincidencia, string]),
    ...telefonosDe(p).map((t) => ["telefono", t] as [MotivoCoincidencia, string]),
    ...(correo ? [["correo", correo] as [MotivoCoincidencia, string]] : []),
  ];
}

/**
 * Proveedores ya guardados que se parecen al candidato, con el porqué. Al
 * editar, `excluirId` saca al propio proveedor. Orden: los de documento
 * primero (son el mismo seguro), después por cantidad de motivos.
 */
export function coincidenciasDeProveedor(
  candidato: Omit<ProveedorParaCruce, "id"> & { id?: string },
  existentes: readonly ProveedorParaCruce[],
  excluirId?: string,
): Coincidencia[] {
  const mias = new Set(clavesDe({ ...candidato, id: candidato.id ?? "" }).map(([m, v]) => `${m}:${v}`));
  if (mias.size === 0) return [];
  const out: Coincidencia[] = [];
  for (const p of existentes) {
    if (p.id === excluirId || (candidato.id && p.id === candidato.id)) continue;
    const motivos = [...new Set(clavesDe(p).filter(([m, v]) => mias.has(`${m}:${v}`)).map(([m]) => m))];
    if (motivos.length > 0) out.push({ id: p.id, nombre: p.razonSocial || p.name, motivos });
  }
  return out.sort(
    (a, b) => Number(b.motivos.includes("documento")) - Number(a.motivos.includes("documento")) || b.motivos.length - a.motivos.length,
  );
}

/** ¿Hay alguna con el mismo documento? Es la que la API frena con 409. */
export function hayMismoDocumento(coincidencias: readonly Coincidencia[]): Coincidencia | null {
  return coincidencias.find((c) => c.motivos.includes("documento")) ?? null;
}

/** «Distribuidora Ucayali (mismo documento y teléfono)». */
export function describirCoincidencia(c: Coincidencia): string {
  const motivos = c.motivos.map((m) => ETIQUETA_MOTIVO[m]);
  const lista = motivos.length > 1 ? `${motivos.slice(0, -1).join(", ")} y ${motivos[motivos.length - 1]}` : motivos[0];
  return `${c.nombre} (mismo ${lista})`;
}

/**
 * Posibles duplicados dentro de la lista: id → con quién se parece. Indexa
 * por clave (no compara todos contra todos) para que 500 proveedores no tarden.
 */
export function duplicadosEnLista(proveedores: readonly ProveedorParaCruce[]): Map<string, Coincidencia[]> {
  const porClave = new Map<string, ProveedorParaCruce[]>();
  for (const p of proveedores) {
    for (const [m, v] of clavesDe(p)) {
      const k = `${m}:${v}`;
      const lista = porClave.get(k);
      if (lista) { if (!lista.includes(p)) lista.push(p); } else porClave.set(k, [p]);
    }
  }
  const out = new Map<string, Coincidencia[]>();
  for (const p of proveedores) {
    const otros = new Map<string, Coincidencia>();
    for (const [m, v] of clavesDe(p)) {
      for (const o of porClave.get(`${m}:${v}`) ?? []) {
        if (o.id === p.id) continue;
        const c = otros.get(o.id) ?? { id: o.id, nombre: o.razonSocial || o.name, motivos: [] };
        if (!c.motivos.includes(m)) c.motivos.push(m);
        otros.set(o.id, c);
      }
    }
    if (otros.size > 0) out.set(p.id, [...otros.values()]);
  }
  return out;
}

/** Sin tildes ni mayúsculas, para comparar lo que se escribe en el buscador. */
function plano(t: string | null | undefined): string {
  return (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * ¿Lo buscado está en el proveedor? Mira nombre, razón social, contacto,
 * correo, documento y teléfonos; «20-123» encuentra el RUC 20123… y «987 654»
 * el celular 987654321.
 */
export function proveedorCoincideBusqueda(p: Omit<ProveedorParaCruce, "id">, texto: string): boolean {
  const q = plano(texto).trim();
  if (!q) return true;
  const enTexto = [p.name, p.razonSocial, p.personaContacto, p.email].some((t) => plano(t).includes(q));
  if (enTexto) return true;
  const digitos = q.replace(/[^a-z0-9]/g, "");
  if (digitos.length < 3) return false;
  const docs = [p.documento, p.ruc].map((d) => (normalizarDocumento(d) ?? "").toLowerCase());
  const tels = [p.phone, p.whatsappSecundario].map((t) => (t ?? "").replace(/\D/g, ""));
  return [...docs, ...tels].some((d) => d.includes(digitos));
}
