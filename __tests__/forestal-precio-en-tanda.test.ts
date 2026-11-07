/**
 * Poner precio a la madera en tanda — la regla pura (lib/forestal/precio-en-tanda.ts).
 *
 * Las fixtures son filas REALES del tenant forestal (2026-09-25): guías de un
 * solo asiento de Santos Muñoz, Quinchunlla y Santa Rosa de Chivis, con su
 * volumen tal como lo declara el libro. Las referencias del dedazo son las del
 * plan de manejo real (Tornillo: venta S/ 180/m³, VEN S/ 12,50) y el precio al
 * que vende su tabla (S/ 7,00 el pt).
 */
import { describe, expect, it } from "vitest";
import {
  FACTOR_DEDAZO,
  agruparParaPrecio,
  avisosDePrecio,
  claveGrupo,
  costoDe,
  planDePrecio,
  precioAplicable,
  rangoDePrecio,
  referenciasDesde,
  type FilaParaPrecio,
} from "@/lib/forestal/precio-en-tanda";

const SANTOS = "SANTOS MUÑOZ JOSE HORD";
let n = 0;
const fila = (p: Partial<FilaParaPrecio> & Pick<FilaParaPrecio, "speciesCommonName" | "volumeM3">): FilaParaPrecio => ({
  id: `w${++n}`,
  gtfNumber: `GTF-${n}`,
  entryDate: "2026-09-08T05:00:00.000Z",
  providerName: SANTOS,
  costoTotal: null,
  moneda: "PEN",
  status: "validado",
  permiso: "10-HUA-PUE/PER-FMP-2026-007",
  bloqueo: null,
  ...p,
});

const blas = (): FilaParaPrecio[] => [
  fila({ id: "mash", speciesCommonName: "Mashonaste", volumeM3: 9.42 }),
  fila({ id: "ana", speciesCommonName: "Ana Caspi", volumeM3: 8.384 }),
  fila({ id: "yacu", speciesCommonName: "Yacuchapana", volumeM3: 8.309 }),
  fila({ id: "azu", speciesCommonName: "Azucar huayo", volumeM3: 6.049 }),
  fila({
    id: "nelly",
    providerName: "QUINCHUNLLA PEREZ, NELLY",
    speciesCommonName: "Tornillo",
    volumeM3: 21.311,
    status: "pendiente",
    permiso: "19-SEC/REG-PLT-2018-020",
  }),
  fila({
    id: "chivis",
    providerName: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
    speciesCommonName: "Tornillo",
    volumeM3: 20.061,
    status: "pendiente",
    permiso: "19-SEC/REG-PLT-2021-017",
  }),
];

const vistosDe = (fs: readonly FilaParaPrecio[]) => fs.map((f) => ({ id: f.id, antes: f.costoTotal }));

describe("costoDe — precio × volumen al céntimo, sin error de punto flotante", () => {
  it("las cuentas del patio real", () => {
    expect(costoDe(180, 9.42)).toBe(1695.6);
    expect(costoDe(180, 8.384)).toBe(1509.12);
    expect(costoDe(180, 21.311)).toBe(3835.98);
  });
  it("la mitad del céntimo sube (como la calculadora del contador)", () => {
    expect(costoDe(1.01, 0.5)).toBe(0.51); // 0.505
    expect(costoDe(0.05, 0.1)).toBe(0.01); // 0.005
    expect(costoDe(180.15, 6.0485)).toBe(1089.64); // 1089.637…
  });
});

describe("agruparParaPrecio — proveedor × especie", () => {
  it("arma los tres proveedores del tenant real, el de más m³ sin precio arriba", () => {
    const g = agruparParaPrecio(blas());
    expect(g.map((p) => p.proveedor)).toEqual([SANTOS, "QUINCHUNLLA PEREZ, NELLY", "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS"]);
    expect(g[0].especies.map((e) => e.especie)).toEqual(["Mashonaste", "Ana Caspi", "Yacuchapana", "Azucar huayo"]);
    expect(g[0]).toMatchObject({ filas: 4, sinPrecio: 4, m3SinPrecio: 32.162, permisos: ["10-HUA-PUE/PER-FMP-2026-007"] });
    expect(g[1].especies[0]).toMatchObject({ filas: 1, m3: 21.311, sinPrecio: 1, permisos: ["19-SEC/REG-PLT-2018-020"] });
  });

  it("dos grafías del mismo proveedor y especie son UN grupo; gana el nombre más usado", () => {
    const g = agruparParaPrecio([
      fila({ speciesCommonName: "Cachimbo", volumeM3: 7 }),
      fila({ speciesCommonName: "CACHIMBO", volumeM3: 8 }),
      fila({ providerName: "Santos  Muñoz jose hord", speciesCommonName: "cachimbo ", volumeM3: 5 }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].especies).toHaveLength(1);
    expect(g[0].proveedor).toBe(SANTOS);
    expect(g[0].especies[0]).toMatchObject({ filas: 3, m3: 20 });
  });

  it("anuladas y rechazadas no entran (mismo filtro que la Plata del permiso)", () => {
    const g = agruparParaPrecio([
      fila({ speciesCommonName: "Tornillo", volumeM3: 20.687, status: "rechazado" }),
      fila({ speciesCommonName: "Tornillo", volumeM3: 5, status: "anulado" }),
      fila({ speciesCommonName: "Tornillo", volumeM3: 3, status: "procesado" }),
    ]);
    expect(g[0].filas).toBe(1);
    expect(g[0].m3).toBe(3);
  });

  it("cuenta con precio, bloqueadas, sin permiso y el S/ por m³ que ya tienen", () => {
    const g = agruparParaPrecio([
      fila({ speciesCommonName: "Tornillo", volumeM3: 10, costoTotal: 1800 }),
      fila({ speciesCommonName: "Tornillo", volumeM3: 5, costoTotal: 1000 }),
      fila({ speciesCommonName: "Tornillo", volumeM3: 4, permiso: null, bloqueo: { tipo: "periodo-cerrado", periodo: "mayo de 2026" } }),
    ])[0].especies[0];
    expect(g).toMatchObject({ conPrecio: 2, sinPrecio: 1, bloqueadas: 1, sinPermiso: 1, precioActual: { min: 180, max: 200 } });
  });
});

describe("planDePrecio — qué filas se tocan", () => {
  const PRECIO_SANTOS = [
    { proveedor: SANTOS, especie: "Mashonaste", precioM3: 180 },
    { proveedor: SANTOS, especie: "Ana Caspi", precioM3: 180 },
    { proveedor: SANTOS, especie: "Yacuchapana", precioM3: 180 },
    { proveedor: SANTOS, especie: "Azucar huayo", precioM3: 180 },
  ];

  it("un precio para todo el proveedor: sólo sus filas, total exacto", () => {
    const fs = blas();
    const p = planDePrecio(fs, PRECIO_SANTOS, { tambienConPrecio: false, vistos: vistosDe(fs) });
    expect(p.cambios.map((c) => c.id)).toEqual(["mash", "ana", "yacu", "azu"]);
    expect(p.totales).toEqual({ filas: 4, m3: 32.162, soles: 5789.16, pisadas: 0 });
    expect(p.saltadas).toEqual([]);
  });

  it("NO pisa las que ya tienen precio salvo que se pida", () => {
    const fs = blas();
    fs[0].costoTotal = 1500;
    const sin = planDePrecio(fs, PRECIO_SANTOS, { tambienConPrecio: false, vistos: vistosDe(fs) });
    expect(sin.cambios.map((c) => c.id)).not.toContain("mash");
    expect(sin.saltadas).toEqual([expect.objectContaining({ id: "mash", motivo: "ya-tiene-precio" })]);

    const con = planDePrecio(fs, PRECIO_SANTOS, { tambienConPrecio: true, vistos: vistosDe(fs) });
    expect(con.cambios.find((c) => c.id === "mash")).toMatchObject({ antes: 1500, monedaAntes: "PEN", despues: 1695.6 });
    expect(con.totales.pisadas).toBe(1);
  });

  it("pisar con el MISMO costo no es un cambio", () => {
    const fs = [fila({ id: "x", speciesCommonName: "Mashonaste", volumeM3: 9.42, costoTotal: 1695.6 })];
    const p = planDePrecio(fs, PRECIO_SANTOS, { tambienConPrecio: true, vistos: vistosDe(fs) });
    expect(p.cambios).toEqual([]);
    expect(p.saltadas[0].motivo).toBe("sin-cambio");
  });

  it("salta y DICE el mes cerrado, el costo congelado y la guía sin volumen", () => {
    const fs = [
      fila({ id: "cerr", speciesCommonName: "Mashonaste", volumeM3: 2, bloqueo: { tipo: "periodo-cerrado", periodo: "mayo de 2026" } }),
      fila({ id: "cong", speciesCommonName: "Mashonaste", volumeM3: 2, costoTotal: 300, bloqueo: { tipo: "congelado" } }),
      fila({ id: "cero", speciesCommonName: "Mashonaste", volumeM3: 0 }),
    ];
    const p = planDePrecio(fs, PRECIO_SANTOS, { tambienConPrecio: true, vistos: vistosDe(fs) });
    expect(p.cambios).toEqual([]);
    expect(p.saltadas.map((s) => [s.id, s.motivo, s.detalle])).toEqual([
      ["cerr", "periodo-cerrado", "mayo de 2026"],
      ["cong", "congelado", null],
      ["cero", "sin-volumen", null],
    ]);
  });

  it("lo que cambió desde la vista previa se salta; lo que no se mostró no se toca", () => {
    const fs = blas();
    const vistos = vistosDe(fs).filter((v) => v.id !== "azu"); // llegó después de abrir el modal
    fs[1].costoTotal = 900; // otro la valorizó mientras mirabas
    const p = planDePrecio(fs, PRECIO_SANTOS, { tambienConPrecio: true, vistos });
    expect(p.cambios.map((c) => c.id)).toEqual(["mash", "yacu"]);
    expect(p.saltadas).toEqual([expect.objectContaining({ id: "ana", motivo: "cambio-mientras-tanto" })]);
  });

  it("una guía mostrada que ya no está viva se informa", () => {
    const fs = blas();
    const p = planDePrecio(fs.slice(1), PRECIO_SANTOS, { tambienConPrecio: false, vistos: vistosDe(fs) });
    expect(p.saltadas).toEqual([expect.objectContaining({ id: "mash", motivo: "no-valorizable" })]);
  });

  it("precio 0, negativo o de menos de un céntimo no aplica nada: sin factura es null, nunca 0", () => {
    const fs = blas();
    for (const precioM3 of [0, -5, 0.004, Number.NaN]) {
      const p = planDePrecio(fs, [{ proveedor: SANTOS, especie: "Mashonaste", precioM3 }], { tambienConPrecio: true });
      expect(p.cambios).toEqual([]);
    }
    expect(precioAplicable(0.004)).toBeNull();
    expect(precioAplicable(0.01)).toBe(0.01);
    expect(precioAplicable(180.004)).toBe(180);
  });

  it("una guía sin proveedor ni especie se puede valorizar con el rótulo que muestra la pantalla", () => {
    const fs = [fila({ id: "vacia", providerName: "", speciesCommonName: "", volumeM3: 2 })];
    const g = agruparParaPrecio(fs)[0];
    expect([g.proveedor, g.especies[0].especie]).toEqual(["(sin proveedor)", "(sin especie)"]);
    const p = planDePrecio(fs, [{ proveedor: g.proveedor, especie: g.especies[0].especie, precioM3: 100 }], {
      tambienConPrecio: false,
      vistos: vistosDe(fs),
    });
    expect(p.cambios.map((c) => [c.id, c.despues])).toEqual([["vacia", 200]]);
  });

  it("un proveedor con paréntesis en el nombre no se mezcla con otro", () => {
    const g = agruparParaPrecio([
      fila({ providerName: "Origen 41/C (0000013) · 019-0000004", speciesCommonName: "Catahua", volumeM3: 3.896 }),
      fila({ providerName: "Origen 33/B (0000010) · 019-0000002", speciesCommonName: "Catahua", volumeM3: 3.01 }),
    ]);
    expect(g).toHaveLength(2);
  });

  it("la clave del grupo ignora tildes, mayúsculas y el científico entre paréntesis", () => {
    expect(claveGrupo("Santos Muñoz", "Tornillo (Cedrelinga catenaeformis)")).toBe(claveGrupo("SANTOS MUNOZ", "tornillo"));
  });
});

describe("detector de dedazos", () => {
  const refsBlas = referenciasDesde({
    filas: blas(),
    plan: [{ especie: "Tornillo (Cedrelinga catenaeformis)", precioVentaM3: 180, venM3: 12.5 }],
    ventasPt: [{ especie: "Tornillo", precioPt: 7 }],
  });

  it("sin ninguna referencia no avisa (rama muda)", () => {
    const vacias = referenciasDesde({ filas: blas(), plan: [], ventasPt: [] });
    expect(rangoDePrecio("Cachimbo", vacias)).toBeNull();
    expect(avisosDePrecio(18, null)).toEqual([]);
  });

  it("Tornillo: la base es el plan de manejo, ventana de √10, piso VEN y techo de la tabla", () => {
    const r = rangoDePrecio("Tornillo", refsBlas);
    expect(r).toMatchObject({ base: 180, origen: "plan-especie", min: 56.92, max: 569.21, piso: 12.5, techo: 1662.08 });
    expect(FACTOR_DEDAZO).toBeCloseTo(3.1623, 4);
  });

  it("S/ 180 no avisa; S/ 18 y S/ 1 800 (un cero de más o de menos) sí", () => {
    const r = rangoDePrecio("Tornillo", refsBlas);
    expect(avisosDePrecio(180, r)).toEqual([]);
    expect(avisosDePrecio(57, r)).toEqual([]);
    expect(avisosDePrecio(18, r)).toEqual([expect.stringMatching(/menos de un tercio.*¿Falta un cero\?/)]);
    const alto = avisosDePrecio(1800, r);
    expect(alto).toHaveLength(2);
    expect(alto[1]).toMatch(/tabla que sale de 1 m³/);
  });

  it("debajo del VEN avisa aunque la ventana no lo alcance", () => {
    const r = { ...rangoDePrecio("Tornillo", refsBlas)!, min: 1 };
    expect(avisosDePrecio(10, r)).toEqual([expect.stringMatching(/valor del árbol en pie/)]);
  });

  it("otra especie usa la referencia del tenant y lo DICE", () => {
    const r = rangoDePrecio("Cachimbo", refsBlas);
    expect(r).toMatchObject({ base: 180, origen: "plan-otras", piso: null, techo: 1662.08 });
  });

  it("lo ya pagado por la especie manda sobre el plan", () => {
    const refs = referenciasDesde({
      filas: [
        fila({ speciesCommonName: "Tornillo", volumeM3: 10, costoTotal: 3500 }),
        fila({ speciesCommonName: "Tornillo", volumeM3: 10, costoTotal: 3000 }),
        fila({ speciesCommonName: "Tornillo", volumeM3: 10, costoTotal: 4000 }),
        // No cuentan: dólares, S/ 0 («no sé» mal cargado) y una rechazada.
        fila({ speciesCommonName: "Tornillo", volumeM3: 10, costoTotal: 90000, moneda: "USD" }),
        fila({ speciesCommonName: "Tornillo", volumeM3: 10, costoTotal: 0 }),
        fila({ speciesCommonName: "Tornillo", volumeM3: 10, costoTotal: 90000, status: "rechazado" }),
      ],
      plan: [{ especie: "Tornillo", precioVentaM3: 180, venM3: null }],
      ventasPt: [],
    });
    expect(refs.pagado.porEspecie.tornillo).toEqual({ mediana: 350, casos: 3 });
    expect(rangoDePrecio("Tornillo", refs)).toMatchObject({ base: 350, origen: "pagado-especie", techo: null });
  });
});
