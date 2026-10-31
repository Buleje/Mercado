/**
 * lote-por-escaneo.ts — armar lotes de aserrío pasando la pistola por la pila.
 *
 * Brandon (2026-09-26): «escanear para escoger las trozas para consumo y hacer
 * lote de varias especies, y esos lotes se distribuyan en lotes separados por
 * especies para poder producir». En el patio la pila está mezclada: se escanea
 * de corrido y la pantalla la reparte al guardar.
 *
 * El reparto sale de las reglas del servidor (`ForestLoteAserrioDB.agregarTrozas`):
 *   · L-A1 — un lote, una especie;
 *   · ADR-393 — un lote, un título habilitante (si lote y pieza traen permiso y
 *     difieren, rechaza; una pieza sin permiso entra a cualquiera).
 * Por eso el GRUPO es especie + permiso, y una pieza sin permiso forma su propio
 * grupo «sin permiso» de esa especie: meterla con las de un permiso sería
 * decidir por el operador de qué papel es.
 *
 * Lo que sigue impidiendo que una pieza entre a la pila es lo que ningún lote
 * acepta: T1 (`motivoBloqueo`), guía sin recibir (ADR-339), ya apartada en otro
 * lote, sin especie. El servidor vuelve a mirar todo al guardar: esto es aviso,
 * no garantía.
 *
 * PURO y client-safe.
 */

import { claveEspecie } from "./loth-constants";
import { LABEL_BLOQUEO, motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";

const texto = (v: string | null | undefined) => v?.trim() || null;

/**
 * Por qué ESTA pieza no puede entrar a la pila. `null` = entra.
 * El texto se lee en voz alta frente al tronco: dice qué es y qué hacer.
 *
 * `loteMixtoId` = la pila que se está escaneando es ESE lote mixto (ADR-441):
 * una pieza que ya está en él entra (re-escanearla no es un error); una que
 * está en OTRO mixto, no — LM1, un solo mixto. Sin `loteMixtoId` (el armado de
 * lotes por escaneo de siempre) cualquier mixto la deja afuera: LM4, primero
 * se reparte.
 */
export function motivoFueraDeLaPila(
  t: TrozaConsumible,
  opts: { loteMixtoId?: string | null } = {},
): string | null {
  const m = motivoBloqueo(t);
  if (m) return LABEL_BLOQUEO[m];
  if (t.guiaRecepcionada === false) {
    return `${t.gtfNumber ? `Su guía ${t.gtfNumber}` : "Su guía"} no se recibió: recíbela en Ingresos`;
  }
  if (t.loteAserrioId) return `Ya está en el lote ${t.loteAserrioCode ?? "de otra pila"}`;
  if (t.loteMixtoId && t.loteMixtoId !== opts.loteMixtoId) {
    return opts.loteMixtoId
      ? `Ya está en el lote mixto ${t.loteMixtoCode ?? "de otra pila"}`
      : `Está en el lote mixto ${t.loteMixtoCode ?? "abierto"}: repártelo primero`;
  }
  if (!texto(t.especieComun))
    return "No tiene especie: corrígela en su guía antes de armar el lote";
  return null;
}

/** Especie + permiso: las dos cosas que el servidor exige iguales dentro de un lote. */
export function claveDeGrupo(t: Pick<TrozaConsumible, "especieComun" | "permiso">): string {
  return `${claveEspecie(t.especieComun)}|${texto(t.permiso) ?? ""}`;
}

/** Una parte de la pila que se guarda como UN lote. */
export interface GrupoDeLaPila<T extends TrozaConsumible = TrozaConsumible> {
  clave: string;
  /** Como la escribió la guía de la primera pieza del grupo. */
  especie: string;
  especieCientifica: string | null;
  /** `null` = piezas de guías sin permiso: su propio grupo. */
  permiso: string | null;
  /** En el orden en que se escanearon. */
  trozas: T[];
  piezas: number;
  m3: number;
  /** Las guías de donde sale, sin repetir: lo que el acta cita. */
  guias: string[];
}

const redondeoM3 = (v: number) => Math.round(v * 1000) / 1000;
const guiasDe = (ts: readonly TrozaConsumible[]) => [
  ...new Set(ts.map((t) => texto(t.gtfNumber)).filter((g): g is string => g != null)),
];

/**
 * La pila repartida en los lotes que se van a guardar, en el orden en que
 * apareció cada grupo al escanear: la tarjeta de una especie no salta de lugar
 * cada vez que entra otra pieza. Recibe la pila en orden de escaneo (la
 * primera escaneada primero). Una pieza sin especie no tiene grupo — tampoco
 * entra a la pila (`motivoFueraDeLaPila`).
 */
export function gruposDeLaPila<T extends TrozaConsumible>(pila: readonly T[]): GrupoDeLaPila<T>[] {
  const porClave = new Map<string, GrupoDeLaPila<T>>();
  for (const t of pila) {
    const especie = texto(t.especieComun);
    if (!especie) continue;
    const clave = claveDeGrupo(t);
    let g = porClave.get(clave);
    if (!g) {
      g = {
        clave,
        especie,
        especieCientifica: null,
        permiso: texto(t.permiso),
        trozas: [],
        piezas: 0,
        m3: 0,
        guias: [],
      };
      porClave.set(clave, g);
    }
    g.trozas.push(t);
    g.especieCientifica ??= texto(t.especieCientifica);
  }
  return [...porClave.values()].map((g) => ({
    ...g,
    piezas: g.trozas.length,
    m3: redondeoM3(g.trozas.reduce((a, t) => a + (Number(t.volumenM3) || 0), 0)),
    guias: guiasDe(g.trozas),
  }));
}

export interface ResumenDeLaPila {
  piezas: number;
  m3: number;
  /** Especies distintas (tildes y mayúsculas no cuentan): no es lo mismo que lotes. */
  especies: number;
  guias: string[];
}

export function resumenDeLaPila(pila: readonly TrozaConsumible[]): ResumenDeLaPila {
  const m3 = pila.reduce((a, t) => a + (Number(t.volumenM3) || 0), 0);
  const especies = new Set(pila.map((t) => claveEspecie(t.especieComun)).filter(Boolean)).size;
  return { piezas: pila.length, m3: redondeoM3(m3), especies, guias: guiasDe(pila) };
}

type BaseDeLote = Pick<GrupoDeLaPila, "especie" | "especieCientifica" | "permiso">;

/** Con qué se abre el lote de un grupo (`crearConTrozas`): su especie y su permiso. */
export function pedidoDeLote(grupo: BaseDeLote, notas?: string) {
  return {
    speciesCommon: grupo.especie,
    speciesScientific: grupo.especieCientifica,
    permiso: grupo.permiso,
    notes: texto(notas) ?? null,
  };
}

/**
 * Los lotes abiertos a los que un grupo se puede SUMAR: su especie y, si los
 * dos lo fijan, su permiso. Un grupo sin permiso entra a cualquier lote de su
 * especie, como lo acepta el servidor.
 *
 * Un lote SIN permiso (así nacieron los de antes de ADR-393) el servidor lo
 * acepta de cualquiera, pero ofrecerlo a dos grupos de permisos distintos lo
 * deja mezclado (revisión 26-09). Se ofrece sólo si la madera que YA tiene es
 * del permiso del grupo, o si está vacío.
 */
export function lotesQueAceptan<
  L extends { speciesCommon: string; permiso?: string | null; status?: string; trozas?: readonly { permiso?: string | null }[] },
>(lotes: readonly L[], grupo: BaseDeLote | null): L[] {
  if (!grupo) return [];
  return lotes.filter((l) => {
    if (!(l.status == null || l.status === "abierto")) return false;
    if (claveEspecie(l.speciesCommon) !== claveEspecie(grupo.especie)) return false;
    const permisoLote = texto(l.permiso);
    if (permisoLote) return !grupo.permiso || permisoLote === grupo.permiso;
    const suyos = [...new Set((l.trozas ?? []).map((t) => texto(t.permiso)).filter((p): p is string => p != null))];
    return suyos.length === 0 || (suyos.length === 1 && (!grupo.permiso || suyos[0] === grupo.permiso));
  });
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que va a pasar al guardar: «se crean 3 lotes», «2 lotes nuevos y 1 suma a un lote abierto». */
export function textoDelReparto(nuevos: number, sumas: number): string {
  if (sumas === 0) return nuevos === 1 ? "se crea 1 lote" : `se crean ${nuevos} lotes`;
  if (nuevos === 0)
    return sumas === 1 ? "se suma a 1 lote abierto" : `se suma a ${sumas} lotes abiertos`;
  return `${plural(nuevos, "lote nuevo", "lotes nuevos")} y ${plural(sumas, "suma a un lote abierto", "sumas a lotes abiertos")}`;
}

/**
 * El botón dice cuántos lotes y cuántas trozas: con la pila mezclada, «Crear
 * el lote» a secas escondía que salen varios. `loteUnico` = el código del lote
 * abierto cuando hay UN grupo y va sumado.
 */
export function textoDelBoton(p: {
  grupos: number;
  piezas: number;
  sumas: number;
  loteUnico: string | null;
}): string {
  const trozas = plural(p.piezas, "troza", "trozas");
  if (p.grupos === 1)
    return p.loteUnico ? `Sumar ${p.piezas} al ${p.loteUnico}` : `Crear el lote con ${trozas}`;
  return `${p.sumas === 0 ? "Crear" : "Guardar en"} ${p.grupos} lotes (${trozas})`;
}
