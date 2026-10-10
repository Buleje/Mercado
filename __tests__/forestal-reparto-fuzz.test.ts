/**
 * Búsqueda adversarial sobre el reparto: escenarios generados al azar con TODAS
 * las variaciones que soporta el módulo —rolliza y aserrada directa, con y sin
 * tope de piezas, filtros de largo y de grupo, `amparaManualM3`, overrides de
 * línea, jornadas, varias especies (incluida la vacía), unidades mixtas— y un
 * puñado de invariantes que no pueden romperse NUNCA.
 *
 * No prueba que el reparto sea óptimo (para eso están los casos concretos de
 * `forestal-reparto-diagnostico`): prueba que sea CORRECTO. La diferencia
 * importa porque lo que sale de acá se declara ante una autoridad.
 *
 * Ya encontró un bug real: la reconstrucción del camino en la DP de relleno
 * podía reusar una medida más veces de las disponibles y un bloque terminaba
 * amparando 5 piezas de una medida que sólo tenía 4 —madera fabricada— en 10 de
 * 2.000 escenarios. Con el generador de acá se reproduce en segundos.
 */
import { describe, it, expect } from "vitest";
import {
  distribuirPorCapacidad, claveOverrideLinea, gruposAdmitidos,
  type BloqueRolliza,
} from "@/lib/forestal/cubicacion-reparto";
import { cubicarPieza, type PiezaCubicada, type Unidad } from "@/lib/forestal/cubicacion";
import { claveYLabel } from "@/lib/forestal/cubicacion-resumen";

const ESPECIES = ["TORNILLO", "CUMALA", "CAPIRONA", ""];
const DIMS = ["tipo", "largo", "medida", "espesor", "ancho", "dueno"] as const;

/** Un escenario completo: lote, bloques y la vista con la que se agrupa. */
function generar(rnd: () => number) {
  const especies = ESPECIES.slice(0, 1 + Math.floor(rnd() * 4));
  const lote: PiezaCubicada[] = [];
  for (let i = 0; i < 1 + Math.floor(rnd() * 10); i++) {
    const uL = (["pies", "m"] as const)[rnd() < 0.85 ? 0 : 1];
    const uE = (["pulg", "cm"] as const)[rnd() < 0.85 ? 0 : 1];
    const base = {
      cantidad: 1 + Math.floor(rnd() * 100),
      espesor: uE === "pulg" ? [1, 1.5, 2, 3, 4][Math.floor(rnd() * 5)] : [3, 5, 8][Math.floor(rnd() * 3)],
      ancho: uE === "pulg" ? [3, 4, 6, 8, 10, 12][Math.floor(rnd() * 6)] : [10, 15, 20, 25][Math.floor(rnd() * 4)],
      largo: uL === "pies" ? [6, 8, 10, 11, 12, 14][Math.floor(rnd() * 6)] : [2, 2.5, 3, 4][Math.floor(rnd() * 4)],
      uEspesor: uE as Unidad, uAncho: uE as Unidad, uLargo: uL as Unidad,
    };
    const { pieTablar, m3 } = cubicarPieza(base);
    lote.push({
      id: `p${i}`, ...base,
      especie: especies[Math.floor(rnd() * especies.length)] || undefined,
      dueno: rnd() < 0.25 ? ["Juan", "Ana"][Math.floor(rnd() * 2)] : undefined,
      pieTablar, m3,
    });
  }
  const totalM3 = lote.reduce((a, p) => a + p.m3, 0);
  const totalPz = lote.reduce((a, p) => a + p.cantidad, 0);
  const dim = DIMS[Math.floor(rnd() * DIMS.length)];
  const claves = [...new Set(lote.map((p) => claveYLabel(p, dim).clave))];
  const bloques: BloqueRolliza[] = [];
  for (let i = 0; i < 1 + Math.floor(rnd() * 5); i++) {
    const frac = rnd() < 0.1 ? 0 : 0.05 + rnd() * 0.7;
    const esAserrada = rnd() < 0.55;
    bloques.push({
      id: `b${i}`, etiqueta: `B${i}`,
      especie: especies[Math.floor(rnd() * especies.length)],
      m3: Math.round(totalM3 * frac * 10000) / 10000,
      tipo: esAserrada ? "aserrada" : "rolliza",
      origen: (["manual", "trozas", "lote"] as const)[Math.floor(rnd() * 3)],
      ...(esAserrada ? {} : { aprovechablePct: 30 + Math.floor(rnd() * 40) }),
      ...(rnd() < 0.45 ? { piezasManual: Math.max(0, Math.round(totalPz * frac * (0.5 + rnd()))) } : {}),
      ...(rnd() < 0.12 ? { largoFiltro: [{ largo: [8, 10, 12][Math.floor(rnd() * 3)], pct: rnd() < 0.5 ? 100 : 20 + Math.floor(rnd() * 60) }] } : {}),
      ...(rnd() < 0.12 && claves.length > 1 ? { gruposFiltro: [`${dim}|${claves[Math.floor(rnd() * claves.length)]}`] } : {}),
      ...(rnd() < 0.12 ? { amparaManualM3: Math.round(totalM3 * frac * 0.6 * 10000) / 10000 } : {}),
      ...(rnd() < 0.15 ? { dias: 1 + Math.floor(rnd() * 5) } : {}),
      ...(rnd() < 0.1 && claves.length > 0
        ? {
            overridesLinea: {
              [claveOverrideLinea(dim, claves[Math.floor(rnd() * claves.length)])]:
                rnd() < 0.5 ? { piezas: Math.floor(rnd() * 30) } : { m3: Math.round(rnd() * 2 * 10000) / 10000 },
            },
          }
        : {}),
    });
  }
  return { lote, bloques, dim, totalM3, totalPz };
}

describe("reparto — invariantes bajo escenarios al azar", () => {
  it("800 escenarios sin romper ninguno", () => {
    let semilla = 987654;
    const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    const fallas: string[] = [];
    let maxMs = 0;

    for (let n = 0; n < 800; n++) {
      const { lote, bloques, dim, totalPz, totalM3 } = generar(rnd);
      const t0 = performance.now();
      const d = distribuirPorCapacidad(bloques, lote, dim);
      maxMs = Math.max(maxMs, performance.now() - t0);

      let pzAsig = 0;
      let pzFalt = 0;
      let m3Asig = 0;
      let m3Falt = 0;
      for (const esp of d.especies) {
        for (const b of esp.bloques) {
          /* Un override declara a mano piezas/m³ que pueden no tener madera real
             detrás: los topes del bloque no aplican a esas líneas. */
          const conOverride = Object.values(b.bloque.overridesLinea ?? {}).some((o) => o?.piezas != null || o?.m3 != null);
          const pz = b.asignado.reduce((a, g) => a + g.piezas, 0);
          pzAsig += b.asignado.reduce((a, g) => a + g.medidas.reduce((x, m) => x + m.piezas, 0), 0);
          m3Asig += b.asignado.reduce((a, g) => a + (g.m3Declarado ? g.medidas.reduce((x, m) => x + m.m3, 0) : g.m3), 0);

          const tope = b.bloque.piezasManual;
          // (1) Nunca más piezas que el tope declarado a mano.
          if (tope != null && !conOverride && pz > Number(tope)) fallas.push(`n=${n} tope: ${b.bloque.etiqueta} ${pz}>${tope}`);
          // (2) Nunca más volumen que la capacidad, salvo la tolerancia de cierre.
          if (!conOverride && b.usadoM3 > b.capacidadM3 + 0.0501) fallas.push(`n=${n} capacidad: ${b.bloque.etiqueta} ${b.usadoM3}>${b.capacidadM3}`);
          for (const g of b.asignado) {
            // (3) Las piezas del grupo son las de sus medidas.
            if (g.medidas.length > 0 && !g.m3Declarado && g.medidas.reduce((a, m) => a + m.piezas, 0) !== g.piezas) {
              fallas.push(`n=${n} grupo≠medidas: ${b.bloque.etiqueta}/${g.label}`);
            }
            // (4) Nada negativo.
            if (g.medidas.some((m) => m.piezas < 0 || m.m3 < 0)) fallas.push(`n=${n} negativo: ${b.bloque.etiqueta}`);
          }
          // (5) Una sola fila por grupo (`claveMarca` la usa como identidad).
          const claves = b.asignado.map((g) => g.clave);
          if (new Set(claves).size !== claves.length) fallas.push(`n=${n} grupo duplicado: ${b.bloque.etiqueta}`);
          // (6) El filtro de grupos es EXCLUYENTE.
          const admitidos = gruposAdmitidos(b.bloque, dim);
          if (admitidos && !conOverride) {
            for (const g of b.asignado) if (g.piezas > 0 && !admitidos.has(g.clave)) fallas.push(`n=${n} filtro: ${b.bloque.etiqueta}/${g.clave}`);
          }
          // (7) Las jornadas reparten exactamente lo del bloque.
          if (b.porDia.length !== b.dias) fallas.push(`n=${n} días: ${b.bloque.etiqueta}`);
          if (b.porDia.reduce((a, x) => a + x.piezas, 0) !== pz) fallas.push(`n=${n} jornadas: ${b.bloque.etiqueta}`);
        }
        for (const f of esp.faltante) { pzFalt += f.piezas; m3Falt += f.m3; }
      }
      // (8) NADA se pierde ni se fabrica: lo repartido + lo que falta = el lote.
      if (pzAsig + pzFalt !== totalPz) fallas.push(`n=${n} conservación piezas: ${pzAsig}+${pzFalt}≠${totalPz}`);
      if (Math.abs(m3Asig + m3Falt - totalM3) > 0.02) fallas.push(`n=${n} conservación m³: ${(m3Asig + m3Falt).toFixed(4)}≠${totalM3.toFixed(4)}`);
      if (d.totales.faltanteM3 < 0) fallas.push(`n=${n} faltante negativo`);

      // (9) Determinismo: la misma entrada da el mismo reparto.
      if (n % 25 === 0) {
        const otra = distribuirPorCapacidad(bloques, lote, dim);
        if (JSON.stringify(otra.totales) !== JSON.stringify(d.totales)) fallas.push(`n=${n} no determinista`);
      }
    }

    expect(fallas.slice(0, 10)).toEqual([]);
    // Y sin colgar la pantalla: el reparto corre en cada render.
    expect(maxMs).toBeLessThan(1500);
  }, 120_000);
});

/**
 * La otra mitad: no basta con ser correcto, tiene que CERRAR.
 *
 * Acá los escenarios son «particionables» por construcción — los bloques se
 * arman repartiendo el lote pieza por pieza, así que existe una solución que
 * deja cero sin distribuir, igual que cuando el operario arma los paquetes a
 * mano. Es el caso que reportó Brandon una y otra vez, y el que el reparto
 * tiene que resolver siempre.
 *
 * Historia de la medición sobre estos mismos 200 escenarios:
 * reparto por volumen 62 % perfectos · con cuota+repesca 91 % · con
 * intercambio 98 % · con el cierre proporcional **100 %**.
 */
describe("reparto — escenarios donde la partición EXISTE", () => {
  /** Arma un lote y lo parte en K paquetes, cada uno con su m³ y sus piezas. */
  function particion(rnd: () => number) {
    const U2 = { uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
    const lote: PiezaCubicada[] = [];
    const medidas = 2 + Math.floor(rnd() * 6);
    for (let i = 0; i < medidas; i++) {
      const base = {
        cantidad: 5 + Math.floor(rnd() * 250),
        espesor: [1, 1.5, 2, 3, 4][Math.floor(rnd() * 5)],
        ancho: [3, 4, 6, 8, 10, 12][Math.floor(rnd() * 6)],
        largo: [6, 8, 10, 12, 14][Math.floor(rnd() * 5)],
        ...U2,
      };
      const { pieTablar, m3 } = cubicarPieza(base);
      lote.push({ id: `p${i}`, ...base, especie: "TORNILLO", pieTablar, m3 });
    }
    const unit = (p: PiezaCubicada) => p.m3 / p.cantidad;
    const K = 2 + Math.floor(rnd() * 4);
    const reparto: number[][] = Array.from({ length: K }, () => lote.map(() => 0));
    for (let i = 0; i < lote.length; i++) {
      let resto = lote[i].cantidad;
      for (let k = 0; k < K - 1; k++) {
        const toma = Math.floor(resto * (0.15 + rnd() * 0.5));
        reparto[k][i] = toma;
        resto -= toma;
      }
      reparto[K - 1][i] = resto;
    }
    const bloques: BloqueRolliza[] = reparto.map((r, k) => ({
      id: `b${k}`, etiqueta: `B${k}`, especie: "TORNILLO",
      m3: Math.round(r.reduce((a, c, i) => a + c * unit(lote[i]), 0) * 10000) / 10000,
      tipo: "aserrada" as const, origen: "manual" as const,
      piezasManual: r.reduce((a, c) => a + c, 0),
    }));
    return { lote, bloques };
  }

  /*
   * Cinco semillas distintas, para que la medición no quede pegada a una sola
   * secuencia. Historia sobre estos mismos escenarios:
   *   reparto por volumen …………………………………… ~62 %
   *   + cuota y repesca ………………………………………… ~91 %
   *   + intercambio entre bloques ………………… 95,5-96,5 %
   *   + una grande por varias chicas ………… 97,0-97,5 %
   *   + cierre con aviso ………………………………………… 97,5-98,5 %
   * Lo que no cierra queda explicado por el diagnóstico, nunca en silencio.
   */
  it("300 particiones (5 semillas) cierran enteras en ≥96 % de los casos", () => {
    const N = 60;
    const porSemilla: { semilla: number; cerraron: number }[] = [];
    let peorPct = 0;
    for (const s0 of [11, 2024, 777, 31337, 99]) {
      let semilla = s0;
      const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
      let cerraron = 0;
      for (let n = 0; n < N; n++) {
        const { lote, bloques } = particion(rnd);
        const d = distribuirPorCapacidad(bloques, lote, "tipo");
        const esp = d.especies[0];
        if (!esp) { cerraron++; continue; }
        if (esp.faltante.reduce((a, f) => a + f.piezas, 0) === 0) cerraron++;
        const total = lote.reduce((a, p) => a + p.m3, 0);
        peorPct = Math.max(peorPct, total > 0 ? d.totales.faltanteM3 / total : 0);
      }
      porSemilla.push({ semilla: s0, cerraron });
    }
    const total = porSemilla.reduce((a, x) => a + x.cerraron, 0);
    // El agregado es la medida buena: por semilla suelta, 60 casos tienen
    // demasiada varianza para poner un umbral fino sin falsos rojos.
    expect(total / (porSemilla.length * N)).toBeGreaterThanOrEqual(0.96);
    // Y ninguna semilla se desploma (eso sí sería una regresión de verdad).
    for (const x of porSemilla) expect(x.cerraron / N).toBeGreaterThanOrEqual(0.9);
    // Cuando no cierra, lo que queda afuera es marginal, nunca un lote entero.
    expect(peorPct).toBeLessThan(0.02);
  }, 120_000);
});
