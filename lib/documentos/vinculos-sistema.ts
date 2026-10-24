/**
 * «Vínculos con el sistema» de una carpeta del Archivo (Brandon 24-10: «que a
 * las carpetas se les marque… cuáles están vinculadas con el sistema, es decir
 * con forestal… y dirá con qué página se vinculó, dirección y detalles»).
 *
 * Una carpeta está vinculada al sistema de dos maneras, las dos SIN schema:
 *  · `ligado`: alguien la ató a un tercero (etiqueta `parte:`, `tercero:`…,
 *    ADR-502 / Archivo › Terceros). Se cambia, se quita y se le pone alias.
 *  · `modulo`: la creó un módulo para guardar SUS papeles (las guías del Libro
 *    CTP, el plan del Libro TH, las cargas medidas, los pagos del equipo). Es
 *    de sólo lectura: el módulo la vuelve a buscar por su nombre o su etiqueta.
 *
 * Puro y sin `server-only`: lo usan las marcas del árbol, el modal y la ruta.
 */

import { hrefDe } from "@/lib/admin/enlaces-panel";
import { CARPETA_GUIAS } from "@/lib/forestal/documentos-guia";
import { RAIZ_DRIVE_LOTH } from "@/lib/forestal/plan-documentos-tipos";
import { CARPETA_ENTIDAD } from "./enlaces-entidad";
import { leerVinculo, nombrePorDefecto, vinculosDeCarpeta, type NombreTercero, type TipoTercero } from "./terceros-vinculo";

/** Igual que `CARPETA_CARGAS` (`lib/forestal/medicion-carga-server.ts`, que es server-only). */
export const CARPETA_CARGAS_MEDIDAS = "Cargas medidas";

export type TipoVinculoSistema = TipoTercero | "plan" | "guias" | "permisos" | "cargas" | "equipo";

export interface VinculoSistema {
  /** La etiqueta (ligado o `plan:`) o `ruta:<carpeta del módulo>`. */
  clave: string;
  tipo: TipoVinculoSistema;
  origen: "ligado" | "modulo";
  /** El módulo en corto, para la marca: «Libro CTP», «Adelantos». */
  modulo: string;
  /** Dónde vive en el panel: `["Forestal", "Libro CTP", "Directorio"]`. */
  pagina: readonly string[];
  /** La dirección en el panel (`/admin?tab=…`); null si no tiene ficha. */
  href: string | null;
  /** El nombre cuando no hace falta preguntarle al servidor (plan, carpeta del módulo). */
  nombreFijo: string | null;
  /** La carpeta madre de la que viene (una subcarpeta del módulo); null = es de esta carpeta. */
  heredadoDe: string | null;
}

interface Destino {
  modulo: string;
  pagina: readonly string[];
  href: (id: string) => string | null;
}

const FORESTAL_CTP = ["Forestal", "Libro CTP"] as const;
const FORESTAL_TH = ["Forestal", "Libro TH"] as const;
const panel = (tab: string, vista: string) => `/admin?${new URLSearchParams({ tab, vista }).toString()}`;

/** A qué página del panel lleva cada tipo de tercero ligado (la misma ficha que abre `hrefDe`). */
export const DESTINO_TERCERO: Readonly<Record<TipoTercero, Destino>> = {
  comunidad: { modulo: "Libro CTP", pagina: [...FORESTAL_CTP, "Directorio"], href: (id) => hrefDe("parte", id) },
  persona: { modulo: "Adelantos", pagina: ["Plata", "Adelantos"], href: (id) => hrefDe("cuenta-adelantos", `benef:${id}`) },
  proveedor: { modulo: "Proveedores", pagina: ["Compras", "Proveedores"], href: (id) => hrefDe("proveedor", id) },
  cliente: { modulo: "Clientes", pagina: ["Clientes", "Mis clientes"], href: (tel) => hrefDe("cliente", tel) },
  colaborador: { modulo: "Equipo", pagina: ["Equipo", "Personal"], href: (id) => hrefDe("colaborador", id) },
  otro: { modulo: "Terceros", pagina: ["Documentos", "Archivo", "Terceros"], href: () => null },
};

/** Las carpetas que crea un módulo, por su ruta desde la raíz. La más larga primero (gana la más precisa). */
const RUTAS_MODULO: readonly { ruta: readonly string[]; tipo: TipoVinculoSistema; modulo: string; pagina: readonly string[]; href: string }[] = [
  { ruta: CARPETA_ENTIDAD.permiso, tipo: "permisos", modulo: "Libro CTP", pagina: [...FORESTAL_CTP, "Contratos"], href: panel("ctp-libro-operaciones", "contratos") },
  { ruta: CARPETA_ENTIDAD.colaborador, tipo: "equipo", modulo: "Equipo", pagina: ["Equipo", "Pagos"], href: "/admin?tab=rrhh" },
  { ruta: [CARPETA_GUIAS], tipo: "guias", modulo: "Libro CTP", pagina: [...FORESTAL_CTP, "Ingresos"], href: panel("ctp-libro-operaciones", "ingresos") },
  { ruta: [CARPETA_CARGAS_MEDIDAS], tipo: "cargas", modulo: "Libro TH", pagina: [...FORESTAL_TH, "GTF"], href: panel("loth-libro-operaciones", "gtf") },
  { ruta: [RAIZ_DRIVE_LOTH], tipo: "plan", modulo: "Libro TH", pagina: [...FORESTAL_TH, "Plan de Manejo"], href: panel("loth-libro-operaciones", "plan") },
];

/** Las carpetas de módulo que llevan la MARCA (raíces del Archivo; las de dos niveles se ven en el modal). */
const RAICES_CON_MARCA = new Set(RUTAS_MODULO.filter((r) => r.ruta.length === 1).map((r) => r.ruta[0]));

const PREFIJO_PLAN = "plan:";

export interface CarpetaParaVinculo {
  id: string;
  name: string;
  parentId: string | null;
  tags?: readonly string[] | null;
}

/** Los nombres de la carpeta y sus madres, desde la raíz (tope 30 por si hay un ciclo). */
export function rutaDeCarpeta(f: CarpetaParaVinculo, porId: ReadonlyMap<string, CarpetaParaVinculo>): CarpetaParaVinculo[] {
  const ruta: CarpetaParaVinculo[] = [];
  let actual: CarpetaParaVinculo | undefined = f;
  while (actual && ruta.length < 30) {
    ruta.unshift(actual);
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
  }
  return ruta;
}

/** Los vínculos ligados a mano (etiquetas de tercero), en el orden de la carpeta. */
function ligados(f: CarpetaParaVinculo): VinculoSistema[] {
  return vinculosDeCarpeta({ tags: f.tags ? [...f.tags] : [] }).flatMap((clave) => {
    const v = leerVinculo(clave);
    if (!v) return [];
    const d = DESTINO_TERCERO[v.tipo];
    return [{ clave, tipo: v.tipo, origen: "ligado" as const, modulo: d.modulo, pagina: d.pagina, href: d.href(v.id), nombreFijo: null, heredadoDe: null }];
  });
}

/** El plan del Libro TH que guarda sus papeles acá (la raíz lleva `plan:<id>`). */
function delPlan(f: CarpetaParaVinculo): VinculoSistema | null {
  const tag = (f.tags ?? []).find((t) => t.startsWith(PREFIJO_PLAN) && t.length > PREFIJO_PLAN.length);
  if (!tag) return null;
  return { clave: tag, tipo: "plan", origen: "modulo", modulo: "Libro TH", pagina: [...FORESTAL_TH, "Plan de Manejo"], href: panel("loth-libro-operaciones", "plan"), nombreFijo: f.name, heredadoDe: null };
}

/** La carpeta (o una madre) es de un módulo por su ruta. */
function delModulo(ruta: readonly CarpetaParaVinculo[]): VinculoSistema | null {
  const nombres = ruta.map((c) => c.name.trim());
  for (const r of RUTAS_MODULO) {
    if (nombres.length < r.ruta.length || !r.ruta.every((n, i) => nombres[i] === n)) continue;
    const raiz = ruta[r.ruta.length - 1];
    const propia = nombres.length === r.ruta.length;
    return {
      clave: `ruta:${r.ruta.join("/")}`, tipo: r.tipo, origen: "modulo", modulo: r.modulo, pagina: r.pagina, href: r.href,
      nombreFijo: r.ruta.join(" › "), heredadoDe: propia ? null : raiz.name,
    };
  }
  return null;
}

/** Todo lo que ata la carpeta al sistema: ligados, el plan y el módulo que la creó. */
export function vinculosDeCarpetaSistema(f: CarpetaParaVinculo, porId: ReadonlyMap<string, CarpetaParaVinculo>): VinculoSistema[] {
  const lista = ligados(f);
  const plan = delPlan(f);
  if (plan) lista.push(plan);
  const modulo = delModulo(rutaDeCarpeta(f, porId));
  // La raíz del plan ya dice «Libro TH»: no se repite la carpeta «Libro TH» heredada.
  if (modulo && !(plan && modulo.tipo === "plan")) lista.push(modulo);
  return lista;
}

/**
 * Lo que lleva la marca de enlace en el árbol: lo ligado, la raíz de un plan y
 * la raíz de un módulo. Sin las madres (no hace falta el árbol entero): las
 * subcarpetas de un módulo se ven en el modal, no en cada fila.
 */
export function vinculosConMarca(f: CarpetaParaVinculo): VinculoSistema[] {
  const lista = ligados(f);
  const plan = delPlan(f);
  if (plan) lista.push(plan);
  if (!plan && !f.parentId && RAICES_CON_MARCA.has(f.name.trim())) {
    const m = delModulo([f]);
    if (m) lista.push(m);
  }
  return lista;
}

/** El nombre a mostrar: el alias del negocio, el nombre real o, sin ficha, el genérico. */
export function nombreDeVinculo(v: VinculoSistema, nombres: Readonly<Record<string, NombreTercero | undefined>>): string {
  const n = nombres[v.clave];
  if (n?.alias?.trim()) return n.alias.trim();
  if (n?.nombre?.trim()) return n.nombre.trim();
  if (v.nombreFijo) return v.nombreFijo;
  const t = leerVinculo(v.clave);
  return t ? nombrePorDefecto(t.tipo, t.id) : v.clave;
}

/** El texto del ⓘ de la marca: «Ligada a: Santa Rosa (Libro CTP) · Plan 19-SEC… (Libro TH)». */
export function rotuloDeMarca(vinculos: readonly VinculoSistema[], nombres: Readonly<Record<string, NombreTercero | undefined>>): string {
  return `Ligada a: ${vinculos.map((v) => `${nombreDeVinculo(v, nombres)} (${v.modulo})`).join(" · ")}`;
}

/** Tope del alias (lo valida la ruta): corto, para que entre en la marca y en la fila. */
export const TOPE_ALIAS = 60;
