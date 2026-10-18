/**
 * Filtros del centro de notificaciones: nivel × categoría × búsqueda.
 *
 * Puro (sin React) para poder probarlo. Los conteos sin búsqueda salen de los
 * TOTALES del servidor (`count` y `niveles` de cada grupo), no de los avisos que
 * bajaron: de 83 pedidos viajan 20, y el chip tiene que decir 83. Con búsqueda
 * se cuenta lo que coincide entre los que bajaron — es lo único que se puede
 * buscar sin otro pedido al servidor.
 */
import {
  CATEGORIAS,
  NIVELES,
  compararAvisos,
  type AvisoBandeja,
  type BandejaAvisos,
  type CategoriaAviso,
  type Nivel,
} from "@/lib/superadmin/nivel-aviso";

export type FiltroNivel = Nivel | "todos";
export type FiltroCategoria = CategoriaAviso | "todas";

export interface Filtros {
  nivel: FiltroNivel;
  categoria: FiltroCategoria;
  q: string;
}

export interface Conteos {
  porNivel: Record<FiltroNivel, number>;
  porCategoria: Record<FiltroCategoria, number>;
}

/** Sin tildes ni mayúsculas: «Fruteria» encuentra «Frutería». */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function coincide(a: AvisoBandeja, q: string): boolean {
  return normalizar(`${a.title} ${a.subtitle} ${a.tienda ?? ""} ${a.motivo}`).includes(q);
}

function enAlcance(f: Filtros): readonly CategoriaAviso[] {
  return f.categoria === "todas" ? CATEGORIAS : [f.categoria];
}

function todosLosCargados(data: BandejaAvisos): AvisoBandeja[] {
  return CATEGORIAS.flatMap((c) => data.buckets[c].items);
}

/** Los avisos que se ven con estos filtros, urgente primero. */
export function avisosVisibles(data: BandejaAvisos, f: Filtros): AvisoBandeja[] {
  const q = normalizar(f.q);
  return enAlcance(f)
    .flatMap((c) => data.buckets[c].items)
    .filter((a) => (f.nivel === "todos" || a.nivel === f.nivel) && (!q || coincide(a, q)))
    .sort(compararAvisos);
}

/** Cuántos hay en cada chip de nivel (dentro de la categoría elegida) y en cada categoría (del nivel elegido). */
export function conteos(data: BandejaAvisos, f: Filtros): Conteos {
  const q = normalizar(f.q);
  const alcance = enAlcance(f);
  const porNivel = { todos: 0, urgente: 0, importante: 0, leve: 0, informativo: 0 } as Record<FiltroNivel, number>;
  const porCategoria = { todas: 0 } as Record<FiltroCategoria, number>;

  if (!q) {
    for (const c of alcance) {
      const g = data.buckets[c];
      porNivel.todos += g.count;
      for (const n of NIVELES) porNivel[n] += g.niveles[n];
    }
    for (const c of CATEGORIAS) {
      const g = data.buckets[c];
      porCategoria[c] = f.nivel === "todos" ? g.count : g.niveles[f.nivel];
      porCategoria.todas += porCategoria[c];
    }
    return { porNivel, porCategoria };
  }

  const hallados = todosLosCargados(data).filter((a) => coincide(a, q));
  for (const a of hallados) {
    if (alcance.includes(a.categoria)) {
      porNivel.todos += 1;
      porNivel[a.nivel] += 1;
    }
  }
  for (const c of CATEGORIAS) porCategoria[c] = 0;
  for (const a of hallados) {
    if (f.nivel !== "todos" && a.nivel !== f.nivel) continue;
    porCategoria[a.categoria] += 1;
    porCategoria.todas += 1;
  }
  return { porNivel, porCategoria };
}

export interface GrupoIncompleto {
  categoria: CategoriaAviso;
  /** Cuántos hay con este filtro en el servidor. */
  total: number;
  /** Cuántos de esos se ven en la lista. */
  enLista: number;
}

/**
 * Los grupos de los que la lista muestra sólo una parte con este filtro: el
 * modal los cierra con «Ver los N en su pantalla». Con búsqueda no aplica.
 */
export function gruposIncompletos(data: BandejaAvisos, f: Filtros): GrupoIncompleto[] {
  if (normalizar(f.q)) return [];
  return enAlcance(f)
    .map((c) => {
      const g = data.buckets[c];
      const total = f.nivel === "todos" ? g.count : g.niveles[f.nivel];
      const enLista = g.items.filter((a) => f.nivel === "todos" || a.nivel === f.nivel).length;
      return { categoria: c, total, enLista };
    })
    .filter((x) => x.total > x.enLista);
}
