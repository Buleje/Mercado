/**
 * croquis-componentes — la LEYENDA del plano como catálogo (ADR-465, 03-10).
 *
 * Cada renglón de la leyenda («15 Cinta principal», «28 Río / canal de agua»)
 * es un componente con una CATEGORÍA: qué es (madera, una máquina, un techo,
 * el baño), que no es lo mismo que qué se hace ahí (`ZonaTipo`). La categoría
 * decide tres cosas:
 *   1. el FORMATO en el mapa, copiado de la simbología de la lámina (ramada
 *      rayada, techo parabólico punteado azul, cerco marrón, malla verde
 *      azulada, río azul claro, maquinaria amarilla) — con tokens del DS;
 *   2. el tipo funcional sugerido (maquinaria → aserrado, acceso → entrada…);
 *   3. si ahí se ubica madera (al baño no se lleva una pila).
 *
 * El clasificador es por palabras clave y en ORDEN: «Acopio de trozas para el
 * coche» es madera aunque diga coche; «Rodillos (salida de madera)» es una
 * máquina aunque diga madera. Probado con los 37 renglones del plano v9.
 *
 * PURO y client-safe (lo usan la pantalla, la importación del PDF y los tests).
 */

import type { CategoriaComponente, ComponenteZona, PlantaZona, ZonaTipo } from "./planta-zona-types";
import { zonaTipoMeta } from "./planta-zona-types";

export const normalTexto = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El número de la leyenda que lleva un código de zona («PT-08» → 8, «PP-05b» y «PP-05-3» → 5); null si no sigue el patrón. */
export function numeroDeCodigo(codigo: string): number | null {
  const m = /^[A-Z]{1,4}-0*(\d{1,3})(?:[a-z]|-\d{1,2})?$/i.exec(codigo.trim());
  return m ? Number(m[1]) : null;
}

// ─── Formato (la simbología de la lámina) ──────────────────────────────────

/** Cómo se dibuja: contorno, relleno y trazo. Colores = tokens (Leaflet resuelve `var(--…)`). */
export interface FormatoComponente {
  color: string;
  /** Token, o `url(#…)` de un patrón de `CroquisPatrones` (el rayado de la ramada). */
  relleno: string;
  opacidad: number;
  peso: number;
  /** `dashArray` del contorno: el «punteado» de la simbología. */
  trazo?: string;
}

/** Ids de los patrones SVG que pinta `CroquisPatrones` (una sola vez por pantalla). */
export const PATRON_RAYADO_TECHO = "ctp-croquis-rayado-techo";
export const PATRON_RAYADO_CEMENTO = "ctp-croquis-rayado-cemento";

export interface CategoriaMeta {
  categoria: CategoriaComponente;
  label: string;
  /** Qué entra (para el ⓘ de la leyenda). */
  hint: string;
  formato: FormatoComponente;
  /** Ahí se ubica madera. `"segun_tipo"`: el techo, si su tipo funcional no es «otro» (la ramada sí, el piso de cemento no). */
  guardaMadera: boolean | "segun_tipo";
}

/* Por qué estos tokens: los semánticos (--data-warning/info…) los pisa el
   preset del negocio dentro de /admin (en `main` el info es teal). La paleta
   amazónica y --data-1..8 no se remapean: el color del mapa es el del plano. */
export const CATEGORIAS: readonly CategoriaMeta[] = [
  { categoria: "madera", label: "Madera", hint: "Trozas, aserrada, leña, carbón, acopio, apilado y cubicación", formato: { color: "var(--amazon-earth)", relleno: "var(--amazon-earth)", opacidad: 0.3, peso: 2 }, guardaMadera: true },
  { categoria: "maquinaria", label: "Maquinaria", hint: "Cintas, coches, rodillos, mesas, despuntadora, motor, cilindro, afilado", formato: { color: "var(--amazon-sunset)", relleno: "var(--amazon-sunset)", opacidad: 0.38, peso: 2 }, guardaMadera: true },
  { categoria: "techo", label: "Techo y ramada", hint: "Ramadas (rayado), techo parabólico (punteado azul), piso de cemento", formato: { color: "var(--amazon-river)", relleno: `url(#${PATRON_RAYADO_TECHO})`, opacidad: 0.9, peso: 2 }, guardaMadera: "segun_tipo" },
  { categoria: "servicio", label: "Servicio", hint: "Almacén de herramientas, energía, tanque, baño, casa, cuarto de trabajadores", formato: { color: "var(--data-2)", relleno: "var(--data-3)", opacidad: 0.32, peso: 1.5 }, guardaMadera: false },
  { categoria: "oficina", label: "Oficina", hint: "Administración y control", formato: { color: "var(--data-8)", relleno: "var(--data-8)", opacidad: 0.22, peso: 2 }, guardaMadera: false },
  { categoria: "seguridad", label: "Seguridad y cámaras", hint: "Cámaras y la oficina que las tiene", formato: { color: "var(--shipibo-red)", relleno: "var(--shipibo-red)", opacidad: 0.3, peso: 2.5 }, guardaMadera: false },
  { categoria: "acceso", label: "Acceso", hint: "Portón, vía exterior, entrada y salida de camiones", formato: { color: "var(--data-1)", relleno: "var(--data-3)", opacidad: 0.15, peso: 2, trazo: "10 5" }, guardaMadera: true },
  { categoria: "limite", label: "Límite", hint: "Cerco de madera (marrón), malla raschel (verde azulado), límite del terreno", formato: { color: "var(--amazon-earth)", relleno: "var(--amazon-earth)", opacidad: 0.05, peso: 3.5 }, guardaMadera: false },
  { categoria: "naturaleza", label: "Naturaleza", hint: "Vivero, río y canal de agua (azul claro)", formato: { color: "var(--amazon-jungle)", relleno: "var(--amazon-jungle)", opacidad: 0.26, peso: 2 }, guardaMadera: false },
  { categoria: "otro", label: "Otro", hint: "Lo que la leyenda no dice qué es", formato: { color: "var(--text-tertiary)", relleno: "var(--text-tertiary)", opacidad: 0.1, peso: 1.5, trazo: "4 4" }, guardaMadera: true },
];

const POR_CATEGORIA = new Map(CATEGORIAS.map((c) => [c.categoria, c]));

export function categoriaMeta(c: CategoriaComponente): CategoriaMeta {
  return POR_CATEGORIA.get(c) ?? CATEGORIAS[CATEGORIAS.length - 1];
}

/** Dentro de una categoría, lo que la simbología dibuja distinto. */
const VARIANTES: { categoria: CategoriaComponente; re: RegExp; formato: Partial<FormatoComponente> }[] = [
  { categoria: "techo", re: /parabolic/, formato: { color: "var(--data-6)", relleno: "var(--data-6)", opacidad: 0.07, peso: 2.5, trazo: "8 6" } },
  { categoria: "techo", re: /cemento|concreto/, formato: { color: "var(--text-tertiary)", relleno: `url(#${PATRON_RAYADO_CEMENTO})`, opacidad: 0.75, peso: 1.5 } },
  { categoria: "limite", re: /malla/, formato: { color: "var(--data-5)", relleno: "var(--data-5)" } },
  { categoria: "limite", re: /limite|lindero/, formato: { color: "var(--text-secondary)", opacidad: 0, peso: 2, trazo: "10 6" } },
  { categoria: "naturaleza", re: /\brio\b|canal|agua|quebrada|cocha|laguna/, formato: { color: "var(--data-6)", relleno: "var(--data-6)", opacidad: 0.3 } },
];

export function formatoComponente(c: Pick<ComponenteZona, "categoria" | "nombre">): FormatoComponente {
  const base = categoriaMeta(c.categoria).formato;
  const n = normalTexto(c.nombre);
  const v = VARIANTES.find((x) => x.categoria === c.categoria && x.re.test(n));
  return v ? { ...base, ...v.formato } : base;
}

/** El formato de una zona: el de su componente o, si no lo tiene (zona vieja), el color de su tipo. */
export function formatoDeZona(z: Pick<PlantaZona, "tipo" | "componente">): FormatoComponente {
  if (z.componente) return formatoComponente(z.componente);
  const ring = zonaTipoMeta(z.tipo).ring;
  return { color: ring, relleno: ring, opacidad: 0.26, peso: 2 };
}

/** Lo que dice el tooltip / la leyenda de una zona. */
export function etiquetaDeZona(z: Pick<PlantaZona, "tipo" | "componente">): string {
  return z.componente ? `${categoriaMeta(z.componente.categoria).label} · ${z.componente.nombre}` : zonaTipoMeta(z.tipo).label;
}

/** ¿Se ubica madera ahí? Zona sin componente: sí (compatibilidad con lo dibujado antes). */
export function guardaMadera(z: Pick<PlantaZona, "tipo" | "componente">): boolean {
  if (!z.componente) return true;
  const g = categoriaMeta(z.componente.categoria).guardaMadera;
  return g === "segun_tipo" ? z.tipo !== "otro" : g;
}

// ─── Clasificador ──────────────────────────────────────────────────────────

/** Orden = prioridad. Cada línea explica a quién le gana a quién. */
const REGLAS_CATEGORIA: [RegExp, CategoriaComponente][] = [
  // «Oficina pequeña (con cámara)» y «Cámara 1 (oficina)» son de seguridad.
  [/camara|cctv|vigilancia|garita/, "seguridad"],
  // Antes que madera: «Cerco de madera (palizada)» es el límite.
  [/cerco|palizada|malla|limite|lindero|alambrad|perimetr/, "limite"],
  // Sin «agua» suelta: el «Tanque de agua elevado» es un servicio.
  [/vivero|\brio\b|canal|quebrada|cocha|laguna|bosque|jardin/, "naturaleza"],
  [/porton|puerta|entrada|ingreso|\bvia\b|camino|trocha|carretera|calle|acceso|balanza|recepcion|despacho|embarque|estacionamiento/, "acceso"],
  [/oficina|administraci/, "oficina"],
  // Madera «fuerte», antes que techo y maquinaria: «Madera aserrada apilada ·
  // bajo la ramada» es madera (medido en main 03-10) y «Acopio de trozas para el coche» también.
  [/troza|rolliza|acopio|apilad|aserrada|madera corta|\blena\b|carbon|cubicacion|secad|horno|reserva|apartad/, "madera"],
  // Antes que maquinaria: «Techo parabólico (zona de aserrío)» es el techo.
  [/ramada|techo|tinglado|cobertizo|galpon|cemento|concreto/, "techo"],
  // Antes que la madera «débil»: «Rodillos (salida de madera)» es una máquina.
  [/cinta|rodillo|mesa|coche|despuntadora|motor|cilindro|afilad|sierra|cantead|reaserr|garlopa|cepillad|maquina/, "maquinaria"],
  [/almacen|herramienta|energia|electric|generador|tanque|\bbano|sshh|servicio|casa|cuarto|vivienda|comedor|cocina|dormitorio|vestuario|deposito|taller|combustible|grifo/, "servicio"],
  [/madera|patio|tabla|paquet/, "madera"],
];

export function categoriaDeNombre(nombre: string): CategoriaComponente {
  const n = normalTexto(nombre);
  return REGLAS_CATEGORIA.find(([re]) => re.test(n))?.[1] ?? "otro";
}

/**
 * El tipo funcional que se sugiere para un componente (editable después).
 * La ramada guarda madera bajo techo (en la v9 la aserrada apilada está bajo
 * la ramada 3 y la paquetería en la ramada 2): patio de producto.
 */
export function tipoDeComponente(categoria: CategoriaComponente, nombre: string): ZonaTipo {
  const n = normalTexto(nombre);
  switch (categoria) {
    case "madera":
      return /troza|rolliza/.test(n) ? "patio_trozas" : /secad|horno/.test(n) ? "secado" : /reserva|apartad/.test(n) ? "reserva" : "patio_producto";
    case "maquinaria":
      return "aserrado";
    case "techo":
      return /parabolic|aserri|sierra/.test(n) ? "aserrado" : /ramada|paqueter|recuperacion|tinglado|cobertizo|galpon/.test(n) ? "patio_producto" : "otro";
    case "oficina":
      return "oficina";
    case "seguridad":
      // La cámara es una cámara aunque mire la oficina; la oficina con cámara es oficina.
      return /^camara/.test(n) ? "otro" : /oficina|administraci/.test(n) ? "oficina" : "otro";
    case "acceso":
      return /despacho|embarque|salida|carguio/.test(n) ? "despacho" : "entrada";
    default:
      return "otro";
  }
}

/** Un renglón de la leyenda → su componente. */
export function componenteDeLeyenda(numero: number | null, nombre: string): ComponenteZona {
  return { numero, nombre: nombre.trim().slice(0, 120), categoria: categoriaDeNombre(nombre) };
}

const CATEGORIA_DE_TIPO: Record<ZonaTipo, CategoriaComponente> = {
  entrada: "acceso", patio_trozas: "madera", aserrado: "maquinaria", secado: "madera", patio_producto: "madera",
  reserva: "madera", despacho: "acceso", oficina: "oficina", otro: "otro",
};

/**
 * Para las zonas que ya estaban cargadas: el componente sale del NOMBRE (el
 * renglón de la leyenda que se tipeó) y el número, del código (PT-08 → 8).
 * Sin nombre, o con uno que no dice nada, manda el tipo que ya tiene.
 */
export function identificarZona(z: Pick<PlantaZona, "codigo" | "nombre" | "tipo">): ComponenteZona {
  const nombre = (z.nombre ?? "").trim();
  const porNombre = nombre ? categoriaDeNombre(nombre) : "otro";
  return {
    numero: numeroDeCodigo(z.codigo),
    nombre: (nombre || z.codigo).slice(0, 120),
    categoria: porNombre !== "otro" ? porNombre : CATEGORIA_DE_TIPO[z.tipo],
  };
}

// ─── Leyenda en pantalla ───────────────────────────────────────────────────

/** Una entrada de la leyenda: una categoría presente, o un tipo de las zonas sin identificar. */
export interface EntradaLeyenda {
  clave: string;
  label: string;
  hint: string;
  /** Los formatos distintos que hay de esa categoría (la ramada y el techo parabólico, ambos techo). */
  formatos: FormatoComponente[];
  n: number;
  categoria: CategoriaComponente | null;
}

/** Con qué entrada de la leyenda se filtra una zona. */
export const claveLeyenda = (z: Pick<PlantaZona, "tipo" | "componente">): string =>
  z.componente ? `cat:${z.componente.categoria}` : `tipo:${z.tipo}`;

/** Las entradas de la leyenda, en el orden del catálogo; las zonas sin identificar, al final por su tipo. */
export function leyendaDeZonas(zonas: Pick<PlantaZona, "tipo" | "componente">[]): EntradaLeyenda[] {
  const porClave = new Map<string, EntradaLeyenda>();
  for (const z of zonas) {
    const clave = claveLeyenda(z);
    const f = formatoDeZona(z);
    let e = porClave.get(clave);
    if (!e) {
      const cat = z.componente?.categoria ?? null;
      const meta = cat ? categoriaMeta(cat) : null;
      e = { clave, label: meta?.label ?? `${zonaTipoMeta(z.tipo).label} (sin identificar)`, hint: meta?.hint ?? zonaTipoMeta(z.tipo).hint, formatos: [], n: 0, categoria: cat };
      porClave.set(clave, e);
    }
    e.n += 1;
    if (!e.formatos.some((x) => x.color === f.color && x.relleno === f.relleno && x.trazo === f.trazo)) e.formatos.push(f);
  }
  const orden = (e: EntradaLeyenda) => (e.categoria ? CATEGORIAS.findIndex((c) => c.categoria === e.categoria) : 100);
  return [...porClave.values()].sort((a, b) => orden(a) - orden(b) || a.label.localeCompare(b.label, "es"));
}

/** «5 de madera, 2 de techo y ramada y 1 de servicio». */
export function resumenCategorias(cs: CategoriaComponente[]): string {
  const cuenta = new Map<CategoriaComponente, number>();
  for (const c of cs) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  const partes = CATEGORIAS.filter((c) => cuenta.has(c.categoria)).map((c) => `${cuenta.get(c.categoria)} de ${c.label.toLowerCase()}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : (partes[0] ?? "");
}

// ─── Cámaras ───────────────────────────────────────────────────────────────

const GENERICAS = new Set(["camara", "de", "del", "la", "el", "los", "las", "con", "en", "y", "zona", "esquina", "pequena", "principal"]);
const tokensDe = (s: string) => normalTexto(s).split(/[^a-z0-9-]+/).filter((t) => t && !GENERICAS.has(t) && (t.length >= 2 || /^\d$/.test(t)));

/**
 * La cámara del módulo Cámaras que corresponde a una zona de seguridad, por
 * palabras en común entre el nombre de la zona y el nombre + lugar de la
 * cámara. Un número solo cuenta si los dos dicen «cámara» («Cámara 1» ↔
 * «Cámara 1 oficina»). Sin coincidencia, o empatadas, null: mejor el enlace
 * al módulo que una cámara equivocada.
 */
export function camaraParecida<T extends { id: string; nombre: string; lugar?: string | null }>(nombreZona: string, camaras: readonly T[]): T | null {
  const zonaDiceCamara = /camara/.test(normalTexto(nombreZona));
  const tz = new Set(tokensDe(nombreZona));
  let mejor: T | null = null;
  let puntos = 0;
  let empate = false;
  for (const c of camaras) {
    const texto = `${c.nombre} ${c.lugar ?? ""}`;
    const conNumero = zonaDiceCamara && /camara/.test(normalTexto(texto));
    const p = new Set(tokensDe(texto).filter((t) => tz.has(t) && (conNumero || !/^\d+$/.test(t)))).size;
    if (p > puntos) { mejor = c; puntos = p; empate = false; } else if (p > 0 && p === puntos) empate = true;
  }
  return puntos > 0 && !empate ? mejor : null;
}
