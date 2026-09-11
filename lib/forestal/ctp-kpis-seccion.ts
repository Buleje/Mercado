/**
 * ctp-kpis-seccion.ts — las cuentas que encabezan Producción y Despacho.
 *
 * Vivían dentro de un `useMemo` de `use-ctp-secciones`, que es donde se usan.
 * Salieron acá por una razón concreta: hay que poder correr **la misma fórmula
 * sobre dos ventanas de tiempo** para poder decir «12 % más que el mes pasado».
 *
 * Que sea la misma función y no una cuenta paralela en el servidor no es un
 * detalle de estilo: si el KPI y su delta salieran de dos fórmulas distintas,
 * el día que una cambie se contradicen en pantalla y no hay manera de saber
 * cuál de las dos está mintiendo.
 *
 * Reglas que sobreviven del original y que NO se tocan al mover el código:
 *  - el rendimiento es PONDERADO por volumen consumido, no promedio simple;
 *  - la merma sólo sobre corridas cerradas, en m³ y con materia prima — restar
 *    `pt` a `m³` sería sumar peras con manzanas, y una corrida abierta daría
 *    merma del 100 % por madera que sigue en la sierra;
 *  - lo anulado no cuenta: en el libro no existe.
 */

import type { CtpEntry, CtpSection } from "@/components/admin/forestal/ctp-section-shared";

/** Lo que la vista muestra del período. */
export interface KpisSeccion {
  count: number;
  totalQty: number;
  consumido: number;
  avgRend: number;
  abiertas: number;
  consumidoAbierto: number;
  merma: number;
  mermaSobre: number;
  mermaPct: number;
  sinMateriaPrima: number;
  enPatio: number;
  sinOrigen: number;
  guias: number;
  destinos: number;
  piezas: number;
}

export function calcularKpisSeccion(entriesDeKpis: CtpEntry[], section: CtpSection): KpisSeccion {

    const reg = entriesDeKpis.filter((e) => e.status === "registrado");
    const totalQty = reg.reduce((a, e) => a + Number(e.quantity ?? 0), 0);
    const consumido = reg.reduce((a, e) => a + Number(e.volumeInputM3 ?? 0), 0);
    // Rendimiento PONDERADO por volumen consumido: la media simple hacía pesar
    // igual una línea de 0.5 m³ que una de 50 m³, y el promedio de planta no es eso.
    let pesoTotal = 0;
    let sumaPonderada = 0;
    for (const e of reg) {
      const rend = Number(e.rendimientoPct ?? 0);
      const vol = Number(e.volumeInputM3 ?? 0);
      if (rend > 0 && vol > 0) {
        sumaPonderada += rend * vol;
        pesoTotal += vol;
      }
    }
    const avgRend = pesoTotal > 0 ? sumaPonderada / pesoTotal : 0;

    /**
     * Las corridas ABIERTAS (ADR-340): consumieron y no dijeron qué salió.
     * Es deuda del libro y también la explicación de por qué el rendimiento del
     * período puede verse bajo: esos m³ ya cuentan como entrada.
     */
    const abiertas = reg.filter((e) => e.quantity == null);
    const consumidoAbierto = abiertas.reduce((a, e) => a + Number(e.volumeInputM3 ?? 0), 0);

    /**
     * La MERMA sólo sobre corridas COMPARABLES: declaradas, en m³ y **con
     * materia prima registrada**.
     *
     * Los tres filtros se ganaron con datos reales:
     *  - `pt`/`kg` restados a m³ sería restar peras a manzanas;
     *  - una corrida abierta daría merma del 100 % por madera que sigue en la
     *    sierra;
     *  - y una corrida que declara producción **sin entrada** (las viejas
     *    importadas) empuja la resta a negativo. Con `Math.max(0, …)` eso salía
     *    como «merma 0.00 · 0.0 %», que es exactamente el número que un
     *    fiscalizador querría creer y que acá era mentira: no hay merma cero,
     *    hay corridas que no dicen de qué madera salieron.
     */
    const cerradasM3 = reg.filter(
      (e) => e.quantity != null && (e.unit ?? "m3") === "m3" && Number(e.volumeInputM3 ?? 0) > 0,
    );
    const entradaCerrada = cerradasM3.reduce((a, e) => a + Number(e.volumeInputM3 ?? 0), 0);
    const salidaCerrada = cerradasM3.reduce((a, e) => a + Number(e.quantity ?? 0), 0);
    const merma = Math.max(0, entradaCerrada - salidaCerrada);
    /** Declararon producto y no declararon de qué madera salió: rompe el certificado. */
    const sinMateriaPrima = reg.filter(
      (e) => e.quantity != null && !(Number(e.volumeInputM3 ?? 0) > 0),
    ).length;

    /**
     * Lo producido que TODAVÍA está en planta: producido − despachado −
     * reprocesado. Es el stock real de la sección, no la suma histórica.
     */
    const enPatio = reg.reduce(
      (a, e) =>
        a +
        Math.max(0, Number(e.quantity ?? 0) - Number(e.despachadoQty ?? 0) - Number(e.reprocesadoQty ?? 0)),
      0,
    );

    /**
     * Materia prima SIN GUÍA de origen (producción) o producto sin corrida que
     * lo ampare (despacho): el agujero de la cadena de custodia. Es lo primero
     * que rompe un certificado, así que va como número, no escondido en la fila.
     */
    const sinOrigen =
      section === "produccion"
        ? reg.reduce((a, e) => a + Math.max(0, Number(e.volumeInputM3 ?? 0) - Number(e.mpAtribuidaM3 ?? 0)), 0)
        : reg.reduce((a, e) => a + Math.max(0, Number(e.quantity ?? 0) - Number(e.atribuidoQty ?? 0)), 0);

    /** Despacho: cuántas guías y cuántos destinos distintos movió el período. */
    const guias = new Set(reg.map((e) => e.gtfNumber).filter(Boolean)).size;
    const destinos = new Set(reg.map((e) => (e.destino ?? "").trim()).filter(Boolean)).size;
    const piezas = reg.reduce((a, e) => a + Number(e.pieces ?? 0), 0);

    return {
      count: reg.length,
      totalQty,
      consumido,
      avgRend,
      abiertas: abiertas.length,
      consumidoAbierto,
      merma,
      mermaSobre: cerradasM3.length,
      mermaPct: entradaCerrada > 0 ? (merma / entradaCerrada) * 100 : 0,
      sinMateriaPrima,
      enPatio,
      sinOrigen,
      guias,
      destinos,
      piezas,
    };
}
