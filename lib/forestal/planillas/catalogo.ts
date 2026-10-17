/**
 * Catálogo de las planillas de campo (17-10). Cada planilla junta la hoja que se
 * imprime, las columnas del Excel y el prompt con el que la IA lee su foto — y
 * las columnas salen de lo que YA aceptan sus importadores:
 *
 *   · aserrada-pt       → `cubicacion-import` (ImportarCubicacionModal) y la ruta
 *                         `cubicacion-ocr/aserrada` (`interpretarOcrPiezas`).
 *   · rolliza-smalian   → `cubicacion-trozas-import` (ImportarTrozasModal) y la
 *   · rolliza-oxapampa    ruta `cubicacion-ocr/trozas` (`interpretarOcrTrozas`).
 *   · parte-produccion  → `produccion-import` (CtpProduccionImportModal, se pega).
 *   · censo-arboles     → `loth-censo-import` (LothCensoImportModal).
 *   · conteo-patio      → el conteo de patio del CTP (`conteo-patio.ts`): se anota
 *                         código por código; no tiene importador de Excel.
 *
 * Lo `calculada` (pt, m³, volumen) se imprime para quien quiera sacarlo en el
 * monte, pero la IA NO lo lee y el Excel no lo trae: lo recalcula el importador
 * como hoy, nunca se confía en un número que «diga» la foto.
 *
 * El prompt se arma en DOS partes: lo que se le cuenta a la IA de la hoja (el
 * negocio puede reescribirlo) + el bloque «Qué devolver», que sale de las
 * columnas y no se edita (`bloqueDeSalida`). Así, si cambia una columna,
 * cambian la hoja, el Excel y el prompt juntos — también el del negocio.
 *
 * PURO y client-safe (la pantalla imprime y muestra el prompt con esto).
 */

import type { CampoCabecera, ColumnaPlanilla, PlanillaCampo, PlanillaId, PromptGuardado } from "./tipos";

/** Cómo devuelve la IA las filas: por la ruta OCR del cubicador (forma fija de siempre) o la genérica. */
export type SalidaPlanilla = "piezas" | "trozas" | "filas";

const SALIDA: Record<PlanillaId, SalidaPlanilla> = {
  "aserrada-pt": "piezas",
  "rolliza-smalian": "trozas",
  "rolliza-oxapampa": "trozas",
  "conteo-patio": "filas",
  "parte-produccion": "filas",
  "censo-arboles": "filas",
};

export const salidaDePlanilla = (id: PlanillaId): SalidaPlanilla => SALIDA[id];

/** Las que lee `POST /api/admin/forestal/planillas/leer`; las otras van por su ruta `cubicacion-ocr/*`. */
export const PLANILLAS_LECTURA_GENERICA: readonly PlanillaId[] = ["conteo-patio", "parte-produccion", "censo-arboles"];

const UNIDAD_LARGA: Record<string, string> = {
  pulg: "pulgadas",
  pies: "pies",
  cm: "centímetros",
  m: "metros",
  "m³": "metros cúbicos",
  pt: "pies tablares",
  pzas: "piezas",
  "m UTM": "metros (coordenada UTM)",
};

/**
 * Lo que la IA tiene que saber de cada columna además de su título y unidad.
 * Vive acá (no en la columna) porque es del prompt, no de la hoja.
 */
const COMO_LEER: Partial<Record<PlanillaId, Record<string, string>>> = {
  "aserrada-pt": {
    especie: "Si el renglón no la trae, usa la de la cabecera «Especie»; una comilla o «idem» repite la de arriba; si no hay, vacío.",
    cantidad: "Piezas iguales de ese renglón. Si no está escrita, 1.",
    espesor: "Si el renglón dice cm, conviértelo tú a pulgadas (÷ 2,54).",
    ancho: "Si el renglón dice cm, conviértelo tú a pulgadas (÷ 2,54).",
    largo: "Si el renglón dice metros, conviértelo tú a pies (÷ 0,3048).",
  },
  "rolliza-smalian": {
    especie: "Si el renglón no la trae, usa la de la cabecera «Especie»; una comilla o «idem» repite la de arriba; si no hay, vacío.",
    d1: "El diámetro MENOR.",
    d2: "El diámetro MAYOR. Si sólo hay un diámetro anotado, repítelo en d1 y d2.",
    largo: "Si el renglón dice pies, conviértelo tú a metros (× 0,3048).",
  },
  "rolliza-oxapampa": {
    especie: "Si el renglón no la trae, usa la de la cabecera «Especie»; una comilla o «idem» repite la de arriba; si no hay, vacío.",
    d1: "Una punta, en pulgadas (20, 22½ = 22.5). Si dice cm, conviértelo tú (÷ 2,54).",
    d2: "La otra punta. Si sólo hay una anotada, repítela en d1 y d2 y marca incierto: true (el pago pide las dos puntas).",
    largo: "En PIES (10, 12, 14…). Si dice metros, conviértelo tú (÷ 0,3048).",
  },
  "conteo-patio": {
    codigo: "Tal cual está escrito (letras, números, guiones). No lo completes ni lo corrijas.",
    especie: "Una comilla o «idem» repite la de arriba.",
  },
  "parte-produccion": {
    producto: "Como está escrito (Tabla, Cuartón, Listón…).",
    especie: "Si el renglón no la trae, vacío (se usa la de la cabecera al importar).",
    cantidad: "Número con punto decimal (2.35), sin la unidad.",
    unidad: "m3, pt, unidad o kg — la que esté escrita; si no hay, vacío.",
    linea: "LP (principal) o LRE (recuperación), como esté escrita; si no hay, vacío.",
    codigo: "El código del paquete, tal cual.",
  },
  "censo-arboles": {
    codigo: "El código del árbol tal cual (A-001, 15, P3-022…). Nunca dos renglones con el mismo código: si se repite, márcalo dudoso.",
    dap: "En centímetros. Si está en metros (0.85), conviértelo tú (× 100).",
    altura: "Altura comercial, en metros.",
    este: "Coordenada UTM Este, número entero de 6 cifras.",
    norte: "Coordenada UTM Norte, número entero de 7 cifras.",
  },
};

/** Marca que separa lo editable del bloque que arma el sistema. No la cambies: un prompt guardado la usa para cortarse. */
export const MARCA_SALIDA = "── Qué devolver (lo arma el sistema con las columnas de la hoja) ──";

const tipoLegible = (c: ColumnaPlanilla): string =>
  c.tipo === "entero" ? "número entero" : c.tipo === "decimal" ? "número" : c.tipo === "fecha" ? "fecha AAAA-MM-DD" : c.tipo === "codigo" ? "código" : "texto";

function lineaDeColumna(planillaId: PlanillaId, c: ColumnaPlanilla): string {
  const unidad = c.unidad ? `, en ${UNIDAD_LARGA[c.unidad] ?? c.unidad}` : "";
  const extra = COMO_LEER[planillaId]?.[c.clave];
  const opcional = c.obligatoria ? "" : " Puede estar vacía.";
  return `- ${c.clave}: «${c.titulo}» (${tipoLegible(c)}${unidad}).${opcional}${extra ? ` ${extra}` : ""}`;
}

/**
 * El bloque «Qué devolver»: las columnas con su clave, su unidad y cómo leerlas,
 * más las reglas que nunca cambian. Va al final de TODO prompt (el de fábrica y
 * el del negocio): el formato de la respuesta lo fija el sistema.
 */
export function bloqueDeSalida(p: Pick<PlanillaCampo, "id" | "columnas" | "cabecera" | "nombre">): string {
  const salida = SALIDA[p.id];
  const aMano = p.columnas.filter((c) => !c.calculada);
  const calculadas = p.columnas.filter((c) => c.calculada);
  const lineas: string[] = [MARCA_SALIDA];

  if (salida === "filas") {
    lineas.push(
      "Devuelve en «filas» un objeto por renglón con datos, de arriba hacia abajo, con estas claves:",
      ...aMano.map((c) => lineaDeColumna(p.id, c)),
      "Cada valor va como TEXTO, tal como se lee en la hoja (los números con punto decimal y sin la unidad). Celda vacía = \"\".",
      "- dudosas: la lista de claves de ESE renglón que no leíste con seguridad (no distingues un 3 de un 8, un 1 de un 7, letra borrosa). [] si todo se lee bien.",
      `Devuelve en «cabecera» lo escrito en los casilleros de arriba de la hoja: ${p.cabecera.map((c) => `${c.clave} («${c.titulo}»)`).join(", ")}. "" si el casillero está vacío. Las fechas, AAAA-MM-DD.`,
    );
  } else {
    lineas.push(
      `Devuelve en «${salida}» un objeto por renglón con datos, de arriba hacia abajo, con estas claves:`,
      ...aMano.map((c) => lineaDeColumna(p.id, c)),
      "- incierto: true si algún número de ESE renglón es ambiguo o dudoso (no distingues un 3 de un 8, un 1 de un 7, un 40 de un 46), false si se lee con confianza.",
    );
  }

  if (calculadas.length > 0) {
    lineas.push(
      `No leas ${calculadas.map((c) => `«${c.titulo}»`).join(" ni ")}: lo calcula el sistema, ignora lo que diga la foto aunque esté escrito.`,
    );
  }
  lineas.push(
    "La fila impresa en gris claro con «Ej.» es un ejemplo de la hoja: NO la devuelvas. Tampoco los renglones vacíos.",
    "Si hay tachones o correcciones, usa el valor final, no el tachado.",
    "Si hay renglones ilegibles, devuelve los que SÍ se leen, deja fuera los otros y dilo en «advertencia» (cuántos y en qué número de renglón). Nunca inventes un valor para lo que no se lee.",
    `Si la foto no es una planilla de este tipo (${p.nombre}), devuelve la lista vacía y en «advertencia» una frase corta de lo que ves en cambio. Si todo está bien, «advertencia» = "".`,
  );
  return lineas.join("\n");
}

/** Lo editable de un prompt (lo que va antes de la marca). */
export function parteEditable(texto: string): string {
  const i = texto.indexOf(MARCA_SALIDA);
  return (i === -1 ? texto : texto.slice(0, i)).trim();
}

/**
 * El prompt con que se lee: el del negocio si guardó uno (su parte editable +
 * el bloque de salida de HOY), si no el de fábrica.
 */
export function promptParaLeer(p: PlanillaCampo, guardado: PromptGuardado | null | undefined): string {
  const propio = guardado ? parteEditable(guardado.texto) : "";
  return propio ? `${propio}\n\n${bloqueDeSalida(p)}` : p.prompt;
}

/** Columnas que se llenan a mano (las que lee la IA y trae el Excel). */
export const columnasAMano = (p: Pick<PlanillaCampo, "columnas">): ColumnaPlanilla[] => p.columnas.filter((c) => !c.calculada);

/**
 * El título de cada columna EN EL EXCEL: el que reconoce el importador de su
 * destino tal cual (los de trozas llevan la unidad en el título porque así
 * distingue cm de pulgadas; el de aserrada no la acepta en el título).
 */
const ENCABEZADO_EXCEL: Partial<Record<PlanillaId, Record<string, string>>> = {
  "rolliza-smalian": { d1: "D1 (cm)", d2: "D2 (cm)", largo: "Largo (m)" },
  "rolliza-oxapampa": { d1: "D1 (pulg)", d2: "D2 (pulg)", largo: "Largo (pies)" },
  "parte-produccion": { linea: "Línea", codigo: "Código" },
  "censo-arboles": { codigo: "Cod", especie: "N. Comun", cientifico: "N. Cientifico", dap: "DAP (cm)", altura: "Altura (m)" },
};

export function encabezadosExcel(p: Pick<PlanillaCampo, "id" | "columnas">): string[] {
  const propios = ENCABEZADO_EXCEL[p.id] ?? {};
  return columnasAMano(p).map((c) => propios[c.clave] ?? c.titulo);
}

// ─── Las seis planillas ──────────────────────────────────────────────────

const FECHA: CampoCabecera = { clave: "fecha", titulo: "Fecha", ejemplo: "17/10/2026" };
const RESPONSABLE: CampoCabecera = { clave: "responsable", titulo: "Responsable", ejemplo: "Juan Pérez" };
const HOJA: CampoCabecera = { clave: "hoja", titulo: "Hoja N°", ejemplo: "1 de 2" };

const ESPECIE_COL: ColumnaPlanilla = { clave: "especie", titulo: "Especie", tipo: "texto", anchoMm: 38, ejemplo: "Tornillo", obligatoria: false };

type Base = Omit<PlanillaCampo, "prompt">;

/** Arma la planilla con su prompt de fábrica: lo que se cuenta de la hoja + el bloque de salida. */
function conPrompt(base: Base, intro: string): PlanillaCampo {
  return { ...base, prompt: `${intro}\n\n${bloqueDeSalida(base)}` };
}

const ASERRADA: PlanillaCampo = conPrompt(
  {
    id: "aserrada-pt",
    nombre: "Aserrada · pie tablar",
    para: "aserradero",
    descripcion: "Tablas, tablones y cuartones: cantidad × espesor × ancho × largo. Va al Cubicador de madera.",
    metodo: "pt = cantidad × espesor (pulg) × ancho (pulg) × largo (pies) ÷ 12",
    cabecera: [
      FECHA,
      { clave: "lugar", titulo: "Lugar / aserradero", ejemplo: "Patio Yarinacocha" },
      RESPONSABLE,
      { clave: "dueno", titulo: "Dueño / cliente", ejemplo: "Maderera El Aguajal" },
      { clave: "especie", titulo: "Especie (si es toda una)", ejemplo: "Tornillo" },
      { clave: "gtf", titulo: "GTF N°", ejemplo: "019-001-0000123" },
      HOJA,
    ],
    columnas: [
      ESPECIE_COL,
      { clave: "cantidad", titulo: "Cantidad", unidad: "pzas", tipo: "entero", anchoMm: 20, ejemplo: "5", obligatoria: true },
      { clave: "espesor", titulo: "Espesor", unidad: "pulg", tipo: "decimal", anchoMm: 22, ejemplo: "2", obligatoria: true },
      { clave: "ancho", titulo: "Ancho", unidad: "pulg", tipo: "decimal", anchoMm: 22, ejemplo: "8", obligatoria: true },
      { clave: "largo", titulo: "Largo", unidad: "pies", tipo: "decimal", anchoMm: 22, ejemplo: "10", obligatoria: true },
      { clave: "pt", titulo: "Pie tablar", unidad: "pt", tipo: "decimal", anchoMm: 28, ejemplo: "66.67", obligatoria: false, calculada: true },
    ],
    filasPorHoja: 25,
    orientacion: "vertical",
    destino: "cubicador-madera",
    versionPrompt: 1,
  },
  "Esta es una foto de la PLANILLA DE CUBICACIÓN DE MADERA ASERRADA (pie tablar), llenada a mano por un " +
    "operario forestal peruano. Al pie dice «Planilla Aserrada · pie tablar». Cada renglón es un grupo de piezas " +
    "iguales; las columnas, de izquierda a derecha: N° · Especie · Cantidad · Espesor (pulg) · Ancho (pulg) · " +
    "Largo (pies) · Pie tablar.\n\n" +
    "Convención peruana: el espesor y el ancho se anotan en PULGADAS y el largo en PIES. Las fracciones se " +
    "escriben como 1½, 1 1/2 o 1.5: devuélvelas en decimal (1.5). Si la foto no es esta planilla pero sí otra " +
    "lista de madera aserrada (tríos «espesor × ancho × largo», con o sin cantidad al inicio), léela con el " +
    "mismo criterio.",
);

const SMALIAN: PlanillaCampo = conPrompt(
  {
    id: "rolliza-smalian",
    nombre: "Rolliza · Smalian SERFOR",
    para: "patio",
    descripcion: "Trozas en el patio o el monte: dos diámetros en cm y el largo en m. Va al Cubicador de trozas (lote Smalian).",
    metodo: "Smalian SERFOR: m³ = 0,7854 × ((D1 + D2) ÷ 2 ÷ 100)² × largo (m)",
    cabecera: [
      FECHA,
      { clave: "lugar", titulo: "Lugar (patio / monte)", ejemplo: "Patio Yarinacocha" },
      RESPONSABLE,
      { clave: "dueno", titulo: "Dueño / proveedor", ejemplo: "Comunidad San Antonio" },
      { clave: "permiso", titulo: "Permiso / título habilitante", ejemplo: "PFM-UC-001-2026" },
      { clave: "gtf", titulo: "GTF N°", ejemplo: "019-001-0000123" },
      { clave: "especie", titulo: "Especie (si es toda una)", ejemplo: "Tornillo" },
      HOJA,
    ],
    columnas: [
      ESPECIE_COL,
      { clave: "d1", titulo: "D1 · Ø menor", unidad: "cm", tipo: "decimal", anchoMm: 26, ejemplo: "40", obligatoria: true },
      { clave: "d2", titulo: "D2 · Ø mayor", unidad: "cm", tipo: "decimal", anchoMm: 26, ejemplo: "45", obligatoria: false },
      { clave: "largo", titulo: "Largo", unidad: "m", tipo: "decimal", anchoMm: 22, ejemplo: "3.5", obligatoria: true },
      { clave: "m3", titulo: "Volumen", unidad: "m³", tipo: "decimal", anchoMm: 28, ejemplo: "0.4965", obligatoria: false, calculada: true },
    ],
    filasPorHoja: 25,
    orientacion: "vertical",
    destino: "cubicador-trozas",
    versionPrompt: 1,
  },
  "Esta es una foto de la PLANILLA DE CUBICACIÓN DE TROZAS por SMALIAN SERFOR (madera rolliza), llenada a mano " +
    "en el patio o el monte por un operario forestal peruano. Al pie dice «Planilla Rolliza · Smalian SERFOR». " +
    "Cada renglón es UNA troza; las columnas, de izquierda a derecha: N° · Especie · D1 Ø menor (cm) · " +
    "D2 Ø mayor (cm) · Largo (m) · Volumen.\n\n" +
    "Los diámetros van en CENTÍMETROS y el largo en METROS (3.5, 4, 2.8). Si la foto no es esta planilla pero sí " +
    "otra lista de trozas (tríos de números por línea), léela con el mismo criterio.",
);

const OXAPAMPA: PlanillaCampo = conPrompt(
  {
    id: "rolliza-oxapampa",
    nombre: "Rolliza · Oxapampina",
    para: "patio",
    descripcion: "Trozas con la fórmula del pago: las dos puntas en pulgadas y el largo en pies. Va al Cubicador de trozas (lote Oxapampina).",
    metodo: "pt = Dp² × largo (pies) ÷ 24,5  ·  Dp = (punta 1 + punta 2) ÷ 2, en pulgadas",
    cabecera: [
      FECHA,
      { clave: "lugar", titulo: "Lugar (patio / monte)", ejemplo: "Patio Yarinacocha" },
      RESPONSABLE,
      { clave: "dueno", titulo: "Dueño del bosque / proveedor", ejemplo: "Comunidad San Antonio" },
      { clave: "especie", titulo: "Especie (si es toda una)", ejemplo: "Tornillo" },
      { clave: "gtf", titulo: "GTF N°", ejemplo: "019-001-0000123" },
      HOJA,
    ],
    columnas: [
      ESPECIE_COL,
      { clave: "d1", titulo: "Punta 1", unidad: "pulg", tipo: "decimal", anchoMm: 24, ejemplo: "20", obligatoria: true },
      { clave: "d2", titulo: "Punta 2", unidad: "pulg", tipo: "decimal", anchoMm: 24, ejemplo: "22", obligatoria: true },
      { clave: "largo", titulo: "Largo", unidad: "pies", tipo: "decimal", anchoMm: 22, ejemplo: "10", obligatoria: true },
      { clave: "pt", titulo: "Pie tablar", unidad: "pt", tipo: "decimal", anchoMm: 28, ejemplo: "180", obligatoria: false, calculada: true },
    ],
    filasPorHoja: 25,
    orientacion: "vertical",
    destino: "cubicador-trozas",
    versionPrompt: 1,
  },
  "Esta es una foto de la PLANILLA DE CUBICACIÓN DE TROZAS con la fórmula OXAPAMPINA (pie tablar de la madera " +
    "en troza), llenada a mano en el patio o el monte por un operario forestal peruano. Al pie dice «Planilla " +
    "Rolliza · Oxapampina». Cada renglón es UNA troza; las columnas, de izquierda a derecha: N° · Especie · " +
    "Punta 1 (pulg) · Punta 2 (pulg) · Largo (pies) · Pie tablar.\n\n" +
    "Acá las puntas van en PULGADAS (18, 20, 22½) y el largo en PIES (8, 10, 12): NO son centímetros ni metros. " +
    "Las comillas (20\") son pulgadas y el apóstrofo (10') son pies.",
);

const CONTEO: PlanillaCampo = conPrompt(
  {
    id: "conteo-patio",
    nombre: "Conteo de patio",
    para: "patio",
    descripcion: "Recorrer el patio y anotar el código de cada troza que se ve. Se carga en el conteo de patio del Libro CTP.",
    cabecera: [
      FECHA,
      RESPONSABLE,
      { clave: "cancha", titulo: "Cancha / zona", ejemplo: "Cancha 2" },
      { clave: "horaInicio", titulo: "Hora inicio", ejemplo: "07:30" },
      { clave: "horaFin", titulo: "Hora fin", ejemplo: "09:10" },
      HOJA,
    ],
    columnas: [
      { clave: "codigo", titulo: "Código de la troza", tipo: "codigo", anchoMm: 46, ejemplo: "T-0231", obligatoria: true },
      { ...ESPECIE_COL, anchoMm: 38 },
      { clave: "cancha", titulo: "Cancha", tipo: "texto", anchoMm: 24, ejemplo: "C2", obligatoria: false },
      { clave: "observacion", titulo: "Observación", tipo: "texto", anchoMm: 70, ejemplo: "Rajada en la punta", obligatoria: false },
    ],
    filasPorHoja: 30,
    orientacion: "vertical",
    destino: "conteo-patio",
    versionPrompt: 1,
  },
  "Esta es una foto de la PLANILLA DE CONTEO DE PATIO de un aserradero peruano: alguien recorrió el patio y " +
    "anotó a mano el código (placa) de cada troza que vio. Al pie dice «Planilla Conteo de patio». Cada renglón " +
    "es UNA troza; las columnas, de izquierda a derecha: N° · Código de la troza · Especie · Cancha · Observación.\n\n" +
    "Lo que importa es el CÓDIGO: cópialo exactamente como está escrito, aunque parezca incompleto o raro — se " +
    "compara con las trozas del sistema, y un código «arreglado» encuentra la troza equivocada.",
);

const PARTE: PlanillaCampo = conPrompt(
  {
    id: "parte-produccion",
    nombre: "Parte de producción",
    para: "aserradero",
    descripcion: "Lo que salió de la sierra en un turno, paquete por paquete. Se pega en Producción › Importar del Libro CTP.",
    cabecera: [
      { clave: "fecha", titulo: "Fecha del turno", ejemplo: "17/10/2026" },
      { clave: "turno", titulo: "Turno", ejemplo: "Mañana" },
      { clave: "responsable", titulo: "Jefe de sierra", ejemplo: "Juan Pérez" },
      { clave: "especie", titulo: "Especie del turno", ejemplo: "Tornillo" },
      { clave: "lote", titulo: "Lote de aserrío", ejemplo: "LA-2026-014" },
      HOJA,
    ],
    columnas: [
      { clave: "producto", titulo: "Producto", tipo: "texto", anchoMm: 42, ejemplo: "Tabla", obligatoria: true },
      { clave: "presentacion", titulo: "Presentación", tipo: "texto", anchoMm: 28, ejemplo: "Piezas", obligatoria: false },
      { ...ESPECIE_COL, anchoMm: 32 },
      { clave: "cantidad", titulo: "Cantidad", tipo: "decimal", anchoMm: 22, ejemplo: "2.35", obligatoria: true },
      { clave: "unidad", titulo: "Unidad", tipo: "texto", anchoMm: 18, ejemplo: "m3", obligatoria: false },
      { clave: "linea", titulo: "Línea", tipo: "texto", anchoMm: 16, ejemplo: "LP", obligatoria: false },
      { clave: "codigo", titulo: "Código del paquete", tipo: "codigo", anchoMm: 32, ejemplo: "T-0412", obligatoria: false },
      { clave: "observaciones", titulo: "Observaciones", tipo: "texto", anchoMm: 60, ejemplo: "Con nudos", obligatoria: false },
    ],
    filasPorHoja: 16,
    orientacion: "horizontal",
    destino: "partes-produccion",
    versionPrompt: 1,
  },
  "Esta es una foto del PARTE DE PRODUCCIÓN de un aserradero peruano, llenado a mano por el jefe de sierra: lo " +
    "que salió en un turno, un paquete o lote de piezas por renglón. Al pie dice «Planilla Parte de producción». " +
    "Las columnas, de izquierda a derecha: N° · Producto · Presentación · Especie · Cantidad · Unidad · Línea · " +
    "Código del paquete · Observaciones.\n\n" +
    "La cantidad es lo producido en la unidad de su columna (m3 o pt): no la conviertas. La línea es LP " +
    "(principal) o LRE (recuperación).",
);

const CENSO: PlanillaCampo = conPrompt(
  {
    id: "censo-arboles",
    nombre: "Censo de árboles",
    para: "bosque",
    descripcion: "Árbol por árbol en la parcela de corta: código, especie, DAP, altura y coordenadas. Va al censo del Libro TH.",
    metodo: "Volumen = 0,7854 × DAP (m)² × altura comercial (m) × 0,65 (factor de forma)",
    cabecera: [
      FECHA,
      { clave: "responsable", titulo: "Brigada / responsable", ejemplo: "Brigada 1 · Juan Pérez" },
      { clave: "permiso", titulo: "Permiso / título habilitante", ejemplo: "PFM-UC-001-2026" },
      { clave: "parcela", titulo: "Parcela de corta", ejemplo: "PC-03" },
      { clave: "zonaUtm", titulo: "Zona UTM", ejemplo: "18" },
      HOJA,
    ],
    columnas: [
      { clave: "codigo", titulo: "Cod", tipo: "codigo", anchoMm: 22, ejemplo: "A-001", obligatoria: true },
      { clave: "especie", titulo: "N. Común", tipo: "texto", anchoMm: 34, ejemplo: "Shihuahuaco", obligatoria: true },
      { clave: "cientifico", titulo: "N. Científico", tipo: "texto", anchoMm: 40, ejemplo: "Dipteryx micrantha", obligatoria: false },
      { clave: "dap", titulo: "DAP", unidad: "cm", tipo: "decimal", anchoMm: 18, ejemplo: "85", obligatoria: true },
      { clave: "altura", titulo: "Altura comercial", unidad: "m", tipo: "decimal", anchoMm: 22, ejemplo: "18", obligatoria: true },
      { clave: "este", titulo: "Este", unidad: "m UTM", tipo: "entero", anchoMm: 24, ejemplo: "512345", obligatoria: true },
      { clave: "norte", titulo: "Norte", unidad: "m UTM", tipo: "entero", anchoMm: 26, ejemplo: "8956789", obligatoria: true },
      { clave: "condicion", titulo: "Condición", tipo: "texto", anchoMm: 26, ejemplo: "Aprovechable", obligatoria: false },
      { clave: "observaciones", titulo: "Observaciones", tipo: "texto", anchoMm: 38, ejemplo: "Fuste recto", obligatoria: false },
      { clave: "vol", titulo: "Volumen", unidad: "m³", tipo: "decimal", anchoMm: 20, ejemplo: "6.6392", obligatoria: false, calculada: true },
    ],
    filasPorHoja: 16,
    orientacion: "horizontal",
    destino: "censo-loth",
    versionPrompt: 1,
  },
  "Esta es una foto de la PLANILLA DE CENSO DE ÁRBOLES de un permiso forestal peruano, llenada a mano por la " +
    "brigada en el bosque. Al pie dice «Planilla Censo de árboles». Cada renglón es UN árbol; las columnas, de " +
    "izquierda a derecha: N° · Cod · N. Común · N. Científico · DAP (cm) · Altura comercial (m) · Este · Norte · " +
    "Condición · Observaciones · Volumen.\n\n" +
    "El DAP va en CENTÍMETROS y la altura en METROS. Este y Norte son coordenadas UTM en metros (6 y 7 cifras): " +
    "si una cifra no se lee, márcala dudosa en vez de completarla — un árbol mal ubicado no se encuentra en el " +
    "monte. La condición suele ser Aprovechable, Semillero, Remanente o similar: cópiala como está.",
);

export const PLANILLAS: readonly PlanillaCampo[] = [ASERRADA, SMALIAN, OXAPAMPA, CONTEO, PARTE, CENSO];

export const PLANILLA_IDS = PLANILLAS.map((p) => p.id) as readonly PlanillaId[];

export const esPlanillaId = (v: unknown): v is PlanillaId => typeof v === "string" && (PLANILLA_IDS as readonly string[]).includes(v);

export function planillaPorId(id: string): PlanillaCampo | null {
  return PLANILLAS.find((p) => p.id === id) ?? null;
}

// ─── Prompts genéricos de las rutas OCR (sin planilla) ───────────────────

/**
 * Lo que leen las rutas `cubicacion-ocr/*` cuando la foto NO es una planilla
 * del catálogo (el cuaderno de siempre). Viven acá para que haya una sola
 * fuente de prompts; la forma de la respuesta es la de siempre.
 */
export const PROMPT_GENERICO_ASERRADA =
  "Esta es una foto de una PLANILLA DE CUBICACIÓN DE MADERA ASERRADA (tablas/tablones) escrita a mano " +
  "por un operario forestal peruano. Suele traer columnas para cantidad de piezas, espesor, ancho y largo, " +
  "y a veces la especie — o aparecer como tríos \"espesor × ancho × largo\" por línea, con o sin cantidad " +
  "al inicio. Puede tener tachones o correcciones: usá el valor final, no el tachado.\n\n" +
  "Convención peruana: el espesor y el ancho se anotan en PULGADAS, el largo en PIES. Si una fila trae " +
  "explícitamente otra unidad (cm, metros), convertila vos a pulgadas/pies antes de responder — el número " +
  "que devuelvas siempre tiene que quedar en esas unidades.\n\n" +
  "Para CADA fila/línea que puedas identificar, devuelve:\n" +
  "- cantidad: cuántas piezas iguales representa esa línea. Si no está escrita, 1.\n" +
  "- espesor: en pulgadas (número).\n" +
  "- ancho: en pulgadas (número).\n" +
  "- largo: en pies (número).\n" +
  "- especie: si está escrita en esa fila o en un encabezado que aplica a todo el bloque; si no hay, dejalo vacío.\n" +
  "- incierto: true si algún número de ESA fila es ambiguo o dudoso, false si se lee con confianza.\n\n" +
  "Si la foto no parece una planilla de cubicación de madera aserrada, devuelve piezas: [] y advertencia con " +
  "una frase corta explicando qué ves en cambio. Si hay zonas ilegibles, devuelve las filas que SÍ se puedan " +
  "leer y deja esas fuera — nunca inventes un valor para lo que no se lee.";

export const PROMPT_GENERICO_TROZAS =
  "Esta es una foto de una PLANILLA DE CUBICACIÓN DE TROZAS (madera rolliza) escrita a mano por un " +
  "operario forestal peruano en el patio. Suele traer columnas para el diámetro menor (Ø1), el diámetro " +
  "mayor (Ø2) y el largo, y a veces la especie — o aparecer como tríos de números por línea. Puede tener " +
  "tachones o correcciones: usá el valor final, no el tachado.\n\n" +
  "Para CADA troza (fila o línea) que puedas identificar, devuelve:\n" +
  "- d1: diámetro MENOR en centímetros (número).\n" +
  "- d2: diámetro MAYOR en centímetros. Si sólo hay un diámetro anotado, repetilo en d1 y d2.\n" +
  "- largo: longitud en METROS (número).\n" +
  "- especie: si está escrita en esa fila o en un encabezado que aplica a todo el bloque; si no hay, dejalo vacío.\n" +
  "- incierto: true si algún número de ESA fila es ambiguo o dudoso (por ejemplo no distingues un 3 de un 8 " +
  "o un 40 de un 46), false si se lee con confianza.\n\n" +
  "Si la foto no parece una planilla de cubicación de trozas, devuelve trozas: [] y advertencia con una " +
  "frase corta explicando qué ves en cambio. Si hay zonas ilegibles, devuelve las filas que SÍ se puedan " +
  "leer y deja esas fuera — nunca inventes un valor para lo que no se lee.";
