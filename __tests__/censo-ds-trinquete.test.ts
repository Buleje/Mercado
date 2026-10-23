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
import { censar, censarTextos, comparar, leerBase } from "../scripts/censo-ds-admin.mjs";

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

describe("censo por cuerpo — componer el canónico no cuenta; lo hecho a mano, sí (ADR-489, adenda 23-10)", () => {
  const n = (familia: string, metrica: string, archivos: Record<string, string>) =>
    (censarTextos(Object.entries(archivos)).familias as Record<string, Record<string, { n: number }>>)[familia][metrica].n;

  it("una tabla local que compone DataTable no cuenta; con <table> propio, sí", () => {
    const conDs = `import { DataTable } from "@buleje/design-system";\nexport function GuiasTabla() {\n  return <DataTable columns={[]} rows={[]} />;\n}\n`;
    const aMano = `export function GuiasTabla() {\n  return <table className="w-full"><tbody /></table>;\n}\n`;
    expect(n("tablas", "tablasLocales", { "components/admin/a/GuiasTabla.tsx": conDs })).toBe(0);
    expect(n("tablas", "tablasLocales", { "components/admin/a/GuiasTabla.tsx": aMano })).toBe(1);
  });

  it("checks: Casilla (también con alias) no cuenta; el checkbox nativo sí", () => {
    const conDs = `import { Casilla } from "@/components/ui-system/casilla";\nexport function SoloEsteCheckbox() {\n  return <Casilla checked />;\n}\n`;
    const conAlias = `import { Casilla as CasillaDS } from "@/components/ui-system/casilla";\nexport function SoloEsteCheckbox() {\n  return <CasillaDS checked />;\n}\n`;
    const aMano = `import { Casilla } from "@/components/ui-system/casilla";\nexport function SoloEsteCheckbox() {\n  return <label><Casilla /><input type="checkbox" /></label>;\n}\n`;
    expect(n("checks", "checksLocales", { "components/admin/a/x.tsx": conDs })).toBe(0);
    expect(n("checks", "checksLocales", { "components/admin/a/x.tsx": conAlias })).toBe(0);
    expect(n("checks", "checksLocales", { "components/admin/a/x.tsx": aMano })).toBe(1);
  });

  it("paleta: un mapa con hex cuenta; uno de tokens o de nombres, no", () => {
    expect(n("graficos", "paletasLocales", { "components/admin/a/x.ts": `export const COLORES = { ok: "#16a34a", mal: "#dc2626" };\n` })).toBe(1);
    expect(n("graficos", "paletasLocales", { "components/admin/a/x.ts": `export const COLORES = { ok: "var(--success)", mal: "text-[var(--danger)]" };\n` })).toBe(0);
    expect(n("graficos", "paletasLocales", { "components/admin/a/x.ts": `export const COLORES = { ok: "Verde", mal: "Rojo" };\n` })).toBe(0);
  });

  it("transitivo: el que envuelve (por import por defecto) a un local que compone StatCard tampoco cuenta", () => {
    const kpi = `import { StatCard } from "@/components/ui-system/stat-card";\nexport default function CtpKpi() {\n  return <StatCard label="x" value={1} />;\n}\n`;
    const envoltorio = `import CtpKpi from "./CtpKpi";\nexport function LothEmbudoKpi() {\n  return <CtpKpi />;\n}\n`;
    expect(n("kpis", "kpisLocales", { "components/admin/f/CtpKpi.tsx": kpi, "components/admin/f/LothEmbudoKpi.tsx": envoltorio })).toBe(0);
    expect(n("kpis", "kpisLocales", { "components/admin/f/LothEmbudoKpi.tsx": envoltorio })).toBe(1);
  });

  it("el canónico por defecto se reconoce por el nombre de su archivo (ActionMenu de action-menu)", () => {
    const t = `import ActionMenu from "@/components/admin/shared/action-menu";\nexport default function CtpRecepcionFiltro() {\n  return <ActionMenu label="x" actions={[]} />;\n}\n`;
    const otro = `import ActionMenu from "./mi-menu-propio";\nexport default function CtpRecepcionFiltro() {\n  return <ActionMenu label="x" actions={[]} />;\n}\n`;
    expect(n("filtros", "filtrosLocales", { "components/admin/f/CtpRecepcionFiltro.tsx": t })).toBe(0);
    expect(n("filtros", "filtrosLocales", { "components/admin/f/CtpRecepcionFiltro.tsx": otro })).toBe(1);
  });

  it("un local que tapa al canónico con su mismo nombre y lo hace a mano cuenta", () => {
    const t = `function Casilla() {\n  return <input type="checkbox" />;\n}\nexport function FiltroCasilla() {\n  return <Casilla />;\n}\n`;
    expect(n("checks", "checksLocales", { "components/admin/a/x.tsx": t })).toBe(2);
  });
});

describe("comparar() — reclasificar una métrica se ve", () => {
  it("manda el sentido de hoy y la lista la reclasificada", () => {
    const antes = { medido: "", archivos: 1, familias: { estructura: { VistaHeader: { n: 10, sentido: "baja" } } } };
    const ahora = { medido: "", archivos: 1, familias: { estructura: { VistaHeader: { n: 17, sentido: "info" } } } };
    const { empeoro, reclasificadas } = comparar(antes, ahora);
    expect(empeoro).toEqual([]);
    expect(reclasificadas.map((x: { metrica: string; era: string; sentido: string }) => `${x.metrica}:${x.era}→${x.sentido}`)).toEqual(["VistaHeader:baja→info"]);
  });
});
