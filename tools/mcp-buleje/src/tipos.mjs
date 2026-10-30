// Tipos compartidos del MCP «buleje» (contrato .claude/autonomo/mcp-buleje/contrato.md §3.1, 29-10-2026).
// Solo JSDoc: el MCP es .mjs sin build. Los tres carriles importan de aquí; no cambiar sin avisar a los otros.

/** @typedef {"bodega" | "blas" | "qa-forestal" | string} Negocio  clave de ~/.config/buleje-mcp/credenciales.json */

/**
 * @typedef {Object} Pedido
 * @property {"GET"|"POST"|"PATCH"|"PUT"|"DELETE"} metodo
 * @property {string} ruta                      siempre empieza con /api/
 * @property {Record<string, string|number|boolean>} [query]
 * @property {unknown} [cuerpo]
 * @property {{ ruta: string, campo: string, sha256: string, bytes: number }} [archivo]   multipart (solo doc_subir):
 *   ruta real (realpath) + sello del archivo que se mostró en la ventana; el cliente lo vuelve a revisar al mandarlo
 * @property {boolean} [sinRecorte]   solo GET de una previa: la lista llega entera (buscar un nombre por id)
 */

/**
 * Lo que la ventana de OK muestra FUERA del cuadro de texto (29-10, hallazgo 4). Todo a una línea de ≤60.
 * @typedef {Object} ClaveOk
 * @property {string} etiqueta     «Monto», «A quién», «Producto»… (o «Código de esta operación»)
 * @property {string} valor        el dato real: es el texto del único botón que aprueba
 * @property {string[]} senuelos   2 parecidos (×10 y ÷10, u otro nombre de la misma lista): apretarlos = «no»
 * @property {string} palabra      «monto» | «nombre» | «código»…: «aprieta el botón con el <palabra> correcto»
 *
 * @typedef {Object} Ventana
 * @property {ClaveOk} clave
 * @property {{ etiqueta: string, valor: string }[]} filas   hasta 4 etiquetas fijas (a quién, desde qué caja…)
 */

/**
 * @typedef {"panel_apagado"|"compilando"|"sin_sesion"|"sin_permiso"|"no_existe"|"datos_invalidos"|"limite"
 *   |"ruta_no_permitida"|"token_vencido"|"token_usado"|"token_otro_negocio"|"resumen_distinto"
 *   |"no_confirmado"|"sin_respuesta"|"servidor"} ErrorMcp
 * no_confirmado = Brandon apretó «No» en la ventana de Windows · sin_respuesta = la ventana venció sin respuesta
 */

/**
 * @typedef {Object} Respuesta
 * @property {boolean} ok
 * @property {number} status
 * @property {unknown} [datos]
 * @property {{ codigo: ErrorMcp, mensaje: string, detalle?: unknown }} [error]
 * @property {number} ms
 * @property {boolean} [truncado]
 */

/** @typedef {"lectura" | "escritura" | "confirmar"} Tipo */

/**
 * Definición de una herramienta (carril C las escribe, carril B las registra en el servidor).
 * @template A
 * @typedef {Object} DefHerramienta
 * @property {string} nombre                     snake_case, en español (ej. "adelanto_dar")
 * @property {string} grupo                      "sistema"|"hoy"|"ventas"|"caja"|"pedidos"|"inventario"|"compras"|"clientes"|"adelantos"|"ctp"|"gtf"|"cubicacion"|"documentos"|"rrhh"|"tareas"|"loth"|"ingresos"|"lotes"|"directorio"
 * @property {Tipo} tipo
 * @property {string} descripcion                español, dice la unidad (S/, PT, m³) y qué devuelve
 * @property {import("zod").ZodRawShape} entrada SIEMPRE incluye negocio?: string
 * @property {(args: A, previa?: unknown) => Pedido | Pedido[]} pedido   puro, sin red; en «confirmar» recibe la previa
 * @property {(args: A, leer: (p: Pedido) => Promise<Respuesta>) => Promise<unknown>} [previa]  solo GET, para «antes → después»
 *   y para sacar del PANEL los nombres (persona, cliente, proveedor, producto) que muestra la ventana: nunca del modelo
 * @property {(args: A, previa: unknown) => string} [resumen]        OBLIGATORIO si tipo = "confirmar"; 1-3 líneas en español simple con montos y personas
 * @property {(args: A, previa: unknown) => { clave?: ClaveOk | null, filas?: { etiqueta: string, valor: string }[] }} [ventana]
 *   dato de los 3 botones y filas fijas; sin esto (o sin clave válida) la ventana usa un código de 3 cifras
 * @property {(args: A) => boolean} [confirmarSi]  «escritura» que pasa a pedir OK cuando devuelve true (ej. si toca el límite de crédito)
 * @property {(datos: unknown, args: A) => string} [formatear]
 * @property {("bodega"|"forestal")[]} [soloEn]   si la herramienta es solo de un rubro
 */

/**
 * @typedef {Object} Propuesta
 * @property {string} token        128 bits base32, un solo uso
 * @property {Negocio} negocio
 * @property {string} herramienta
 * @property {Pedido[]} pedidos
 * @property {string} resumen
 * @property {string} hashResumen  sha256(resumen)
 * @property {string} hashPedidos  sha256(JSON canónico de pedidos)
 * @property {Ventana} ventana
 * @property {string} hashVentana  sha256(JSON canónico de ventana): entra en la firma
 * @property {number} creada       epoch ms
 * @property {number} vence        creada + 120 000
 * @property {boolean} usada
 */

export {};
