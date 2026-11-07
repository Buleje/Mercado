/**
 * Planillas de campo (17-10, Brandon: «formatos para cubicar… y en el mismo lugar el
 * prompt, para que trabajen juntos»). Una planilla = la hoja que se imprime y se llena
 * a mano en el monte, el patio o el aserradero + el prompt con el que la IA la lee de
 * una foto + el cubicador o importador al que van sus filas. Las tres cosas viven en la
 * MISMA definición: si cambia una columna, cambian la hoja y el prompt juntos.
 *
 * Sin `server-only`: la pantalla imprime y muestra el prompt con estas definiciones.
 */

export type PlanillaId =
  | "aserrada-pt"
  | "rolliza-smalian"
  | "rolliza-oxapampa"
  | "conteo-patio"
  | "parte-produccion"
  | "censo-arboles";

/** A dónde van las filas leídas: siempre un importador que YA existe (con su vista previa). */
export type DestinoPlanilla =
  | "cubicador-madera" // CubicadorMadera › ImportarCubicacionModal
  | "cubicador-trozas" // CubicadorTrozas › ImportarTrozasModal (Smalian u Oxapampina)
  | "conteo-patio" // conteo de patio del CTP
  /* CtpProduccionImportModal (pega la planilla: `interpretarProduccion`). OJO: NO es
     CtpImportarPartesModal — ese trae el DIRECTORIO (personas y empresas). */
  | "partes-produccion"
  | "censo-loth"; // LothCensoImportModal

export type TipoColumna = "texto" | "codigo" | "entero" | "decimal" | "fecha";

export interface ColumnaPlanilla {
  clave: string;
  titulo: string;
  /** «cm», «m», «pulg», «pies», «m³», «pt»… va impreso en la cabecera de la columna. */
  unidad?: string;
  tipo: TipoColumna;
  /** Ancho en la hoja impresa, en mm. */
  anchoMm: number;
  /** Un valor de ejemplo: se imprime en la fila de muestra y se le da a la IA. */
  ejemplo: string;
  obligatoria: boolean;
  /** Se calcula al importar (nunca se confía en lo que diga la foto): no se pide a mano. */
  calculada?: boolean;
}

export interface CampoCabecera {
  clave: string;
  titulo: string;
  ejemplo: string;
}

export interface PlanillaCampo {
  id: PlanillaId;
  nombre: string;
  /** Dónde se llena. */
  para: "bosque" | "patio" | "aserradero";
  descripcion: string;
  /** La fórmula legible que se imprime al pie (p. ej. «pt = Dp² × L / 24,5»). */
  metodo?: string;
  cabecera: CampoCabecera[];
  columnas: ColumnaPlanilla[];
  filasPorHoja: number;
  orientacion: "vertical" | "horizontal";
  destino: DestinoPlanilla;
  /** Prompt de fábrica. El negocio puede guardar el suyo (`PromptGuardado`). */
  prompt: string;
  /** Sube cuando cambia el prompt de fábrica: un prompt guardado viejo se avisa. */
  versionPrompt: number;
}

/** El prompt propio de un negocio para una planilla (KV por tenant). */
export interface PromptGuardado {
  planillaId: PlanillaId;
  texto: string;
  /** La `versionPrompt` de fábrica sobre la que se escribió. */
  basadoEnVersion: number;
  actualizadoPor: string;
  actualizadoEn: string;
}

export interface FilaLeida {
  valores: Record<string, string | number | null>;
  /** Claves de columna que la IA no leyó con seguridad: se resaltan en la vista previa. */
  dudosas: string[];
}

export interface LecturaPlanilla {
  planillaId: PlanillaId;
  cabecera: Record<string, string | null>;
  filas: FilaLeida[];
  advertencia?: string;
  /** Qué prompt se usó: fábrica o el del negocio (y su versión). */
  prompt: { origen: "fabrica" | "negocio"; version: number };
}
