import { describe, expect, it } from "vitest";
import {
  camaraParecida, categoriaDeNombre, claveLeyenda, formatoComponente, formatoDeZona, guardaMadera, identificarZona,
  leyendaDeZonas, resumenCategorias, tipoDeComponente, PATRON_RAYADO_CEMENTO, PATRON_RAYADO_TECHO,
} from "@/lib/forestal/croquis-componentes";
import { tipoSugerido, zonasDesdeComponentes } from "@/lib/forestal/croquis-desde-pdf";
import { normalizeZona, zonaTipoMeta, type CategoriaComponente, type PlantaZona } from "@/lib/forestal/planta-zona-types";
import { LEYENDA_V9 } from "./fixtures/croquis-v9-pdf";

/** Lo que es cada renglón de la leyenda del plano v9 (Brandon, 03-10). */
const ESPERADO_V9: CategoriaComponente[] = [
  "limite", "limite", "techo", "maquinaria", "madera", "servicio", "maquinaria", "madera", "servicio", "maquinaria", // 1-10
  "maquinaria", "servicio", "servicio", "madera", "maquinaria", "maquinaria", "maquinaria", "madera", "madera", "acceso", // 11-20
  "seguridad", "maquinaria", "maquinaria", "madera", "servicio", "maquinaria", "naturaleza", "naturaleza", "madera", "techo", // 21-30
  "acceso", "seguridad", "techo", "seguridad", "madera", "techo", "servicio", // 31-37
];

describe("clasificador de la leyenda — los 37 renglones del plano v9", () => {
  it("cada renglón cae en su categoría", () => {
    expect(LEYENDA_V9).toHaveLength(37);
    const mal = LEYENDA_V9.map((n, i) => ({ n: i + 1, nombre: n, sale: categoriaDeNombre(n), esperado: ESPERADO_V9[i] })).filter((x) => x.sale !== x.esperado);
    expect(mal).toEqual([]);
  });

  it("el orden de las reglas decide los casos que se pisan", () => {
    expect(categoriaDeNombre("Acopio de trozas para el coche")).toBe("madera"); // dice coche, es madera
    expect(categoriaDeNombre("Rodillos (salida de madera)")).toBe("maquinaria"); // dice madera, es máquina
    expect(categoriaDeNombre("Cerco de madera (palizada)")).toBe("limite");
    expect(categoriaDeNombre("Tanque de agua elevado")).toBe("servicio"); // «agua» no lo hace río
    expect(categoriaDeNombre("Oficina pequeña (con cámara)")).toBe("seguridad");
    expect(categoriaDeNombre("Techo parabólico (zona de aserrío)")).toBe("techo");
    expect(categoriaDeNombre("Algo que no dice nada")).toBe("otro");
  });

  it("el tipo sugerido sale de la categoría (y coincide con lo que ya sugería la importación)", () => {
    const t = (n: number) => tipoSugerido(LEYENDA_V9[n - 1]);
    expect([t(8), t(14)]).toEqual(["patio_trozas", "patio_trozas"]);
    expect([t(15), t(23), t(4)]).toEqual(["aserrado", "aserrado", "aserrado"]); // maquinaria
    expect(t(36)).toBe("aserrado"); // techo de aserrío
    expect([t(3), t(30)]).toEqual(["patio_producto", "patio_producto"]); // ramadas: madera bajo techo
    expect(t(33)).toBe("otro"); // piso de cemento
    expect([t(31), t(20)]).toEqual(["entrada", "entrada"]);
    expect(t(32)).toBe("oficina");
    expect(t(21)).toBe("otro"); // la cámara es una cámara
    expect([t(27), t(28), t(13), t(1)]).toEqual(["otro", "otro", "otro", "otro"]);
    expect([t(29), t(24), t(5)]).toEqual(["patio_producto", "patio_producto", "patio_producto"]);
    expect(tipoDeComponente("madera", "Cancha de reserva")).toBe("reserva");
    expect(tipoDeComponente("acceso", "Zona de despacho")).toBe("despacho");
  });
});

describe("formato por categoría — la simbología del plano", () => {
  it("ramada rayada, techo parabólico punteado azul, cerco marrón, malla verde azulada, río azul, maquinaria amarilla", () => {
    expect(formatoComponente({ categoria: "techo", nombre: "Ramada de calamina" }).relleno).toBe(`url(#${PATRON_RAYADO_TECHO})`);
    const parab = formatoComponente({ categoria: "techo", nombre: "Techo parabólico" });
    expect(parab.color).toBe("var(--data-6)");
    expect(parab.trazo).toBeTruthy();
    expect(formatoComponente({ categoria: "techo", nombre: "Zona con piso de cemento" }).relleno).toBe(`url(#${PATRON_RAYADO_CEMENTO})`);
    expect(formatoComponente({ categoria: "limite", nombre: "Cerco de madera" }).color).toBe("var(--amazon-earth)");
    expect(formatoComponente({ categoria: "limite", nombre: "Malla raschel" }).color).toBe("var(--data-5)");
    expect(formatoComponente({ categoria: "naturaleza", nombre: "Río / canal de agua" }).color).toBe("var(--data-6)");
    expect(formatoComponente({ categoria: "naturaleza", nombre: "Vivero" }).color).toBe("var(--amazon-jungle)");
    expect(formatoComponente({ categoria: "maquinaria", nombre: "Cinta principal" }).color).toBe("var(--amazon-sunset)");
  });

  it("ningún formato trae un hex: todo son tokens o patrones", () => {
    for (const [i, n] of LEYENDA_V9.entries()) {
      const f = formatoComponente({ categoria: ESPERADO_V9[i], nombre: n });
      expect(`${f.color} ${f.relleno}`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});

describe("compatibilidad — zonas guardadas antes del componente", () => {
  const vieja: Record<string, unknown> = { id: "z1", codigo: "PT-08", nombre: "Patio de trozas", tipo: "patio_trozas", poligono: "[[0,0],[0,5],[5,5]]", plano: "croquis", createdAt: "2026-10-03T10:00:00.000Z" };

  it("una zona sin componente se normaliza igual que antes (sin el campo)", () => {
    const z = normalizeZona(vieja);
    expect(z).not.toHaveProperty("componente");
    expect(z.tipo).toBe("patio_trozas");
    expect(z.plano).toBe("croquis");
  });

  it("sin componente: se dibuja con el color de su tipo, sigue siendo destino y va a la leyenda por su tipo", () => {
    const z = normalizeZona(vieja);
    expect(formatoDeZona(z).color).toBe(zonaTipoMeta("patio_trozas").ring);
    expect(guardaMadera(z)).toBe(true);
    expect(claveLeyenda(z)).toBe("tipo:patio_trozas");
  });

  it("un componente roto se descarta; uno válido se guarda recortado", () => {
    expect(normalizeZona({ ...vieja, componente: { categoria: "inventada", nombre: "x" } })).not.toHaveProperty("componente");
    expect(normalizeZona({ ...vieja, componente: "madera" })).not.toHaveProperty("componente");
    const z = normalizeZona({ ...vieja, componente: { numero: 8, nombre: "  Patio de trozas  ", categoria: "madera" } });
    expect(z.componente).toEqual({ numero: 8, nombre: "Patio de trozas", categoria: "madera" });
    expect(normalizeZona({ ...vieja, componente: { numero: -3, nombre: "a", categoria: "otro" } }).componente?.numero).toBeNull();
  });

  it("null borra el componente al editar (upsert {...existente, ...input})", () => {
    const existente = normalizeZona({ ...vieja, componente: { numero: 8, nombre: "Patio", categoria: "madera" } });
    expect(normalizeZona({ ...existente, componente: null })).not.toHaveProperty("componente");
    // Sin el campo en el input, se conserva el de la zona.
    expect(normalizeZona({ ...existente, nombre: "Otro nombre" }).componente?.categoria).toBe("madera");
  });
});

describe("identificar las zonas ya cargadas (las 12 de main)", () => {
  const MAIN: [string, string, PlantaZona["tipo"], CategoriaComponente][] = [
    ["PP-05-3", "Madera aserrada apilada · punto 3", "patio_producto", "madera"],
    ["PP-05", "Madera aserrada apilada · bajo la ramada", "patio_producto", "madera"], // dice ramada, es la madera
    ["PP-05-2", "Madera aserrada apilada · punto 2", "patio_producto", "madera"],
    ["LN-29", "Leña", "otro", "madera"],
    ["CB-24", "Zona de carbón", "otro", "madera"],
    ["PP-18", "Patio 18 · madera corta", "patio_producto", "madera"],
    ["PP-19", "Zona de apilado y cubicación", "patio_producto", "madera"],
    ["PT-14", "Acopio de trozas para el coche", "patio_trozas", "madera"],
    ["PT-08", "Patio de trozas", "patio_trozas", "madera"],
    ["PT-35", "Patio / acopio de madera 2", "patio_trozas", "madera"],
    ["PP-30", "Ramada 2 · recuperación y paquetería", "patio_producto", "techo"],
    ["AS-36", "Techo parabólico · zona de aserrío", "aserrado", "techo"],
  ];

  it("por el nombre, con el número del código", () => {
    for (const [codigo, nombre, tipo, cat] of MAIN) {
      const c = identificarZona({ codigo, nombre, tipo });
      expect({ codigo, cat: c.categoria }).toEqual({ codigo, cat });
    }
    expect(identificarZona({ codigo: "PP-05-3", nombre: "x", tipo: "patio_producto" }).numero).toBe(5);
    expect(identificarZona({ codigo: "AS-36", nombre: "Techo parabólico · zona de aserrío", tipo: "aserrado" }).numero).toBe(36);
  });

  it("sin nombre que diga algo, manda el tipo que ya tiene", () => {
    expect(identificarZona({ codigo: "AS-02", nombre: null, tipo: "aserrado" })).toEqual({ numero: 2, nombre: "AS-02", categoria: "maquinaria" });
    expect(identificarZona({ codigo: "Z-9", nombre: "Sector norte", tipo: "patio_trozas" }).categoria).toBe("madera");
  });

  it("después de identificar, todas las de main siguen siendo destino de madera (ramada y techo de aserrío incluidos)", () => {
    for (const [codigo, nombre, tipo] of MAIN) expect(guardaMadera({ tipo, componente: identificarZona({ codigo, nombre, tipo }) })).toBe(true);
  });
});

describe("destino de madera", () => {
  const z = (categoria: CategoriaComponente, tipo: PlantaZona["tipo"] = "otro") => ({ tipo, componente: { numero: 1, nombre: "x", categoria } });
  it("no se ofrecen: límite, naturaleza, servicio, oficina, cámaras y el techo sin madera", () => {
    for (const c of ["limite", "naturaleza", "servicio", "oficina", "seguridad"] as const) expect(guardaMadera(z(c))).toBe(false);
    expect(guardaMadera(z("techo", "otro"))).toBe(false); // piso de cemento
    expect(guardaMadera(z("techo", "patio_producto"))).toBe(true); // ramada
  });
  it("sí: madera, maquinaria, acceso y otro", () => {
    for (const c of ["madera", "maquinaria", "acceso", "otro"] as const) expect(guardaMadera(z(c))).toBe(true);
  });
});

describe("leyenda en pantalla", () => {
  it("agrupa por categoría en el orden del catálogo y deja las sin identificar al final, por su tipo", () => {
    const zonas = [
      { tipo: "aserrado" as const, componente: { numero: 15, nombre: "Cinta principal", categoria: "maquinaria" as const } },
      { tipo: "patio_trozas" as const, componente: { numero: 8, nombre: "Patio de trozas", categoria: "madera" as const } },
      { tipo: "patio_producto" as const, componente: { numero: 3, nombre: "Ramada de calamina", categoria: "techo" as const } },
      { tipo: "aserrado" as const, componente: { numero: 36, nombre: "Techo parabólico", categoria: "techo" as const } },
      { tipo: "otro" as const },
    ];
    const e = leyendaDeZonas(zonas);
    expect(e.map((x) => x.clave)).toEqual(["cat:madera", "cat:maquinaria", "cat:techo", "tipo:otro"]);
    expect(e.find((x) => x.clave === "cat:techo")?.formatos).toHaveLength(2); // rayado + punteado azul
    expect(e.at(-1)?.label).toMatch(/sin identificar/);
  });

  it("el resumen del aviso se lee en castellano", () => {
    expect(resumenCategorias(["madera", "techo", "madera"])).toBe("2 de madera y 1 de techo y ramada");
    expect(resumenCategorias(["servicio"])).toBe("1 de servicio");
  });
});

describe("la cámara del módulo con nombre parecido", () => {
  const camaras = [
    { id: "c1", nombre: "Portón del patio", lugar: "Entrada de camiones" },
    { id: "c2", nombre: "Cámara 2", lugar: "Almacén de herramientas" },
    { id: "c3", nombre: "Cámara 1", lugar: "Oficina" },
  ];
  it("por número de cámara y por lugar", () => {
    expect(camaraParecida("Cámara 1 DS-2CFSP4-4G (oficina)", camaras)?.id).toBe("c3");
    expect(camaraParecida("Cámara 2 (esquina del almacén)", camaras)?.id).toBe("c2");
  });
  it("sin coincidencia o empatada: null (mejor el enlace al módulo que una cámara equivocada)", () => {
    expect(camaraParecida("Oficina pequeña (con cámara)", [camaras[0]])).toBeNull();
    expect(camaraParecida("Cámara 3", camaras)).toBeNull();
    expect(camaraParecida("Oficina", [{ id: "a", nombre: "Oficina norte" }, { id: "b", nombre: "Oficina sur" }])).toBeNull();
    // Un número suelto no alcanza si la cámara no dice «cámara».
    expect(camaraParecida("Cámara 1", [{ id: "x", nombre: "Bodega 1" }])).toBeNull();
  });
});

describe("importación del PDF — la zona lleva su componente", () => {
  it("zonasDesdeComponentes guarda número, nombre y categoría (la elegida o la del clasificador)", () => {
    const [a, b] = zonasDesdeComponentes([
      { numero: 15, nombre: "Cinta principal", tipo: "aserrado", fx: 0.6, fy: 0.2, categoria: "maquinaria" },
      { numero: 13, nombre: "Baño", tipo: "otro", fx: 0.8, fy: 0.7 },
    ], { anchoM: 54, altoM: 48 });
    expect([a.componente, b.componente]).toEqual(expect.arrayContaining([
      { numero: 15, nombre: "Cinta principal", categoria: "maquinaria" },
      { numero: 13, nombre: "Baño", categoria: "servicio" },
    ]));
  });
});
