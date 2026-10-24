/**
 * loth-censo-import — el censo es el punto de partida de toda la cadena de
 * custodia. Un código duplicado, un DAP en cm leído como metros o una columna
 * corrida arruinan el POA, el volumen y la trazabilidad de todo el plan.
 */
import { describe, expect, it } from "vitest";
import { filasImportables, parseCensoFilas, parseCensoTabla, volumenCenso } from "@/lib/forestal/loth-censo-import";

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

  it("un DAP fuera de tope va a errores con la sugerencia, sin inventarse ni convertirse solo", () => {
    // 500 > 5 ⇒ el heurístico de cm lo convierte a 5 m, y 5 m sigue fuera de
    // tope (4 m): la fila queda BLOQUEADA, dapM no se limpia a la fuerza.
    const r = parseCensoTabla("codigo,especie,dap\nA1,Tornillo,500");
    expect(r.filas[0].errores.some((e) => e.includes("no existe"))).toBe(true);
    expect(r.filas[0].dapM).toBeCloseTo(5, 3);
    const filas = filasImportables(r);
    expect(filas).toHaveLength(0); // no entra al censo con un DAP imposible
  });

  it("avisa (no bloquea) un DAP grueso pero físicamente posible, sin tocar el valor", () => {
    const r = parseCensoTabla("codigo,especie,dap\nA1,Tornillo,3"); // 3 m: bajo el tope, sobre el aviso
    expect(r.filas[0].errores).toHaveLength(0);
    expect(r.filas[0].dapM).toBe(3);
    expect(r.filas[0].avisos.some((a) => a.includes("revisa que esté en metros"))).toBe(true);
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

/**
 * La hoja real de un regente (Brandon, 28-09), con su encabezado tal cual.
 * Antes: «Nombre en idioma nativo» se quedaba con la especie (la Copaiba
 * entraba como «Coubé»), «N. Comun» no se reconocía, y el científico, el
 * volumen, la condición y las observaciones se perdían.
 */
describe("hoja del regente con nombre nativo, volumen y condición", () => {
  const ENCABEZADO = "N°\tCod\tN. Comun\tN. Cientifico\tNombre en idioma nativo\tDAP\taltura\tvol\tEste\tNorte\tcondicion\tobservaciones";
  const HOJA = [
    ENCABEZADO,
    "1\t2\tCopaiba\tCopaifera reticulata Ducke\tCoubé\t1,15\t22\t14,853\t521922\t8918151\tAprovechable\t",
    "5\t8\tMashonaste\tClarisia racemosa Ruiz & Pav.\tTsabiri\t0,9\t18\t7,443\t521937\t8918009\tAprovechable\tCaido natural",
  ].join("\n");

  it("cada columna cae en su campo: la especie es la común, no la nativa", () => {
    const [copaiba, mashonaste] = parseCensoTabla(HOJA).filas;
    expect(copaiba.treeCode).toBe("2");
    expect(copaiba.speciesCommon).toBe("Copaiba");
    expect(copaiba.speciesScientific).toBe("Copaifera reticulata Ducke");
    expect(copaiba.speciesNative).toBe("Coubé");
    expect(copaiba.condicion).toBe("Aprovechable");
    expect(mashonaste.notes).toBe("Caido natural");
    expect(copaiba.utmX).toBe(521_922);
    expect(copaiba.utmY).toBe(8_918_151);
  });

  it("«14,853» es 14,853 m³ y no 14 853: la coma de una medida es decimal", () => {
    const [copaiba] = parseCensoTabla(HOJA).filas;
    expect(copaiba.volumenEstimadoM3).toBe(14.853);
    expect(copaiba.volumenDeLaHoja).toBe(true);
    expect(copaiba.dapM).toBe(1.15);
    // Cuadra con ff 0,65: no hay aviso de volumen.
    expect(copaiba.avisos.some((a) => a.includes("no cuadra"))).toBe(false);
  });

  it("un DAP «0,870» no se lee como 870 cm", () => {
    const r = parseCensoTabla("codigo;especie;dap\nA1;Tornillo;0,870");
    expect(r.filas[0].dapM).toBe(0.87);
  });

  it("las coordenadas sí aceptan separador de miles", () => {
    const r = parseCensoTabla('codigo\tespecie\teste\tnorte\nA1\tTornillo\t"521,922"\t"8,918,151"');
    expect(r.filas[0].utmX).toBe(521_922);
    expect(r.filas[0].utmY).toBe(8_918_151);
  });

  it("un volumen que no puede salir de un factor de forma real se avisa", () => {
    const r = parseCensoTabla(`${ENCABEZADO}\n1\t2\tCopaiba\t\t\t1,15\t22\t148,53\t521922\t8918151\tAprovechable\t`);
    expect(r.filas[0].avisos.some((a) => a.includes("no cuadra"))).toBe(true);
    // Se importa igual: el volumen declarado es el de la hoja.
    expect(r.filas[0].errores).toEqual([]);
  });

  it("sin columna de volumen, se calcula como antes", () => {
    const r = parseCensoTabla("codigo,especie,dap,altura\nA1,Tornillo,0.80,16");
    expect(r.filas[0].volumenDeLaHoja).toBe(false);
    expect(r.filas[0].volumenEstimadoM3).toBeCloseTo(5.2276, 3);
  });

  it("una celda con salto de línea entre comillas no corta el encabezado", () => {
    const r = parseCensoTabla('Cod\tN. Comun\t"Nombre en\nidioma nativo"\n2\tCopaiba\tCoubé');
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].speciesNative).toBe("Coubé");
  });

  it("desde un .xlsx (celdas con números) da lo mismo que pegado", () => {
    const r = parseCensoFilas([
      ["N°", "Cod", "N. Comun", "N. Cientifico", "Nombre en idioma nativo", "DAP", "altura", "vol", "Este", "Norte", "condicion", "observaciones"],
      [1, 2, "Copaiba", "Copaifera reticulata Ducke", "Coubé", 1.15, 22, 14.853, 521922, 8918151, "Aprovechable", null],
    ]);
    expect(r.filas[0]).toMatchObject({ treeCode: "2", speciesCommon: "Copaiba", speciesNative: "Coubé", dapM: 1.15, volumenEstimadoM3: 14.853, utmX: 521922 });
  });

  it("lo que va al servidor lleva los campos nuevos", () => {
    const [fila] = filasImportables(parseCensoTabla(HOJA));
    expect(fila).toMatchObject({ speciesScientific: "Copaifera reticulata Ducke", speciesNative: "Coubé", condicion: "Aprovechable", volumenEstimadoM3: 14.853 });
  });
});
