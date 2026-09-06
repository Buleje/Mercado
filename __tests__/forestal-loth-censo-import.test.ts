/**
 * loth-censo-import — el censo es el punto de partida de toda la cadena de
 * custodia. Un código duplicado, un DAP en cm leído como metros o una columna
 * corrida arruinan el POA, el volumen y la trazabilidad de todo el plan.
 */
import { describe, expect, it } from "vitest";
import { filasImportables, parseCensoTabla, volumenCenso } from "@/lib/forestal/loth-censo-import";

describe("lectura de la hoja del regente", () => {
  it("detecta encabezados en cualquier orden y con la jerga de campo", () => {
    const r = parseCensoTabla(`N° Árbol\tNombre común\tDAP (cm)\tAltura comercial\tEste\tNorte\tZona
85-TOR\tTornillo\t80\t16\t545000\t9012000\t18L
1-SHI\tShihuahuaco\t96\t16\t545200\t9012410\t18L`);
    expect(r.conEncabezado).toBe(true);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0].treeCode).toBe("85-TOR");
    expect(r.filas[0].dapM).toBeCloseTo(0.8, 3);
    expect(r.filas[0].utmX).toBe(545_000);
    expect(r.validas).toBe(2);
  });

  it("sigue leyendo el formato viejo posicional (sin encabezado)", () => {
    const r = parseCensoTabla("85-TOR,Tornillo,0.80,16,0.65,18L,545000,9012000");
    expect(r.conEncabezado).toBe(false);
    expect(r.filas[0].speciesCommon).toBe("Tornillo");
    expect(r.filas[0].dapM).toBe(0.8);
    expect(r.filas[0].factorForma).toBe(0.65);
  });

  it("convierte el DAP de cm a metros y lo avisa", () => {
    const r = parseCensoTabla("codigo,especie,dap\nA1,Tornillo,80");
    expect(r.filas[0].dapM).toBeCloseTo(0.8, 3);
    expect(r.filas[0].avisos.some((a) => a.includes("cm"))).toBe(true);
  });

  it("acepta coma decimal y separador de miles", () => {
    const r = parseCensoTabla("codigo;especie;dap;altura;este;norte\nA1;Tornillo;0,80;16,5;545 000;9 012 000");
    expect(r.filas[0].dapM).toBe(0.8);
    expect(r.filas[0].alturaComercialM).toBe(16.5);
    expect(r.filas[0].utmX).toBe(545_000);
  });

  it("calcula el volumen con Smalian y el factor de forma", () => {
    const r = parseCensoTabla("codigo,especie,dap,altura,ff\nA1,Tornillo,0.80,16,0.65");
    expect(r.filas[0].volumenEstimadoM3).toBeCloseTo(volumenCenso(0.8, 16, 0.65) ?? 0, 4);
    // 0,7854 × 0,80² × 16 × 0,65 = 5,2276 m³
    expect(r.filas[0].volumenEstimadoM3).toBeCloseTo(5.2276, 3);
  });
});

describe("validaciones que frenan la importación", () => {
  it("rechaza filas sin código o sin especie", () => {
    const r = parseCensoTabla("codigo,especie,dap\n,Tornillo,0.8\nA2,,0.8");
    expect(r.filas[0].errores).toContain("Falta el código del árbol");
    expect(r.filas[1].errores).toContain("Falta la especie");
    expect(r.validas).toBe(0);
  });

  it("detecta códigos repetidos dentro del archivo", () => {
    const r = parseCensoTabla("codigo,especie,dap\nA1,Tornillo,0.8\nA1,Tornillo,0.9");
    expect(r.filas[1].errores.some((e) => e.includes("repetido"))).toBe(true);
    expect(r.validas).toBe(1);
  });

  it("detecta códigos que ya existen en el censo del plan", () => {
    const r = parseCensoTabla("codigo,especie,dap\n85-TOR,Tornillo,0.8", {
      codigosExistentes: new Set(["85-tor"]),
    });
    expect(r.filas[0].errores.some((e) => e.includes("ya existe"))).toBe(true);
  });

  it("rechaza coordenadas UTM incompletas o fuera de rango", () => {
    const r = parseCensoTabla("codigo,especie,dap,este,norte\nA1,Tornillo,0.8,545000,\nA2,Tornillo,0.8,99,9012000");
    expect(r.filas[0].errores.some((e) => e.includes("incompleta"))).toBe(true);
    expect(r.filas[1].errores.some((e) => e.includes("fuera del rango"))).toBe(true);
  });

  it("no corre las columnas cuando la primera celda viene vacía", () => {
    // El trim de la línea entera se comía el tab y "Tornillo" pasaba a ser el código.
    const r = parseCensoTabla("codigo\tespecie\tdap\n\tTornillo\t0.8");
    expect(r.filas[0].treeCode).toBe("");
    expect(r.filas[0].speciesCommon).toBe("Tornillo");
    expect(r.filas[0].errores).toContain("Falta el código del árbol");
  });

  it("rechaza alturas imposibles", () => {
    const r = parseCensoTabla("codigo,especie,dap,altura\nA1,Tornillo,0.8,120");
    expect(r.filas[0].errores.some((e) => e.includes("Altura"))).toBe(true);
  });
});

describe("avisos que no frenan pero se muestran", () => {
  it("marca la especie que no está autorizada en el plan", () => {
    const r = parseCensoTabla("codigo,especie,dap\nA1,Caoba,0.9", {
      especiesAutorizadas: new Set(["tornillo"]),
    });
    expect(r.filas[0].errores).toHaveLength(0);
    expect(r.filas[0].avisos.some((a) => a.includes("no autorizada"))).toBe(true);
  });

  it("marca el árbol que está por debajo del DMC de su especie", () => {
    const r = parseCensoTabla("codigo,especie,dap\nA1,Tornillo,45"); // DMC tornillo = 61 cm
    expect(r.filas[0].avisos.some((a) => a.includes("DMC de 61"))).toBe(true);
    expect(r.filas[0].errores).toHaveLength(0); // se censa igual
  });

  it("respeta el DMC que fijó el plan", () => {
    const r = parseCensoTabla("codigo,especie,dap\nA1,Tornillo,45", { dmcOverrides: { tornillo: 41 } });
    expect(r.filas[0].avisos.some((a) => a.includes("DMC"))).toBe(false);
  });

  it("avisa cuando el árbol no tiene coordenada ni DAP", () => {
    const r = parseCensoTabla("codigo,especie\nA1,Tornillo");
    expect(r.filas[0].avisos.some((a) => a.includes("Sin DAP"))).toBe(true);
    expect(r.filas[0].avisos.some((a) => a.includes("Sin coordenada"))).toBe(true);
  });
});

describe("salida", () => {
  it("solo exporta las filas sin errores, en el shape del endpoint bulk", () => {
    const r = parseCensoTabla("codigo,especie,dap,altura\nA1,Tornillo,0.8,16\n,Tornillo,0.8,16");
    const filas = filasImportables(r);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ treeCode: "A1", speciesCommon: "Tornillo", dapM: 0.8, alturaComercialM: 16 });
    expect(filas[0].volumenEstimadoM3).toBeGreaterThan(0);
  });

  it("una hoja vacía o basura no rompe nada", () => {
    expect(parseCensoTabla("").filas).toHaveLength(0);
    expect(parseCensoTabla("   \n  ").filas).toHaveLength(0);
    const basura = parseCensoTabla("hola mundo");
    expect(basura.validas).toBe(0);
  });
});
