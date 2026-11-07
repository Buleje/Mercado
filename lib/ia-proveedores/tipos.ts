/**
 * Buleje IA (ADR-528) — tipos compartidos entre el motor (`lib/asistente`), las
 * rutas de la app (`app/api/admin/ia/**`), el servidor MCP (`app/api/mcp`) y las
 * pantallas (`components/admin/buleje-ia/**`).
 *
 * Contrato escrito ANTES de construir (01-11-2026): cada carril lo respeta tal
 * cual; un campo nuevo se agrega acá y se avisa, nunca se redefine en otro lado.
 * Sin `server-only`: lo importan también las pantallas.
 */

/** Ids del catálogo de proveedores (`catalogo.ts`). TEXT en la base, no enum. */
export const PROVEEDORES_IA = [
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "qwen",
  "kimi",
  "glm",
  "minimax",
  "groq",
  "xai",
  "openrouter",
  "personalizado",
] as const;
export type ProveedorIaId = (typeof PROVEEDORES_IA)[number];

/** Cómo se le habla: casi todos copian la API de OpenAI; Claude tiene la suya. */
export type ProtocoloIa = "openai" | "anthropic";

/** Resultado de probar una clave o de la última llamada. */
export type EstadoProveedorIa =
  | "ok"
  | "clave_invalida"
  | "sin_credito"
  | "modelo_no_disponible"
  | "limite_ia"
  | "sin_conexion"
  | "sin_permiso"
  | "error";

export interface ModeloSugerido {
  id: string;
  nombre: string;
  /** Lee fotos (recibos, guías, boletas). */
  vision: boolean;
  /** Una línea en el idioma de Brandon: «barato y rápido», «el más listo». */
  nota?: string;
}

/** Una tarjeta del catálogo (lo que se ve antes de pegar la clave). */
export interface ProveedorCatalogo {
  id: ProveedorIaId;
  /** Lo que la gente conoce: «ChatGPT», «Claude», «Gemini», «DeepSeek». */
  nombre: string;
  /** La empresa: «OpenAI», «Anthropic», «Google», «Alibaba (Qwen)». */
  empresa: string;
  protocolo: ProtocoloIa;
  /** null solo en «personalizado» (lo escribe el dueño). */
  baseUrl: string | null;
  /** Dónde se saca la clave. */
  urlClave: string | null;
  modelosSugeridos: ModeloSugerido[];
  /** Una línea: «tiene plan gratis», «el más barato», «lee fotos». */
  ayuda: string;
  /** Tiene plan gratis para empezar. */
  gratis: boolean;
}

/** Un proveedor ya guardado por el negocio. La clave NUNCA viaja: solo `claveFinal`. */
export interface ProveedorConfigurado {
  id: string;
  proveedor: ProveedorIaId;
  nombre: string;
  modelo: string;
  modeloVision: string | null;
  baseUrl: string | null;
  claveFinal: string;
  principal: boolean;
  activo: boolean;
  ultimaPrueba: string | null;
  ultimoEstado: EstadoProveedorIa | null;
}

export interface ResultadoPrueba {
  ok: boolean;
  estado: EstadoProveedorIa;
  /** Frase para la persona: «La clave funciona: 42 modelos», «Esa clave no es válida». */
  mensaje: string;
  /** Modelos que el proveedor dice tener HOY (no la lista fija del catálogo). */
  modelos: Array<{ id: string; vision?: boolean }>;
  latenciaMs: number;
}

/** Qué modelo contestó un turno (se muestra chiquito bajo la respuesta). */
export interface ModeloUsado {
  proveedor: string;
  modelo: string;
  /** true = usó la IA de la plataforma porque el negocio no puso clave propia. */
  deLaPlataforma: boolean;
}

/** Una foto que viaja al modelo. Ya quedó guardada en Documentos. */
export interface ImagenTurno {
  documentoId: string;
  nombre: string;
  mime: string;
  /** Contenido en base64 (sin el prefijo `data:`). */
  base64: string;
}

export type TipoPapel = "cotizacion" | "liquidacion" | "comprobante" | "reporte" | "documento" | "agenda";

/**
 * Un papel que el asistente devuelve (PDF o enlace). Una herramienta lo
 * devuelve en `data.papel` (uno) o `data.papeles` (varios); `conversar()` los
 * junta en `RespuestaAsistente.papeles`.
 */
export interface PapelDevuelto {
  tipo: TipoPapel;
  titulo: string;
  /** Ruta relativa del panel (`/api/...`) que abre o baja el papel con la sesión. */
  url: string;
  documentoId?: string;
  /** Una línea: «3 ítems · S/ 1.250,00 · vence 08-11». */
  resumen?: string;
}

export const TIPOS_MEMORIA = ["alias", "dato", "preferencia", "persona", "vehiculo", "proveedor"] as const;
export type TipoMemoria = (typeof TIPOS_MEMORIA)[number];

export interface MemoriaItem {
  id: string;
  tipo: TipoMemoria;
  titulo: string;
  texto: string;
  entidadTipo: string | null;
  entidadId: string | null;
  fuente: string;
  creadoPor: string;
  usos: number;
  ultimoUso: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Operación esperando el «Sí» de la persona (misma forma que `conversar()`). */
export interface PendienteApp {
  id: string;
  resumen: string;
  tool: string;
}

/** Un mensaje como lo dibuja la app (y como se guarda en `AIMessage` + `extra`). */
export interface MensajeApp {
  id: string;
  rol: "user" | "assistant";
  texto: string;
  creadoEl: string;
  adjuntos?: Array<{ documentoId: string; nombre: string; url: string }>;
  pendientes?: PendienteApp[];
  registradas?: Array<{ resumen: string; pantalla?: string }>;
  papeles?: PapelDevuelto[];
  modelo?: ModeloUsado;
}

export interface ConversacionResumen {
  id: string;
  titulo: string;
  actualizadoEl: string;
  /** Las primeras ~80 letras del último mensaje. */
  ultimo: string;
}

export interface ConexionMcp {
  id: string;
  nombre: string;
  tokenPrefijo: string;
  usuario: string;
  rol: string;
  permiteEscribir: boolean;
  activo: boolean;
  ultimoUso: string | null;
  usos: number;
  createdAt: string;
}

/** Fotos por mensaje y peso máximo de cada una (se valida en la ruta Y en la pantalla). */
export const FOTOS_POR_MENSAJE = 4;
export const FOTO_MAX_BYTES = 8 * 1024 * 1024;
export const FOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
