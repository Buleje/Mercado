/**
 * politicas/politicas-config.ts — tipos y reglas chicas de Políticas y
 * atención (ADR-497). Puro.
 */
import type { CATEGORIAS_POLITICA, DatosSeccion } from "@/lib/planificacion/secciones";
import { normalizarTitulo } from "@/lib/planificacion/plantillas-politicas";

export type Politica = DatosSeccion<"politicas">["items"][number];
export type PasoAtencion = DatosSeccion<"politicas">["protocolo"][number];
export type Pregunta = DatosSeccion<"politicas">["preguntas"][number];
export type CategoriaPolitica = (typeof CATEGORIAS_POLITICA)[number];

export const MAX_POLITICAS = 80;
export const MAX_PASOS = 30;
export const MAX_PREGUNTAS = 60;

/** Las plantillas dejan «[completa]» donde va un dato del negocio. */
export const HUECO = "[completa]";
export const tieneHuecos = (texto: string): boolean => texto.includes(HUECO);

/** Toca revisarla: la fecha de revisión es hoy o ya pasó. */
export const tocaRevisar = (p: Politica, hoy: string): boolean => p.revisar !== "" && p.revisar <= hoy;

export const politicaNueva = (id: string, categoria: CategoriaPolitica = "Atención al cliente"): Politica => ({
  id,
  categoria,
  titulo: "",
  texto: "",
  vigenteDesde: "",
  revisar: "",
});

/**
 * Texto para pegar en WhatsApp: el título en *negrita* (los asteriscos del
 * propio título se quitan para no romperla) y el cuerpo tal cual.
 */
export function textoWhatsApp(titulo: string, cuerpo: string): string {
  const t = titulo.replace(/\*/g, "").trim();
  const c = cuerpo.trim();
  return c ? `*${t}*\n\n${c}` : `*${t}*`;
}

/** Lo que coincide con la búsqueda, sin tildes ni mayúsculas. */
export function coincide(busqueda: string, ...textos: string[]): boolean {
  const q = normalizarTitulo(busqueda);
  return !q || textos.some((t) => normalizarTitulo(t).includes(q));
}

/** Las claves (título normalizado) que ya están, para no agregar dos veces la misma. */
export const yaEstan = (titulos: readonly string[]): Set<string> => new Set(titulos.map(normalizarTitulo).filter(Boolean));
