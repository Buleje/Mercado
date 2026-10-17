import "server-only";

/**
 * lib/asistente/contexto.ts
 *
 * Quién es quién en este negocio, en pocas líneas.
 *
 * ── Por qué no alcanza con las herramientas de búsqueda ──────────────────────
 * Buscar sirve para resolver un nombre. No sirve para SABER que existe. Sin esta
 * lista, «anotá el combustible del cargador» dispara una búsqueda a ciegas: si
 * el negocio tiene una excavadora y ningún cargador, el modelo se entera después
 * de gastar una vuelta, y contesta algo raro.
 *
 * Con los nombres a la vista, el asistente entiende de qué le hablan a la
 * primera, no inventa una máquina que no existe, y puede decir «no tenés ningún
 * cargador, ¿te referís a la excavadora?» — que es lo que haría alguien que
 * conoce el negocio.
 *
 * ── El presupuesto manda ─────────────────────────────────────────────────────
 * La cuenta tiene 8.000 tokens POR MINUTO. Esta lista viaja en CADA mensaje, así
 * que se corta: sólo nombres e identificadores, y sólo mientras sean pocos. Con
 * un padrón grande no se listan nombres — se dice cuántos hay y que hay que
 * buscarlos, que es la verdad y cuesta veinte tokens.
 */

import { AssetsDB } from "@/lib/db/assets.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { logger } from "@/lib/logger";

/** Cuántos se nombran antes de pasar a «son N, buscalos». */
const TOPE_LISTA = 12;

interface Contexto {
  texto: string;
  expira: number;
}

/**
 * Cinco minutos.
 *
 * Un camión nuevo o una persona nueva aparecen en el contexto en el próximo
 * mensaje, no en el siguiente turno de la misma frase — y eso está bien: lo que
 * se acaba de dar de alta se busca por nombre igual.
 */
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, Contexto>();

/**
 * La lista con los ids adentro.
 *
 * ── Por qué el id y no sólo el nombre ────────────────────────────────────────
 * Con sólo nombres, «anotame el combustible del N12» obliga a una vuelta de
 * búsqueda antes de poder escribir: otra llamada al modelo, otros ~3.500 tokens
 * de esquema, y con 8.000 por minuto de cuota eso es la mitad del minuto para
 * averiguar algo que ya sabíamos.
 *
 * Con el id a la vista, la operación se anota en UNA vuelta. Y es más seguro,
 * no menos: copiar un id que está en el mensaje es lo contrario de inventarlo,
 * y el ensayo lo valida igual antes de mostrar la tarjeta.
 *
 * Cuando son muchos no se listan: el costo se iría de las manos y ahí sí
 * conviene buscar.
 */
function lista(
  items: Array<{ id: string; etiqueta: string }>,
  singular: string,
  plural: string,
): string | null {
  if (items.length === 0) return null;
  if (items.length > TOPE_LISTA) {
    return `${plural}: hay ${items.length}. No los tengo listados acá; buscalos por nombre con la herramienta.`;
  }
  const filas = items.map((i) => `  - ${i.etiqueta} → id ${i.id}`).join("\n");
  return `${items.length === 1 ? singular : plural}:\n${filas}`;
}

/**
 * El "quién es quién" del negocio, listo para pegar en el system prompt.
 *
 * Cada consulta se aísla: un módulo que este negocio no usa —o una tabla que su
 * plan no habilita— no puede dejar al asistente sin el resto del contexto.
 */
export async function contextoDelNegocio(tenantId: string): Promise<string> {
  const enCache = cache.get(tenantId);
  if (enCache && enCache.expira > Date.now()) return enCache.texto;

  const [maquinas, personas, cuentas] = await Promise.allSettled([
    AssetsDB.listWithStats(tenantId),
    AdelantosDB.listBeneficiarios(tenantId),
    TreasuryDB.listCuentas(tenantId),
  ]);

  const partes: string[] = [];

  if (maquinas.status === "fulfilled") {
    // La placa va pegada al nombre porque es como se dicta: «el N12», «el de la
    // placa A4B». Separarlas obligaría a cruzar dos listas mentalmente.
    const items = maquinas.value
      .filter((m) => m.active)
      .map((m) => ({ id: m.id, etiqueta: m.plate ? `${m.name} (placa ${m.plate})` : m.name }));
    const l = lista(items, "Máquina (maquinaId)", "Máquinas y vehículos (maquinaId)");
    if (l) partes.push(l);
  } else {
    logger.warn("[contexto] no se pudieron leer las máquinas", { tenantId });
  }

  if (personas.status === "fulfilled") {
    const l = lista(
      personas.value.map((p) => ({ id: p.id, etiqueta: p.nombre })),
      "Persona del padrón de adelantos (personaId)",
      "Personas del padrón de adelantos (personaId)",
    );
    if (l) partes.push(l);
  }

  if (cuentas.status === "fulfilled") {
    const l = lista(
      cuentas.value.map((c) => ({ id: c.id, etiqueta: `${c.nombre} (${c.moneda})` })),
      "Cuenta de tesorería (cuentaId)",
      "Cuentas de tesorería (cuentaId)",
    );
    if (l) partes.push(l);
  }

  const texto = partes.length > 0 ? partes.join("\n") : "Todavía no hay máquinas, personas ni cuentas cargadas.";
  cache.set(tenantId, { texto, expira: Date.now() + CACHE_MS });
  return texto;
}

/** Para cuando algo se da de alta y conviene que el asistente lo vea ya. */
export function olvidarContexto(tenantId: string): void {
  cache.delete(tenantId);
}
