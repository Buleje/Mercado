/**
 * «Recientes» del panel (M06 de la noche 17-10): lo último que abriste —
 * pestaña › vista › la ficha si la URL la nombra— para volver con un clic.
 *
 * Se arma SÓLO desde la URL: la ficha de un cliente es `?cliente=<celular>`,
 * la de un pedido `?pedido=<id>`… y esa tabla ya existe
 * (`COSAS_DEL_PANEL` de `enlaces-panel.ts`), así que una ficha nueva que abra
 * por enlace aparece acá sola. El título lo pone el que registra: el de la
 * ventana abierta si se puede leer, si no «Cliente 987 654 321» (un id largo
 * —un cuid— nunca se muestra).
 *
 * Puro: el registro (`hooks/use-recientes-panel.ts`) lee la URL y escribe.
 */

import { COSAS_DEL_PANEL, hrefDeDestino, type CosaDelPanel } from "@/lib/admin/enlaces-panel";
import { ANIDADAS_POR_MODULO, vistasDelModulo } from "@/lib/admin/subvistas-modulos";

export interface Reciente {
  /** Ruta canónica (`/admin?tab=…`): sin parámetros de paso como `?q=` o `?cerrar=1`. */
  href: string;
  /** Lo que se abrió: «Juan Pérez», «Quién me debe», «Mis Clientes». */
  titulo: string;
  /** Dónde está: «Ventas & Caja › Me deben». */
  camino: string;
  /** «Cliente», «Pedido»… si es una ficha; `null` si es una pestaña o vista. */
  tipo: string | null;
  /** Cuándo (ms). */
  en: number;
}

export const TOPE_RECIENTES = 10;

/** Cómo se llama cada cosa con ficha, para el título genérico y el chip. */
const TIPO_DE_COSA: Partial<Record<CosaDelPanel, string>> = {
  permiso: "Permiso",
  troza: "Troza",
  arbol: "Árbol",
  ingreso: "Ingreso",
  parte: "Contacto",
  lote: "Lote",
  colaborador: "Colaborador",
  "cuenta-adelantos": "Cuenta de adelantos",
  turno: "Turno",
  pedido: "Pedido",
  cliente: "Cliente",
  producto: "Producto",
  proveedor: "Proveedor",
  oc: "Orden de compra",
  carpeta: "Carpeta",
};

interface FichaEnUrl {
  cosa: CosaDelPanel;
  tipo: string;
  tab: string;
  /** El parámetro que lleva el id (`cliente`, `pedido`…). */
  param: string;
  destino: (id: string) => { tab: string; params: Record<string, string> };
}

const MARCA = "\u0000id\u0000";

/** Las fichas que abren por URL, con el parámetro que lleva su id (derivado, no copiado). */
const FICHAS_EN_URL: readonly FichaEnUrl[] = (Object.entries(COSAS_DEL_PANEL) as [CosaDelPanel, (typeof COSAS_DEL_PANEL)[CosaDelPanel]][])
  .flatMap(([cosa, fila]) => {
    const tipo = TIPO_DE_COSA[cosa];
    if (!fila.abre || !fila.destino || fila.pideId === false || !tipo) return [];
    const muestra = fila.destino(MARCA);
    const param = Object.entries(muestra.params).find(([, v]) => v === MARCA)?.[0];
    return param ? [{ cosa, tipo, tab: muestra.tab, param, destino: fila.destino }] : [];
  });

/** Un id que se puede mostrar: un celular, un número de pedido. Un cuid (25 letras) no. */
export function idLegible(id: string): string | null {
  const limpio = id.trim();
  if (!limpio || limpio.length > 12) return null;
  if (/^\d{9}$/.test(limpio)) return `${limpio.slice(0, 3)} ${limpio.slice(3, 6)} ${limpio.slice(6)}`;
  return /^[\w+\-. ]+$/.test(limpio) ? limpio : null;
}

/**
 * La entrada de una URL del panel. `etiquetaTab` = el rótulo de la barra
 * (null si el tab no existe: no se anota). `tituloVisible` = el de la ventana
 * de la ficha si se pudo leer.
 */
export function entradaDeUrl(
  url: string,
  etiquetaTab: (tab: string) => string | null,
  tituloVisible: string | null = null,
  ahora = Date.now(),
): Reciente | null {
  let u: URL;
  try {
    u = new URL(url, "http://panel.local");
  } catch {
    return null;
  }
  const tab = u.searchParams.get("tab");
  if (!tab) return null;
  const rotuloTab = etiquetaTab(tab);
  if (!rotuloTab) return null;

  const vistaKey = u.searchParams.get("vista");
  const vista = vistaKey ? vistasDelModulo(tab).find((v) => v.key === vistaKey) : undefined;
  const subKey = u.searchParams.get("sub");
  const anidada = vista && subKey ? ANIDADAS_POR_MODULO[tab]?.find((a) => a.vista === vista.key && a.key === subKey) : undefined;
  const partes = [rotuloTab, vista?.label, anidada?.label].filter((p): p is string => Boolean(p));

  const ficha = FICHAS_EN_URL.find((f) => f.tab === tab && u.searchParams.get(f.param));
  if (ficha) {
    const id = u.searchParams.get(ficha.param) ?? "";
    const legible = idLegible(id);
    return {
      href: hrefDeDestino(ficha.destino(id)),
      titulo: limpiarTitulo(tituloVisible) ?? (legible ? `${ficha.tipo} ${legible}` : ficha.tipo),
      camino: partes.join(" › "),
      tipo: ficha.tipo,
      en: ahora,
    };
  }

  const params: Record<string, string> = {};
  if (vista) params.vista = vista.key;
  if (anidada) params.sub = anidada.key;
  return {
    href: hrefDeDestino({ tab, params }),
    titulo: partes[partes.length - 1],
    camino: partes.slice(0, -1).join(" › "),
    tipo: null,
    en: ahora,
  };
}

/** El título de una ventana, corto y sin los «Cargando…» de paso. */
export function limpiarTitulo(t: string | null | undefined): string | null {
  const limpio = (t ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length < 2 || /^(cargando|trayendo|buscando)/i.test(limpio)) return null;
  return limpio.length > 60 ? `${limpio.slice(0, 59)}…` : limpio;
}

/** La nueva arriba; si ya estaba (misma ruta) sube y conserva el mejor título. */
export function sumarReciente(lista: readonly Reciente[], nueva: Reciente, tope = TOPE_RECIENTES): Reciente[] {
  const previa = lista.find((r) => r.href === nueva.href);
  /* Volver a la misma ficha sin poder leer el nombre no pisa el nombre que ya se leyó. */
  const titulo = previa && previa.tipo && nueva.titulo.startsWith(previa.tipo) && !previa.titulo.startsWith(previa.tipo)
    ? previa.titulo
    : nueva.titulo;
  return [{ ...nueva, titulo }, ...lista.filter((r) => r.href !== nueva.href)].slice(0, tope);
}

/** Pone el título leído de la ventana a la entrada de esa ruta. */
export function retitular(lista: readonly Reciente[], href: string, titulo: string): Reciente[] {
  const limpio = limpiarTitulo(titulo);
  if (!limpio) return [...lista];
  return lista.map((r) => (r.href === href ? { ...r, titulo: limpio } : r));
}

/** Lo guardado, validado (un JSON viejo o roto no rompe el panel). */
export function leerRecientes(raw: string | null): Reciente[] {
  if (!raw) return [];
  try {
    const datos: unknown = JSON.parse(raw);
    if (!Array.isArray(datos)) return [];
    return datos
      .filter((r): r is Reciente =>
        typeof r === "object" && r !== null &&
        typeof (r as Reciente).href === "string" && (r as Reciente).href.startsWith("/admin?") &&
        typeof (r as Reciente).titulo === "string" &&
        typeof (r as Reciente).camino === "string" &&
        typeof (r as Reciente).en === "number",
      )
      .map((r) => ({ ...r, tipo: typeof r.tipo === "string" ? r.tipo : null }))
      .slice(0, TOPE_RECIENTES);
  } catch {
    return [];
  }
}

/** ¿Coincide con lo que se busca? (título o camino, sin tildes). */
export function recienteCoincide(r: Reciente, q: string): boolean {
  const n = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const consulta = n(q.trim());
  if (consulta.length < 2) return false;
  return n(`${r.titulo} ${r.camino} ${r.tipo ?? ""}`).includes(consulta);
}
