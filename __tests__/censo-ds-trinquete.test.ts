/**
 * Trinquete del sistema de diseño del panel (contrato de diseño, ADR-489).
 *
 * Cuenta las 10 familias del DS en components/admin/** y app/admin/** con
 * `scripts/censo-ds-admin.mjs` y las compara con la línea base
 * `reports/panel/censo-ds-antes.json`:
 *   - lo hecho a mano (`baja`) sólo puede bajar: un `<button>` a mano, un
 *     checkbox con clases propias, un hex en un gráfico… nuevos hacen fallar esto;
 *   - `Button`, `Kicker`, `DataTable` y `AdminModal` (`sube`) sólo pueden subir.
 *
 * Si falla: usá el canónico del contrato (ADR-489 §2). Para ver dónde pesa una
 * cifra: `node scripts/censo-ds-admin.mjs --familia <familia>`. Cuando algo
 * BAJA, el integrador aprieta la base con `node scripts/censo-ds-admin.mjs --escribir`.
 *
 * Ejecutar: npx vitest run __tests__/censo-ds-trinquete.test.ts
 */
import { describe, it, expect } from "vitest";
import { censar, comparar, leerBase } from "../scripts/censo-ds-admin.mjs";

const FAMILIAS = ["titulos", "botones", "filtros", "tablas", "checks", "modales", "kpis", "graficos", "estructura", "movimiento"];
const SOLO_SUBEN: Array<[string, string]> = [
  ["botones", "Button"],
  ["titulos", "Kicker"],
  ["tablas", "DataTable"],
  ["modales", "AdminModal"],
];

type Censo = ReturnType<typeof censar>;

describe("Trinquete del DS del panel", () => {
  const base = leerBase() as Censo;

  it("la línea base trae las 10 familias y cada cifra dice su sentido", () => {
    expect(Object.keys(base.familias).sort()).toEqual([...FAMILIAS].sort());
    for (const metricas of Object.values(base.familias)) {
      for (const v of Object.values(metricas)) expect(["baja", "sube", "info"]).toContain(v.sentido);
    }
    for (const [familia, metrica] of SOLO_SUBEN) expect(base.familias[familia]?.[metrica]?.sentido).toBe("sube");
  });

  it("nada hecho a mano subió y ningún canónico bajó", () => {
    const ahora = censar({ detalle: true });
    const { empeoro } = comparar(base, ahora);
    const detalle = empeoro
      .map((x) => {
        const top = ahora.familias[x.familia]?.[x.metrica]?.top?.join(", ") ?? "";
        return `${x.familia}.${x.metrica}: ${x.antes} → ${x.ahora} (${x.motivo})${top ? ` — pesa en ${top}` : ""}`;
      })
      .join("\n");
    expect(empeoro, `Empeoró el DS del panel (ADR-489):\n${detalle}`).toEqual([]);
  }, 60_000);
});

describe("comparar() — las reglas del trinquete", () => {
  const censo = (botones: number, kicker: number, extra?: number) => ({
    medido: "",
    archivos: 1,
    familias: {
      botones: { buttonAMano: { n: botones, sentido: "baja" }, ...(extra === undefined ? {} : { alturasBoton: { n: extra, sentido: "info" } }) },
      titulos: { Kicker: { n: kicker, sentido: "sube" } },
    },
  });

  it("lo hecho a mano que sube y el canónico que baja empeoran", () => {
    const { empeoro } = comparar(censo(10, 5), censo(11, 4));
    expect(empeoro.map((x: { metrica: string }) => x.metrica).sort()).toEqual(["Kicker", "buttonAMano"]);
  });

  it("lo hecho a mano que baja y el canónico que sube mejoran; lo informativo no se exige", () => {
    const { empeoro, mejoro } = comparar(censo(10, 5, 3), censo(9, 6, 30));
    expect(empeoro).toEqual([]);
    expect(mejoro.map((x: { metrica: string }) => x.metrica).sort()).toEqual(["Kicker", "buttonAMano"]);
  });

  it("una cifra de la base que ya no se mide cuenta como empeorada", () => {
    const { empeoro } = comparar(censo(10, 5, 3), censo(10, 5));
    expect(empeoro.map((x: { metrica: string }) => x.metrica)).toEqual(["alturasBoton"]);
  });
});
