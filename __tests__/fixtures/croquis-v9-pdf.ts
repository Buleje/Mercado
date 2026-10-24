/**
 * Textos de un PDF vectorial parecido al croquis v9 de Blas
 * (`docs/forestal/croquis-blas-v9.png`, 1288 × 902 px): ejes en metros con
 * origen en la oficina (14,28 px/m), 37 componentes numerados con su leyenda,
 * rótulos de ruta 1–5 (letra más chica), la caja del proceso («1 Patio de
 * trozas (8) → …»), escala gráfica, cotas y máquinas D1–D7.
 *
 * Coordenadas = centro (o borde) del texto en píxeles de esa imagen. Lo usan
 * el test de `croquis-desde-pdf` y el armado del PDF de prueba (con anchos
 * reales de la fuente y la imagen de fondo). `ZONAS_V9` = los rectángulos
 * dibujados de la lámina (para los contornos), medidos sobre la misma imagen.
 */

export type Alinea = "centro" | "izq" | "der";
export interface TextoV9 { str: string; px: number; py: number; h: number; alinea: Alinea; angulo?: number }

export const V9 = { ancho: 1288, alto: 902, origen: { px: 139, py: 795 }, pxPorM: { x: 14.28, y: 14.27 } };

export const LEYENDA_V9: string[] = [
  "Cerco de madera (palizada)", "Malla raschel", "Ramada de calamina (lluvia)", "Losa con motor rojo",
  "Madera aserrada apilada (3 puntos)", "Almacén de herramientas", "Zona de cintas (hojas de sierra)",
  "Patio de almacenamiento de trozas", "Central de energía", "Cilindro", "Zona de afilado", "Tanque de agua elevado",
  "Baño", "Acopio de trozas para el coche", "Cinta principal", "Rodillos (salida de madera)",
  "Mesas 1 y 2 de transferencia", "Patio de maniobras / madera corta", "Zona de apilado y cubicación",
  "Vía exterior – mototaxis", "Cámara 1 DS-2CFSP4-4G (oficina)", "Coche de la cinta principal", "Despuntadora",
  "Zona de carbón", "Casa de campo (2 pisos) – T1", "Coche de aserrío (entre mesas)", "Vivero", "Río / canal de agua",
  "Leña", "Ramada 2: recuperación y paquetería", "Portón principal", "Oficina pequeña (con cámara)",
  "Zona con piso de cemento – T2", "Cámara 2 (esquina del almacén)", "Patio / acopio de madera 2",
  "Techo parabólico (zona de aserrío)", "Cuarto de trabajadores",
];

/** Centro de cada círculo numerado del plano (px). El 5 tiene 3 puntos y el 17, 2. */
export const MARCAS_V9: [number, number, number][] = [
  [1, 123, 339], [2, 185, 556], [3, 167, 383], [4, 167, 440], [5, 313, 508], [5, 247, 612], [5, 205, 714],
  [6, 482, 429], [7, 255, 458], [8, 279, 216], [9, 504, 524], [10, 571, 502], [11, 361, 491], [12, 767, 345],
  [13, 895, 345], [14, 549, 582], [15, 626, 659], [16, 248, 683], [17, 308, 655], [17, 457, 655], [18, 252, 776],
  [19, 153, 668], [20, 92, 660], [21, 246, 739], [22, 461, 762], [23, 367, 732], [24, 692, 255], [25, 775, 208],
  [26, 466, 551], [27, 373, 125], [28, 400, 149], [29, 722, 573], [30, 698, 635], [31, 881, 559], [32, 171, 781],
  [33, 895, 402], [34, 438, 513], [35, 372, 211], [36, 689, 780], [37, 840, 233],
];

/** Rótulos de las rutas del proceso (cajas naranjas): mismos números, letra más chica. */
export const RUTAS_V9: [number, number, number][] = [[1, 475, 352], [2, 654, 645], [3, 634, 733], [4, 541, 682], [5, 281, 730]];

export const MAQUINAS_V9: [string, string, number, number][] = [
  ["D4", "Camión Volvo 1", 339, 262], ["D5", "Camión Volvo 3", 597, 262], ["D3", "Forestal automático", 326, 317],
  ["D6", "Camión Volvo 2", 597, 317], ["D1", "Cargador frontal", 409, 379], ["D2", "Forestal mecánico", 500, 379],
  ["D7", "Oruga", 586, 379],
];

/**
 * Rectángulos de la v9 (px: x0, y0, x1, y1) y el número que deberían tomar
 * (null = sin número: el patio de máquinas, las cajas de D1–D7). En la v9 la
 * mitad de los círculos va AL LADO de su rectángulo, no adentro.
 */
export const ZONAS_V9: [string, number | null, number, number, number, number][] = [
  ["Vivero", 27, 142, 110, 390, 190],
  ["Patio de trozas", 8, 142, 200, 265, 335],
  ["Patio / acopio de madera 2", 35, 387, 187, 623, 233],
  ["Zona de carbón", 24, 638, 178, 748, 240],
  ["Casa de campo", 25, 764, 116, 907, 196],
  ["Cuarto de trabajadores", 37, 852, 205, 918, 262],
  ["Patio de maquinaria", null, 272, 240, 664, 410],
  ["D4", null, 282, 248, 385, 288], ["D5", null, 541, 248, 655, 288], ["D3", null, 282, 300, 372, 340],
  ["D6", null, 541, 300, 655, 340], ["D1", null, 370, 365, 448, 405], ["D2", null, 461, 365, 540, 405], ["D7", null, 551, 365, 623, 405],
  ["Tanque", 12, 782, 323, 818, 363],
  ["Baño", 13, 832, 323, 880, 363],
  ["Piso de cemento", 33, 750, 373, 880, 445],
  ["Ramada de calamina", 3, 153, 368, 358, 530],
  ["Losa con motor", 4, 180, 420, 232, 462],
  ["Zona de cintas", 7, 270, 440, 340, 475],
  ["Afilado", 11, 340, 440, 380, 475],
  ["Madera apilada (ramada)", 5, 238, 493, 298, 522],
  ["Almacén de herramientas", 6, 380, 415, 495, 530],
  ["Central de energía", null, 512, 502, 535, 525],
  ["Techo parabólico", 36, 140, 532, 705, 795],
  ["Acopio de trozas", 14, 560, 553, 700, 610],
  ["Leña", 29, 732, 543, 852, 612],
  ["Madera apilada (malla)", 5, 200, 598, 237, 648],
  ["Mesa 2", 17, 321, 565, 331, 700],
  ["Mesa 1", 17, 425, 565, 445, 700],
  ["Cinta principal", 15, 560, 650, 612, 705],
  ["Ramada 2", 30, 712, 645, 910, 790],
  ["Cubicación", 19, 142, 677, 177, 700],
  ["Rodillos", 16, 262, 672, 560, 692],
  ["Despuntadora", 23, 309, 702, 355, 745],
  ["Coche", null, 483, 712, 550, 755],
  ["Madera apilada (oficina)", 5, 148, 708, 190, 738],
  ["Oficina", 32, 142, 742, 200, 795],
];

export function textosV9(): TextoV9[] {
  const t: TextoV9[] = [];
  const { origen, pxPorM } = V9;
  for (let v = 0; v <= 50; v += 5) t.push({ str: String(v), px: origen.px + pxPorM.x * v, py: 806, h: 6, alinea: "centro" });
  for (let v = 0; v <= 45; v += 5) t.push({ str: String(v), px: 134, py: origen.py - pxPorM.y * v, h: 6, alinea: "der" });
  LEYENDA_V9.forEach((nombre, i) => {
    const py = 95 + 12.42 * i;
    t.push({ str: String(i + 1), px: 1018, py, h: 6.5, alinea: "centro" });
    t.push({ str: nombre, px: 1030, py, h: 6.5, alinea: "izq" });
  });
  for (const [n, px, py] of MARCAS_V9) t.push({ str: String(n), px, py, h: 8, alinea: "centro" });
  for (const [n, px, py] of RUTAS_V9) t.push({ str: String(n), px, py, h: 6.5, alinea: "centro" });
  for (const [cod, nombre, px, py] of MAQUINAS_V9) {
    t.push({ str: cod, px, py, h: 8, alinea: "centro" });
    t.push({ str: nombre, px, py: py + 17, h: 5.5, alinea: "centro" });
  }
  const rotulos: [string, number, number, number][] = [
    ["CROQUIS DE DISTRIBUCIÓN – ASERRADERO (PLANTA DE TRANSFORMACIÓN PRIMARIA)", 20, 16, 12],
    ["Versión 9 · Lámina única · Planta general con flujo de producción y coordenadas locales (medidas estimadas)", 20, 32, 7],
    ["LEYENDA", 1012, 72, 8], ["SIMBOLOGÍA", 1012, 556, 7], ["MAQUINARIA (referencial)", 1012, 677, 7],
    ["D1 Cargador frontal · D2 Forestal mecánico", 1014, 689, 6], ["D3 Forestal automático · D7 Oruga", 1014, 701, 6],
    ["D4 / D5 / D6 Camiones Volvo", 1014, 713, 6], ["AUTORIZ. CTP 145-2023 (SERFOR)", 1008, 797, 6],
    ["~ 54 m (estimado)", 497, 66, 6], ["CALLE", 505, 93, 7], ["PATIO DE TROZAS", 170, 181, 6.5],
    ["RAMADA DE CALAMINA", 211, 382, 6.5], ["Cámara 2", 452, 513, 6.5], ["Cámara 1", 209, 739, 6.5],
    ["Central de energía", 497, 492, 6], ["2 pisos: 1° solo columnas, se usa el 2°", 790, 143, 5],
    ["Coordenadas locales (m): origen 0,0 = esquina de la oficina · ~54 × 48 m", 30, 877, 6],
    ["PROCESO DE PRODUCCIÓN (siga las flechas y sus números)", 315, 819, 7],
    ["A1 Rodillos (16) → Mesa 1 (17)", 482, 846, 6], ["A2 Coche de aserrío (26) → Mesa 2 (17)", 482, 857, 6],
    ["ALMACÉN DE", 405, 452, 6.5], ["HERRAMIENTAS", 400, 466, 6.5],
    ["TECHO PARABÓLICO – cubre toda la zona de aserrío", 465, 779, 6.5],
  ];
  for (const [str, px, py, h] of rotulos) t.push({ str, px, py, h, alinea: "izq" });
  // La caja del proceso: «número + texto» en columna — una lista, no marcas del plano.
  ["Patio de trozas (8) → acopio (14), con cargador", "Acopio (14) → coche (22)", "Coche (22) → corte en cinta (15)", "Cinta (15) → rodillos (16)"]
    .forEach((s, i) => {
      t.push({ str: String(i + 1), px: 315, py: 846 + 11 * i, h: 6, alinea: "izq" });
      t.push({ str: s, px: 323, py: 846 + 11 * i, h: 6, alinea: "izq" });
    });
  // Escala gráfica: números sueltos FUERA del terreno.
  ["0", "2", "4", "6", "8"].forEach((s, i) => t.push({ str: s, px: 130 + 29 * i, py: 860, h: 6, alinea: "centro" }));
  t.push({ str: "10 m", px: 275, py: 860, h: 6, alinea: "centro" });
  t.push({ str: "~ 48 m (estimado)", px: 968, py: 470, h: 6, alinea: "centro", angulo: -90 });
  return t;
}
