/**
 * Cargar lo autorizado por la resolución, TODAS las especies de una vez.
 *
 * Medido en Blas (30-09): el plan grande tiene 65 árboles de censo en 8
 * especies (Copaiba, Lupuna, Catahua, Mashonaste, Sapotillo, Aguanomasha,
 * Congona, Quinilla) y **cero** especies autorizadas cargadas. Sin ese dato el
 * cupo de cada especie cae a lo censado (`loth-cupo-especie`), que no es lo que
 * autoriza la resolución. El editor que había (`LothPlanEspecies`) carga de a
 * una por un modal: ocho especies eran ocho vueltas de abrir, tipear el nombre
 * a mano (con el riesgo de escribirlo distinto que el censo) y guardar.
 *
 * Esto arma una tabla con las especies del censo ya escritas, y decide qué se
 * crea y qué se corrige al guardar, por la clave canónica de la especie
 * (`claveEspecie`): «Tornillo (Cedrelinga cateniformis)» del plan y «Tornillo»
 * del censo son la misma fila, no dos.
 *
 * Puro y client-safe: la tabla lo usa para armar el pedido, la DB class para
 * decidir el upsert (el cliente no decide), y los tests lo prueban solo.
 */

import { claveEspecie } from "./loth-constants";

/** Tope de especies por pedido: un POA real trae decenas, no cientos. */
export const MAX_ESPECIES_LOTE = 200;

/** El volumen se guarda como Decimal(12,4): más decimales serían ruido. */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

// ─── Filas de la tabla ──────────────────────────────────────────────────────

export interface ArbolCensoAutorizar {
  speciesCommon: string;
  volumenEstimadoM3: number | string | null;
}

export interface EspecieYaAutorizada {
  id: string;
  speciesCommon: string;
  volumenAutorizadoM3: number | string | null;
  arbolesAutorizados: number | null;
}

export interface FilaAutorizar {
  clave: string;
  /** El nombre que se guarda: el del plan si ya estaba, si no el del censo. */
  especie: string;
  arbolesCensados: number;
  censadoM3: number;
  /** La fila del plan que se corrige; `null` = se crea al guardar. */
  id: string | null;
  /** Lo que había guardado, para no reenviar lo que no cambió. */
  volumenGuardado: number | null;
  arbolesGuardados: number | null;
  /** Lo que está en la casilla (texto: el usuario puede estar tipeando). */
  volumen: string;
  arboles: string;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Una fila por especie: las del censo del plan ∪ las ya autorizadas (∪ la que
 * se pidió, si no está en ninguna de las dos: una especie talada fuera del
 * censo también necesita su autorización). Orden alfabético: es como se busca
 * en la resolución.
 */
export function filasParaAutorizar(
  censo: readonly ArbolCensoAutorizar[],
  autorizadas: readonly EspecieYaAutorizada[],
  pedida?: string | null,
): FilaAutorizar[] {
  const porClave = new Map<string, FilaAutorizar>();
  const fila = (nombre: string): FilaAutorizar | null => {
    const clave = claveEspecie(nombre);
    if (!clave) return null;
    let f = porClave.get(clave);
    if (!f) {
      f = {
        clave,
        especie: nombre.trim(),
        arbolesCensados: 0,
        censadoM3: 0,
        id: null,
        volumenGuardado: null,
        arbolesGuardados: null,
        volumen: "",
        arboles: "",
      };
      porClave.set(clave, f);
    }
    return f;
  };

  for (const s of autorizadas) {
    const f = fila(s.speciesCommon);
    /* Dos filas del plan con la misma clave: se muestra la primera y el
       servidor rechaza tocarla (`duplicadasEnPlan`) hasta que se limpie. */
    if (!f || f.id) continue;
    const vol = num(s.volumenAutorizadoM3);
    f.id = s.id;
    f.especie = s.speciesCommon.trim();
    f.volumenGuardado = vol;
    f.arbolesGuardados = s.arbolesAutorizados;
    f.volumen = vol != null ? String(r4(vol)) : "";
    f.arboles = s.arbolesAutorizados != null ? String(s.arbolesAutorizados) : "";
  }
  for (const t of censo) {
    const f = fila(t.speciesCommon);
    if (!f) continue;
    f.arbolesCensados += 1;
    f.censadoM3 += num(t.volumenEstimadoM3) ?? 0;
  }
  if (pedida?.trim()) fila(pedida);

  return [...porClave.values()]
    .map((f) => ({ ...f, censadoM3: r4(f.censadoM3) }))
    .sort((a, b) => a.especie.localeCompare(b.especie, "es"));
}

/** La fila de la especie pedida (por clave canónica), si está. */
export const filaDeEspecie = (filas: readonly FilaAutorizar[], especie: string | null | undefined): FilaAutorizar | undefined => {
  const k = claveEspecie(especie);
  return k ? filas.find((f) => f.clave === k) : undefined;
};

// ─── Lo tipeado → el pedido ─────────────────────────────────────────────────

export interface ItemAutorizar {
  speciesCommon: string;
  volumenAutorizadoM3: number;
  arbolesAutorizados: number | null;
}

export interface ErrorFila {
  clave: string;
  especie: string;
  motivo: string;
}

/** Acepta coma decimal: en Perú «45,5» es cuarenta y cinco y medio. */
const leerNumero = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

/**
 * Qué se manda al guardar.
 *
 * - Fila vacía (sin m³ ni árboles): no se toca. Vaciar la casilla de una
 *   especie ya cargada NO la borra: borrar es el tacho del editor de a una,
 *   con su confirmación, porque saca volumen del balance.
 * - Árboles sin m³: error (el cupo se mide en m³).
 * - m³ ≤ 0 o no numérico, árboles no entero o negativo: error.
 * - Especie ya cargada con los mismos números: no se reenvía.
 */
export function leerFilas(filas: readonly FilaAutorizar[]): { items: ItemAutorizar[]; errores: ErrorFila[] } {
  const items: ItemAutorizar[] = [];
  const errores: ErrorFila[] = [];
  for (const f of filas) {
    const vol = leerNumero(f.volumen);
    const arb = leerNumero(f.arboles);
    if (vol == null && arb == null) continue;
    const err = (motivo: string) => errores.push({ clave: f.clave, especie: f.especie, motivo });
    if (vol == null) { err("falta el volumen autorizado (m³)"); continue; }
    if (Number.isNaN(vol) || vol <= 0) { err("el volumen tiene que ser un número mayor que 0"); continue; }
    if (arb != null && (Number.isNaN(arb) || !Number.isInteger(arb) || arb < 0)) { err("el N° de árboles tiene que ser un entero"); continue; }
    const volumen = r4(vol);
    if (f.id && f.volumenGuardado != null && r4(f.volumenGuardado) === volumen && (f.arbolesGuardados ?? null) === (arb ?? null)) continue;
    items.push({ speciesCommon: f.especie, volumenAutorizadoM3: volumen, arbolesAutorizados: arb });
  }
  return { items, errores };
}

// ─── El upsert (lo decide el servidor) ──────────────────────────────────────

export interface EspecieExistente {
  id: string;
  speciesCommon: string;
}

export interface PlanUpsert {
  crear: ItemAutorizar[];
  actualizar: (ItemAutorizar & { id: string })[];
  /** Dos ítems del pedido con la misma clave: no se adivina cuál vale. */
  repetidas: string[];
  /** La especie ya está DOS veces en el plan: corregir una deja el cupo mal sumado. */
  duplicadasEnPlan: string[];
}

export function planDeUpsert(existentes: readonly EspecieExistente[], items: readonly ItemAutorizar[]): PlanUpsert {
  const delPlan = new Map<string, string[]>();
  for (const e of existentes) {
    const k = claveEspecie(e.speciesCommon);
    if (!k) continue;
    delPlan.set(k, [...(delPlan.get(k) ?? []), e.id]);
  }
  const vistas = new Set<string>();
  const out: PlanUpsert = { crear: [], actualizar: [], repetidas: [], duplicadasEnPlan: [] };
  for (const it of items) {
    const k = claveEspecie(it.speciesCommon);
    if (!k) continue;
    if (vistas.has(k)) { out.repetidas.push(it.speciesCommon.trim()); continue; }
    vistas.add(k);
    const ids = delPlan.get(k) ?? [];
    if (ids.length > 1) out.duplicadasEnPlan.push(it.speciesCommon.trim());
    else if (ids.length === 1) out.actualizar.push({ ...it, id: ids[0] });
    else out.crear.push({ ...it, speciesCommon: it.speciesCommon.trim() });
  }
  return out;
}
