/**
 * subvistas-modulos — las sub-vistas buscables de los módulos del panel.
 *
 * Existe para que el buscador global (`GlobalSearch`) pueda ofrecer los
 * destinos que viven DENTRO de un módulo —Saldos, Cumplimiento, Rentabilidad…—
 * sin importar el módulo entero, que es lazy y arrastraría medio panel al
 * chunk del buscador.
 *
 * Sólo datos: `key`, `label` y `hint`. Los iconos y el agrupado por fase viven
 * en la cabina de cada libro, que compone sobre esto.
 *
 * Aplica a los módulos cuya vista es direccionable por `?vista=` (los que usan
 * `useVistaModulo`): el resto no tendría a dónde navegar. Los que todavía
 * cambian de vista con estado local van en `VISTAS_LOCALES_POR_MODULO`.
 *
 * Desde el plan «panel unificado» (2026-10-09) también es el registro del
 * PERMISO por vista: cada una puede declarar su `origen` y
 * `lib/admin/permiso-vista.ts` decide con eso quién la ve.
 */
import type { Tab } from "@/app/admin/_lib/tabs.types";

export interface SubvistaModulo {
  key: string;
  label: string;
  /** Qué se hace ahí, en una línea. Alimenta las keywords del buscador. */
  hint: string;
  /**
   * Las pestañas donde este contenido se veía ANTES de mudarse acá (regla R2
   * del plan: el origen, nunca el destino). Plan, plantilla, rubro, rol y Modo
   * Fácil se evalúan sobre ellas y basta con que pase una. Sin declarar = el
   * propio módulo, que es lo de siempre.
   *
   * Sin esto, juntar pestañas le quita o le regala pantallas a un plan: Básico
   * desbloquea `activos` y `adelantos` pero `plata` es Pro.
   */
  origen?: readonly Tab[];
}

/**
 * Libro de Operaciones CTP (forestal) — 22 vistas (26 hasta la ola 2 del panel
 * unificado, 2026-10-10). GTF ingresadas, Reportes, Análisis y Rentabilidad no
 * se borraron: son pestañas internas (`?sub=`) de Ingresos y del Tablero
 * (`components/admin/forestal/ctp-vistas-fusionadas.ts`), y sus nombres viejos
 * siguen llegando por `VISTA_MIGRATION`.
 *
 * `origen` (regla R2) en las dos que recibieron contenido de otra pestaña: el
 * Rendimiento del aserradero vivía en Herramientas y los lotes con QR en
 * `forestal-lotes`. Cada pestaña interna se cuida sola (`usePermisoDe`).
 */
export const CTP_VISTAS: readonly SubvistaModulo[] = [
  { key: "ingresos", label: "Ingresos", hint: "Las guías que llegaron: por recepcionar (la bandeja) o recepcionadas (el archivo, antes «GTF ingresadas»)" },
  { key: "lotes", label: "Lotes de aserrío", hint: "Armar lo que va junto a la sierra: trozas de una especie apartadas en un lote" },
  { key: "consumos", label: "Consumos", hint: "Qué queda en el patio y qué entró a la sierra" },
  { key: "produccion", label: "Producción", hint: "Transformación" },
  { key: "disponibles", label: "Volumen disponible", hint: "Cuánta madera hay para trabajar: trozas, productos aserrados, lo que sobra en los lotes y lo por recepcionar, por separado o sumado" },
  { key: "despacho", label: "Despacho", hint: "Salida de producto y los lotes comerciales con su QR", origen: ["ctp-libro-operaciones", "forestal-lotes"] },
  { key: "trozas", label: "Trozas", hint: "Buscar una pieza por su codificación" },
  { key: "radar", label: "Radar", hint: "Cadena de custodia visual" },
  { key: "historia-lote", label: "Historia del lote", hint: "Todo lo que pasó con una pila: qué trozas se apartaron, qué corrida se las comió, qué salió y con qué guía se fue" },
  { key: "reprocesos", label: "Reprocesos", hint: "Qué producto volvió a la sierra, en qué se convirtió y cuánta merma dejó" },
  { key: "planta", label: "Planta", hint: "Mapa del aserradero" },
  { key: "eudr", label: "EUDR", hint: "Geolocalización + dossier UE" },
  { key: "guias", label: "Guías emitidas", hint: "Las GTF de salida del CTP y cuáles quedaron a medio llenar" },
  { key: "tablero", label: "Tablero", hint: "El libro en gráficos y sus lecturas: movimiento, producción (reportes), tendencias (análisis), margen (rentabilidad) y rendimiento del aserradero", origen: ["ctp-libro-operaciones", "forestal-herramientas"] },
  { key: "saldos", label: "Saldos", hint: "Lo que declaras y lo que puede salir" },
  { key: "resumenes", label: "Cuadros SERFOR", hint: "Los 3 cuadros resumen del formato oficial" },
  { key: "cumplimiento", label: "Cumplimiento", hint: "Alertas del período" },
  { key: "cierre", label: "Cierre", hint: "Cerrar mes · bloquear el acta" },
  { key: "fletes", label: "Fletes", hint: "Lo que cuesta traer la madera y a quién se le debe" },
  { key: "directorio", label: "Directorio", hint: "Proveedores, compradores, transportistas y placas" },
  { key: "contratos", label: "Contratos", hint: "El permiso bajo el que se trabaja y su balance: madera, gastos, fletes y adelantos" },
  { key: "ficha", label: "Ficha CTP", hint: "Identidad legal SERFOR" },
];

/**
 * El resto de los módulos con sub-vistas direccionables.
 *
 * Los ids TIENEN que coincidir con el `TABS` de cada módulo; lo garantiza
 * `__tests__/admin-subvistas-sincronizadas.test.ts`, que lee los componentes y
 * compara. Sin ese test esta tabla se desincroniza en silencio y el buscador
 * empieza a ofrecer destinos que ya no existen.
 *
 * ⚠️ La clave es el **id del tab**, no el `MODULE_ID` del componente. No siempre
 * coinciden: los ocho hubs (`documentos-hub`, `equipo-hub`…) NO son tabs — sólo
 * se llega a ellos por tabs alias (`?tab=tareas`, `?tab=contratos`), que el
 * buscador ya indexa como módulos de primer nivel. Declararlos acá con su
 * MODULE_ID no rompía nada, simplemente no se leía nunca. Lo cuida
 * `admin-subvistas-sincronizadas`.
 *
 * Los módulos ANIDADOS (Contratos dentro de Documentos, Cotizaciones dentro de
 * Comprobantes, la página de tienda dentro de Tienda online) van en
 * `ANIDADAS_POR_MODULO`: comparten
 * `?vista=` con su padre y necesitan las dos coordenadas.
 */
export const VISTAS_POR_MODULO: Readonly<Record<string, readonly SubvistaModulo[]>> = {
  // Ventas y caja (ola 3 del panel unificado, 2026-10-10): de 6 a 5 vistas.
  // «Cuadrar caja» (`arqueo`) es una sección de Caja (`?sub=cuadrar`) y Me deben
  // es la casa única de los fiados (Brandon, 2026-10-09): `?tab=fiados` y
  // `plata&vista=fiados` llegan acá, así que su origen los nombra (R2).
  "ventas-caja": [
    { key: "pos", label: "Vender", hint: "Punto de venta: buscar producto y cobrar", origen: ["ventas-caja"] },
    { key: "turnos", label: "Turnos", hint: "Abre y cierra el turno de caja de cada cajero", origen: ["ventas-caja", "turnos"] },
    { key: "caja-registradora", label: "Caja", hint: "El efectivo del día: abrir, ingresos, retiros, historial y cuadrar", origen: ["ventas-caja"] },
    { key: "cuentas-cobrar", label: "Me deben", hint: "Lo que quedó fiado: quién debe, cobrar y recordar", origen: ["ventas-caja", "plata", "fiados"] },
    { key: "comisiones", label: "Comisiones de vendedores", hint: "Lo que ganó cada vendedor", origen: ["ventas-caja"] },
  ],
  // Mi Plata (ola 3): dos niveles. Las claves son las HOJAS (la sección dentro de
  // la pestaña, o la pestaña si no se divide) de `finanzas/estructura.ts`, en su
  // orden. Los fiados se mudaron a Ventas y caja › Me deben (`plata:fiados` →
  // VISTA_MIGRATION). «presupuesto» sigue sin registrarse: vive DENTRO de Gastos
  // y `plata&vista=presupuesto` sigue siendo una dirección válida.
  // Activos y Adelantos nombran su pestaña vieja: el plan Básico las desbloquea
  // y `plata` es Pro. Sin eso, Básico perdía las dos al fundirlas (R2).
  // Y TODA hoja que ya estaba nombra también `activos`: hasta la ola 3 la barra
  // de Básico traía «Activos», que abría el hub ENTERO (FinanzasModule sin
  // filtro), así que Básico alcanzaba Resumen, Gastos o Préstamos por ahí
  // (`panel-sin-perdida`: 2.112 pares perdidos sin esto, medido 10-10). Cortar
  // ese acceso es una decisión de precio, no de orden: la toma Brandon.
  // Impuestos no lo nombra: venía de Comprobantes, que Básico no veía.
  plata: [
    { key: "resumen", label: "Resumen", hint: "Cómo viene la plata del mes", origen: ["plata", "activos"] },
    { key: "pl", label: "Ganancias y pérdidas", hint: "Estado de resultados", origen: ["plata", "activos"] },
    { key: "rentabilidad", label: "Rentabilidad", hint: "Margen por producto y categoría", origen: ["plata", "activos"] },
    { key: "comparador", label: "Comparar períodos", hint: "Este mes contra el anterior, y los reportes comparativos de Análisis", origen: ["plata", "analytics-pro", "activos"] },
    { key: "gastos", label: "Gastos y presupuesto", hint: "En qué se va la plata, cuánto planeaste gastar, los gastos fijos y el historial de compras", origen: ["plata", "compras", "activos"] },
    { key: "flujo-caja", label: "Proyección de caja", hint: "Flujo de caja de las próximas semanas", origen: ["plata", "activos"] },
    { key: "tesoreria", label: "Tesorería", hint: "Cuentas bancarias y saldos", origen: ["plata", "activos"] },
    { key: "por-cobrar", label: "Todo lo que me deben", hint: "Fiados, préstamos, adelantos y madera por cobrar, en una lista", origen: ["plata", "por-cobrar", "activos"] },
    { key: "por-pagar", label: "Lo que debo", hint: "Adelantos recibidos, proveedores y cuentas a favor de otro", origen: ["plata", "activos"] },
    { key: "scoring", label: "A quién fiarle", hint: "El scoring de cada cliente y quién te debe, con su riesgo", origen: ["plata", "scoring", "analytics-pro", "activos"] },
    { key: "prestamos", label: "Préstamos", hint: "Plata prestada, cuotas, cobros y la calculadora", origen: ["plata", "prestamos", "activos"] },
    { key: "adelantos", label: "Adelantos", hint: "Adelantos dados y recibidos, por persona, y su cobranza", origen: ["plata", "adelantos", "activos"] },
    { key: "activos", label: "Activos", hint: "Tu maquinaria: alquileres, gastos, alquileres por cobrar, calendario y ranking", origen: ["plata", "activos"] },
    { key: "impuestos", label: "Impuestos del mes", hint: "IGV y renta del mes, y las obligaciones y declaraciones", origen: ["facturacion", "documentos"] },
    { key: "reportes", label: "Reporte mensual", hint: "El resumen del mes para imprimir o mandar en PDF", origen: ["plata", "activos"] },
    { key: "contador", label: "Para el contador", hint: "Reportes de ventas, inventario y clientes para descargar", origen: ["plata", "activos"] },
    { key: "importar", label: "Importar y exportar", hint: "Subir o descargar tus datos en Excel o CSV", origen: ["plata", "activos"] },
    { key: "cierres", label: "Cierres", hint: "El historial de cierres de caja", origen: ["plata", "activos"] },
  ],
  // Compras (ola 3): de 9 a 7 vistas. Recepción es una sección de Órdenes y el
  // Comparador, una de Proveedores (`?sub=`); el historial de gastos se fue a
  // Mi Plata › Gastos y presupuesto. Dropship nombra SÓLO su pestaña vieja: es
  // de quien lo tiene encendido, no de todo el que ve Compras.
  compras: [
    { key: "punto-compra", label: "Comprar", hint: "Cargar una compra al proveedor: canasta, factura escaneada y orden", origen: ["compras"] },
    { key: "ordenes-compra", label: "Órdenes y recepción", hint: "Órdenes de compra emitidas y recibir la mercadería que llegó, con o sin orden", origen: ["compras"] },
    { key: "sugerencias", label: "Sugerencias", hint: "Qué reponer: el cálculo de Compras arriba; la predicción (con auto-reorden) y lo que se acaba esta semana, plegados", origen: ["compras", "forecasting", "sugerencias-ia"] },
    { key: "proveedores", label: "Proveedores", hint: "A quién le compras; comparar proveedores, precio por producto y precios del mercado", origen: ["compras"] },
    { key: "cuentas-por-pagar", label: "Por pagar", hint: "Lo que le debes a cada proveedor y cuándo vence", origen: ["compras", "documentos"] },
    { key: "devoluciones", label: "Devoluciones", hint: "Devolver al proveedor y reclamar la nota de crédito o la reposición", origen: ["compras"] },
    { key: "dropship", label: "Dropship", hint: "Envíos que el proveedor despacha directo al cliente cuando se paga un pedido", origen: ["dropship"] },
  ],
  // Productos e inventario (ola 3): absorbe Productos (`productos`: Categorías,
  // Precios, Ofertas y cupones) y el Conteo físico, que era un modal. Lo que
  // llegó de Productos nombra `productos` (Básico) y no `inventario` (Pro).
  inventario: [
    { key: "stock", label: "Productos y stock", hint: "Tus productos con lo que hay y cuánto queda; crear, editar, importar e imprimir etiquetas", origen: ["inventario"] },
    { key: "kardex", label: "Entradas y salidas", hint: "Cada movimiento de stock de cada producto", origen: ["inventario"] },
    { key: "lotes", label: "Vencimientos", hint: "Lotes y fechas de vencimiento", origen: ["inventario"] },
    { key: "mermas", label: "Pérdidas", hint: "Lo que se perdió, rompió o venció", origen: ["inventario"] },
    { key: "conteo", label: "Conteo físico", hint: "Contar lo que hay en el anaquel y conciliarlo con el sistema; asistente, manual o con escáner, y la declaración jurada", origen: ["inventario"] },
    { key: "categorias", label: "Categorías", hint: "Las categorías de tus productos y su orden en la tienda", origen: ["productos"] },
    { key: "precios", label: "Precios", hint: "Historial de los cambios de precio de cada producto", origen: ["productos"] },
    { key: "ofertas", label: "Ofertas y cupones", hint: "Descuentos de tu tienda y cupones que valen en tu tienda o en el marketplace", origen: ["productos", "marketplace"] },
  ],
  // Comprobantes (ola 3): `facturacion` deja de ser alias del hub de Documentos
  // y es su propio hub. Cada vista nombra la pestaña suelta que la abría y
  // `documentos`, que era el hub donde se veían las cuatro.
  facturacion: [
    { key: "facturas", label: "Facturas y boletas", hint: "Boletas, facturas y notas electrónicas emitidas, con su estado en SUNAT; emitir y exportar", origen: ["facturacion", "documentos"] },
    { key: "notas", label: "Notas de crédito", hint: "Anular o corregir una boleta o factura: devoluciones, descuentos y errores", origen: ["notas-credito", "documentos"] },
    { key: "guias", label: "Guías de remisión", hint: "Los papeles del traslado de mercadería: transportista, vehículo, punto de partida y llegada", origen: ["guias-remision", "documentos"] },
    { key: "cotizaciones", label: "Cotizaciones", hint: "Presupuestos para tus clientes que, aceptados, se convierten en pedido", origen: ["cotizaciones", "documentos"] },
  ],
  // Documentos (ola 3): el Archivo (drive) y Contratos. Lo comercial se fue a
  // Comprobantes y queda como alias (`documentos:cotizaciones` → VISTA_MIGRATION).
  documentos: [
    // `contratos` también: `?tab=contratos` abría el hub de Documentos ENTERO,
    // con el drive (R2). Sin eso, en un negocio de rubro «bodega» (Blas) el
    // filtro vertical esconde `documentos` —no está en `modules.enabled` de
    // ningún rubro— y el hub, filtrado, mostraba sólo Contratos: el Archivo
    // desaparecía (Blas: Enterprise, rubro bodega y plantilla propia, 10-10).
    { key: "drive", label: "Archivo", hint: "Tus documentos en carpetas, con su vencimiento: contratos, licencias, facturas, fotos y planillas", origen: ["documentos", "contratos"] },
    { key: "contratos", label: "Contratos", hint: "Contratos con plantillas peruanas, su firma y su vencimiento", origen: ["contratos", "documentos"] },
  ],
  clientes: [
    { key: "crm", label: "Mis clientes", hint: "Ficha de cada cliente" },
    { key: "leads", label: "Leads", hint: "Interesados que todavía no compran" },
    { key: "resenas", label: "Opiniones", hint: "Qué dicen los clientes" },
    { key: "segmentos", label: "Segmentos", hint: "Agrupar clientes por comportamiento" },
    { key: "mapa", label: "Mapa", hint: "Dónde viven los clientes" },
    { key: "mensajes", label: "Mensajes masivos", hint: "Conversaciones con clientes" },
  ],
  // Configuración (ola 2 del panel unificado, 2026-10-10): absorbe Plan
  // (`plan`) y Sistema (`rendimiento`, `auditoria`, `colas`). Las secciones de
  // Sistema van en ANIDADAS_POR_MODULO.config; cada bloque movido se cuida
  // adentro con `<PermisoDe origen>`.
  config: [
    { key: "negocio", label: "Datos del negocio", hint: "Nombre, RUC, WhatsApp, dirección, horario, logo, portada y redes" },
    { key: "cobros", label: "Cobros y comprobantes", hint: "Efectivo, Yape, Plin, transferencia, alerta de caja, hora de cierre, RUC emisor, IGV y conexión con SUNAT" },
    { key: "delivery", label: "Delivery", hint: "Zonas con tarifa y tiempo, y desde cuánto el envío es gratis" },
    { key: "tienda", label: "Tienda web", hint: "Colores, slogan, modo vacaciones y las secciones y menú de la tienda" },
    { key: "plan", label: "Plan", hint: "Tu plan, el uso del mes, funcionalidades, dominio propio, portal de facturación y comparar planes (Stripe o Mercado Pago)", origen: ["config", "plan"] },
    { key: "equipo", label: "Usuarios y acceso", hint: "Usuarios y roles, tu perfil y contraseña, sesión activa y dispositivos" },
    { key: "panel", label: "Mi panel", hint: "Módulos, orden de la barra lateral, accesos directos y pestaña por defecto" },
    { key: "sistema", label: "Sistema", hint: "Preferencias, velocidad de tu tienda, salud técnica, actividad (quién hizo qué) y colas de trabajo", origen: ["config", "rendimiento", "auditoria", "colas"] },
  ],
  // Tienda online (ola 2): una sola barra. Apariencia trae el 2.º nivel de la
  // vieja «Identidad y tema» (`store-customizer`) y Redes y medición, Canales.
  // Los dos orígenes de Redes a propósito: las visitas, GA4 y el Meta Pixel ya
  // los editaba Mi Tienda (Básico); lo demás de Canales va con <PermisoDe>.
  "pagina-inicio": [
    { key: "apariencia", label: "Apariencia", hint: "Logo, colores, tipografía, portada, contacto y ajustes finos de tu tienda", origen: ["pagina-inicio", "store-customizer"] },
    { key: "contenido", label: "Contenido", hint: "Secciones, banners y promociones del inicio; tu marca en el marketplace", origen: ["pagina-inicio"] },
    { key: "paginas", label: "Páginas", hint: "Crear, editar y publicar páginas propias (Ofertas, Nosotros…) armadas con bloques", origen: ["pagina-inicio"] },
    { key: "redes", label: "Redes y medición", hint: "Meta, TikTok y Google Analytics, y de dónde llegan las visitas de tu tienda", origen: ["canales", "pagina-inicio"] },
  ],
  recetas: [
    { key: "dashboard", label: "Resumen", hint: "Cómo viene la producción" },
    { key: "recetas", label: "Recetas", hint: "Insumos de cada producto elaborado" },
    { key: "produccion", label: "Producción", hint: "Producir según receta y descontar insumos" },
    { key: "recetario", label: "Recetario", hint: "El recetario impreso" },
  ],
  // ── Hubs que ya leían `?vista=` pero nadie había registrado (ola 1 del plan
  //    «panel unificado»): sin esto no los conocían ni el buscador, ni la
  //    medición por vista, ni el permiso por origen. La clave es el tab que
  //    los abre desde la barra; los tabs alias (`puntos`, `ai-command`,
  //    `forecasting`, `notas`…) abren el mismo hub parado en otra vista.
  "whatsapp-inbox": [
    { key: "whatsapp", label: "WhatsApp", hint: "Conversaciones del número del negocio y respuesta desde el panel" },
    { key: "chat", label: "Chat con clientes", hint: "Mensajes de los compradores del marketplace" },
    { key: "soporte", label: "Soporte", hint: "Bandeja de pedidos de ayuda de tus clientes" },
    { key: "avisos", label: "Avisos por pedido", hint: "Qué mensaje sale solo cuando un pedido cambia de estado" },
    { key: "plantillas", label: "Plantillas WhatsApp", hint: "Mensajes guardados para mandar con un toque" },
    { key: "bot", label: "Bot WhatsApp", hint: "Qué contesta solo el número del negocio" },
  ],
  campanas: [
    { key: "campanas", label: "Campañas", hint: "Mensajes y ofertas a un grupo de clientes" },
    { key: "segmentos", label: "Segmentos", hint: "Clientes agrupados por cómo compran" },
    { key: "puntos", label: "Puntos & Fidelización", hint: "Puntos por compra y premios para que el cliente vuelva" },
    { key: "rfm", label: "Análisis RFM", hint: "Quién compra seguido, hace poco y gasta más" },
    { key: "gift-cards", label: "Gift Cards", hint: "Vender y canjear tarjetas de regalo" },
    { key: "socio", label: "Socio Buleje", hint: "Programa de socios con beneficios" },
    { key: "subscriptions", label: "Bodega al Mes", hint: "Pedidos que se repiten cada mes" },
    { key: "lives", label: "En Vivo", hint: "Ventas en vivo por transmisión" },
  ],
  // `delivery-partners` ya no registra vistas (ola 2): Delivery vive en Pedidos
  // y reparto › Reparto (ANIDADAS_POR_MODULO.pedidos). Con las dos, el buscador
  // ofrecía cada sección dos veces y la de acá caía en el alias sin su `?sub=`.
  // Las etiquetas de Cámaras salen de un SegmentedControl con conteo
  // («Fotos (12)») y cambian con el ancho; acá va el nombre largo.
  camaras: [
    { key: "fotos", label: "Fotos", hint: "Lo que mandó la cámara del patio, con su hora" },
    { key: "patio", label: "Hoy en el patio", hint: "Lo que pasó hoy en el patio, hora por hora" },
    { key: "personas", label: "Personas", hint: "Las personas que vio la cámara" },
    { key: "camaras", label: "Cámaras", hint: "Las cámaras conectadas y su señal en vivo" },
  ],
  "asistente-ia": [
    { key: "chat", label: "Chat IA", hint: "Pregunta por tu negocio y anota hablando" },
    { key: "comandos", label: "Comandos IA", hint: "Leer un papel, cambiar precios en bloque y redactar mensajes" },
    { key: "sugerencias", label: "Sugerencias IA", hint: "Ideas para vender más, qué comprar y a quién ofrecerle" },
    { key: "automatizaciones", label: "Automatizaciones", hint: "Telegram, WhatsApp y tareas que corren solas" },
  ],
  "metas-logros": [
    { key: "metas", label: "Metas", hint: "Cuánto quieres vender y cuánto llevas" },
    { key: "hoy", label: "Hoy", hint: "Cuánto te falta hoy para la meta, a qué ritmo llegas y con cuánto cierras" },
    { key: "calendario", label: "Calendario", hint: "Cada día de la semana y del mes contra su meta" },
    { key: "logros", label: "Logros", hint: "Lo que ganaste, lo próximo por ganar y tus récords" },
  ],
  "analytics-pro": [
    { key: "analytics", label: "Analytics Pro", hint: "Ventas, productos y clientes en gráficos" },
    { key: "forecast", label: "Predicción Demanda", hint: "Cuánto se va a vender y qué reponer" },
    { key: "inteligencia", label: "Inteligencia", hint: "Indicadores propios, precios del mercado y comparativos" },
  ],
  // RRHH muestra según el nivel del negocio (marcar → gestión → completo):
  // con nivel «marcar» sólo existe Asistencia y una vista más alta cae ahí.
  rrhh: [
    { key: "asistencia", label: "Asistencia", hint: "Quién vino hoy y a qué hora marcó" },
    { key: "personal", label: "Personal", hint: "Los datos de cada persona del equipo" },
    { key: "ganado", label: "Lo ganado", hint: "Cuánto ganó cada uno según su asistencia" },
    { key: "contratos", label: "Contratos", hint: "Los contratos del personal y su vencimiento" },
    { key: "puestos", label: "Puestos", hint: "Los puestos del negocio y su sueldo" },
    // Ola 2: Tareas y Notas vivían en la pestaña `tareas` (hub Equipo, que ya
    // no registra vistas: el buscador las ofrecía dos veces). Las ve sólo quien
    // veía esa pestaña (R2). Notas nombra también `notas`: era su tab alias y la
    // vista adonde lleva un alias tiene que nombrarlo (admin-subvistas-sincronizadas).
    { key: "tareas", label: "Tareas", hint: "Lo que tiene que hacer el equipo y quién lo hace", origen: ["tareas"] },
    { key: "notas", label: "Notas", hint: "Apuntes rápidos del negocio", origen: ["tareas", "notas"] },
  ],
  // Pedidos y reparto (ola 2): gana `?vista=` y absorbe Delivery como Reparto.
  // Reparto es de quien veía Delivery (Enterprise/Max), no de quien ve Pedidos
  // (Básico, el cajero): sin el origen se le regalaba a todos.
  pedidos: [
    { key: "tablero", label: "Tablero", hint: "Los pedidos en marcha en columnas por estado: confirmar, preparar y despachar", origen: ["pedidos"] },
    { key: "lista", label: "Lista", hint: "Los mismos pedidos en marcha en una tabla, con los mismos filtros", origen: ["pedidos"] },
    { key: "reparto", label: "Reparto", hint: "Repartidores en vivo, tu equipo y quienes postulan, asignaciones, pagos a repartidores y ranking", origen: ["delivery-partners", "delivery-live"] },
    { key: "archivados", label: "Archivados", hint: "Los pedidos entregados y cancelados, con búsqueda por cliente y fechas", origen: ["pedidos"] },
  ],
  // Herramientas y trámites (ola 2): dos fases en una pestaña. Trámites
  // (`forestal-tramites`) se ve si su especialización está encendida, aunque
  // Herramientas no lo esté.
  "forestal-herramientas": [
    { key: "cubicador", label: "Cubicador de madera", hint: "Aserrada: pie tablar + m³ por voz", origen: ["forestal-herramientas"] },
    { key: "trozas", label: "Cubicador de trozas", hint: "Rolliza en patio: Smalian (m³, contra la GTF) u Oxapampina (PT)", origen: ["forestal-herramientas"] },
    { key: "resumenes", label: "Resúmenes", hint: "Tablas por especie y tipo del lote cubicado", origen: ["forestal-herramientas"] },
    { key: "especies", label: "Fotos de especies", hint: "Referencia visual para no confundir dos maderas parecidas", origen: ["forestal-herramientas"] },
    { key: "catalogo", label: "Formatos", hint: "Elige el trámite y llénalo", origen: ["forestal-tramites"] },
    { key: "expediente", label: "Expediente", hint: "Qué se presentó y en qué estado está", origen: ["forestal-tramites"] },
    { key: "plantaciones", label: "Plantaciones", hint: "Registro RNPF — inscripción y actualización", origen: ["forestal-tramites"] },
  ],
};

/**
 * Vistas que existen en pantalla pero el módulo todavía elige con estado local
 * (`useState`), no con `?vista=`. Van aparte A PROPÓSITO: el buscador global
 * lee `VISTAS_POR_MODULO`, y ofrecer `?tab=marketplace&vista=ordenes` llevaría
 * a «Resumen» sin decir nada. El permiso por vista y la matriz de visibilidad
 * sí las cuentan (`vistasDelModulo`). Cuando el módulo gane `?vista=` (Marketplace,
 * ola 4) se muda a `VISTAS_POR_MODULO`; lo cuida admin-subvistas-sincronizadas.
 */
export const VISTAS_LOCALES_POR_MODULO: Readonly<Record<string, readonly SubvistaModulo[]>> = {
  marketplace: [
    { key: "resumen", label: "Resumen", hint: "Cómo te va en el marketplace" },
    { key: "tienda", label: "Mi Tienda Personal", hint: "Cómo se ve tu tienda dentro del marketplace" },
    { key: "productos", label: "Productos", hint: "Qué productos tuyos están publicados" },
    { key: "ordenes", label: "Órdenes", hint: "Los pedidos que entraron por el marketplace" },
    { key: "comisiones", label: "Comisiones", hint: "Lo que cobra la plataforma por cada venta" },
    { key: "precios", label: "Precios", hint: "Tus precios al lado de los de otras tiendas" },
    { key: "cupones", label: "Cupones", hint: "Descuentos que valen en el marketplace" },
    { key: "resenas", label: "Reseñas", hint: "Lo que opinan los compradores del marketplace" },
    { key: "fidelidad", label: "Fidelidad", hint: "Premios para los compradores que vuelven" },
  ],
};

/**
 * Destinos de SEGUNDO nivel: viven dentro de un módulo que ya está dentro de un
 * hub, así que llegar a ellos necesita `?vista=` (la del hub) y `?sub=` (la del
 * módulo anidado) a la vez.
 *
 * Sin esto, buscar «plantillas de contrato» o «papelera» dejaba en la puerta del
 * hub y había que hacer dos clicks más adivinando dónde.
 */
export interface SubvistaAnidada extends SubvistaModulo {
  /** La vista del hub que hay que abrir para que el módulo exista en pantalla. */
  vista: string;
}

export const ANIDADAS_POR_MODULO: Readonly<Record<string, readonly SubvistaAnidada[]>> = {
  // Clave = id del TAB (`?tab=documentos` abre el hub de Documentos). Las
  // cotizaciones se mudaron a Comprobantes (ola 3, abajo en `facturacion`).
  documentos: [
    { vista: "contratos", key: "plantillas", label: "Plantillas de contrato", hint: "Modelos para generar contratos", origen: ["contratos", "documentos"] },
    { vista: "contratos", key: "contratos", label: "Mis Contratos", hint: "Contratos emitidos y su estado de firma", origen: ["contratos", "documentos"] },
    { vista: "contratos", key: "crear", label: "Crear Contrato", hint: "Redactar un contrato nuevo", origen: ["contratos", "documentos"] },
    // Modos del drive. No están todos: se declaran los que alguien buscaría por
    // nombre, no los catorce estados internos del componente.
    { vista: "drive", key: "favorites", label: "Documentos favoritos", hint: "Los archivos marcados" },
    { vista: "drive", key: "expiring", label: "Documentos por vencer", hint: "Lo que caduca pronto" },
    { vista: "drive", key: "trash", label: "Papelera de documentos", hint: "Archivos borrados, para restaurar" },
    { vista: "drive", key: "enlaces", label: "Enlaces compartidos", hint: "Links públicos activos y cómo cortarlos" },
    { vista: "drive", key: "duplicados", label: "Documentos duplicados", hint: "Archivos repetidos que ocupan lugar" },
    { vista: "drive", key: "sync", label: "Sincronización de carpeta", hint: "La carpeta de Windows espejada en el drive" },
    { vista: "drive", key: "activity", label: "Actividad del drive", hint: "Quién subió, movió o borró qué" },
  ],
  // ── Ola 3 del panel unificado (2026-10-10) ──
  // Comprobantes › Cotizaciones (venían de Documentos › Cotizaciones).
  facturacion: [
    { vista: "cotizaciones", key: "dashboard", label: "Resumen de cotizaciones", hint: "Cuántas cotizaste, cuántas se aceptaron y cuántas se convirtieron", origen: ["cotizaciones", "documentos"] },
    { vista: "cotizaciones", key: "lista", label: "Lista de cotizaciones", hint: "Presupuestos enviados", origen: ["cotizaciones", "documentos"] },
    { vista: "cotizaciones", key: "nueva", label: "Nueva cotización", hint: "Armar un presupuesto", origen: ["cotizaciones", "documentos"] },
  ],
  // Ventas y caja › Caja (con «Cuadrar caja», que era la vista `arqueo`) y
  // Ventas y caja › Me deben (las pestañas del módulo de fiados).
  "ventas-caja": [
    { vista: "caja-registradora", key: "hoy", label: "Caja de hoy", hint: "Abrir la caja, ingresos, retiros y lo que debería haber" },
    { vista: "caja-registradora", key: "historial", label: "Historial de cajas", hint: "Las cajas cerradas con su diferencia" },
    { vista: "caja-registradora", key: "auditoria", label: "Quién tocó la caja", hint: "Aperturas, cierres, ingresos y retiros con quién los hizo" },
    { vista: "caja-registradora", key: "reconciliacion", label: "Reconciliación de caja", hint: "Esperado contra real por día" },
    { vista: "caja-registradora", key: "cuadrar", label: "Cuadrar caja", hint: "Contar el efectivo y ver los cuadres de cada caja" },
    { vista: "cuentas-cobrar", key: "resumen", label: "Fiados: resumen", hint: "Quién te debe y cuánto, para cobrar en un toque", origen: ["ventas-caja", "plata", "fiados"] },
    { vista: "cuentas-cobrar", key: "deudores", label: "Deudores", hint: "La lista de fiados con saldo, días y filtros", origen: ["ventas-caja", "plata", "fiados"] },
    { vista: "cuentas-cobrar", key: "cobranza", label: "Cobranza de fiados", hint: "Por tramos de atraso, a quién recordarle hoy", origen: ["ventas-caja", "plata", "fiados"] },
    { vista: "cuentas-cobrar", key: "analisis", label: "Análisis de fiados", hint: "Morosidad, tendencia de cobro y proyección", origen: ["ventas-caja", "plata", "fiados"] },
  ],
  // Productos e inventario › Conteo físico (era un modal) y › Ofertas y cupones.
  inventario: [
    { vista: "conteo", key: "asistente", label: "Asistente de conteo", hint: "Paso a paso: eliges qué contar, cuentas y concilias", origen: ["inventario"] },
    { vista: "conteo", key: "manual", label: "Conteo manual", hint: "Escribes lo que contaste producto por producto", origen: ["inventario"] },
    { vista: "conteo", key: "escaner", label: "Conteo con escáner", hint: "Cuentas pasando el código de barras", origen: ["inventario"] },
    { vista: "ofertas", key: "ofertas", label: "Ofertas", hint: "Descuentos y promociones de tu tienda", origen: ["productos"] },
    { vista: "ofertas", key: "cupones", label: "Cupones", hint: "Códigos de descuento de tu tienda o del marketplace", origen: ["productos", "marketplace"] },
  ],
  // Compras › Órdenes y recepción y › Proveedores (Recepción y Comparador eran vistas).
  compras: [
    { vista: "ordenes-compra", key: "ordenes", label: "Órdenes de compra", hint: "Las órdenes emitidas a cada proveedor y su estado", origen: ["compras"] },
    { vista: "ordenes-compra", key: "recibir", label: "Recibir mercadería", hint: "Recibir lo que llegó, con o sin orden de compra: cantidades, estado y fotos", origen: ["compras"] },
    { vista: "proveedores", key: "lista", label: "Lista de proveedores", hint: "Tus proveedores, sus datos, pagos y la ficha de cada uno", origen: ["compras"] },
    { vista: "proveedores", key: "comparar", label: "Comparar proveedores", hint: "Puntaje de cada proveedor, cómo te entrega, precio por producto y precios del mercado", origen: ["compras"] },
  ],
  "pagina-inicio": [
    { vista: "apariencia", key: "identidad", label: "Identidad", hint: "Nombre, logo, lema y cómo sale en Google" },
    { vista: "apariencia", key: "colores", label: "Colores y tipografía", hint: "Colores de tu marca y su contraste" },
    { vista: "apariencia", key: "estilos", label: "Estilos", hint: "Botones, tarjetas, bordes y densidad" },
    { vista: "apariencia", key: "portada", label: "Portada", hint: "El banner grande de arriba: título, foto y botón" },
    { vista: "apariencia", key: "contacto", label: "Contacto", hint: "WhatsApp, horarios, secciones del inicio y productos visibles" },
    { vista: "apariencia", key: "avanzado", label: "Avanzado", hint: "Tipografía fina, favicon, CSS propio y cómo sales en Google" },
    { vista: "contenido", key: "sections", label: "Secciones", hint: "El orden de los bloques de la página" },
    { vista: "contenido", key: "branding", label: "Marca en el marketplace", hint: "Logo y banner de tu tienda en el directorio del marketplace" },
    { vista: "contenido", key: "banners", label: "Banners", hint: "Las imágenes grandes del inicio" },
    { vista: "contenido", key: "promotions", label: "Promociones del inicio", hint: "Qué ofertas se destacan" },
  ],
  // Configuración › Sistema (ola 2): lo que antes eran las pestañas
  // Rendimiento, Auditoría y Colas. La fuente de las secciones es
  // `components/admin/sistema/subvistas-sistema.ts`.
  config: [
    { vista: "sistema", key: "preferencias", label: "Preferencias", hint: "Lenguaje sencillo o profesional, tutorial de bienvenida y respaldo de tus datos", origen: ["config"] },
    { vista: "sistema", key: "velocidad", label: "Velocidad", hint: "Qué tan rápida se siente tu tienda: puntaje y qué mejorar", origen: ["rendimiento"] },
    { vista: "sistema", key: "historial", label: "Historial", hint: "La velocidad que midieron tus clientes, día por día", origen: ["rendimiento"] },
    { vista: "sistema", key: "salud", label: "Salud", hint: "Base de datos, servicios y errores recientes", origen: ["rendimiento"] },
    { vista: "sistema", key: "soporte", label: "Soporte", hint: "Ficha de tu dispositivo y del almacenamiento, para pedir ayuda", origen: ["rendimiento"] },
    { vista: "sistema", key: "actividad", label: "Actividad", hint: "Quién hizo qué y cuándo en tu negocio", origen: ["auditoria"] },
    { vista: "sistema", key: "colas", label: "Colas", hint: "Trabajos en segundo plano y crons que fallaron", origen: ["colas"] },
  ],
  // Pedidos y reparto › Reparto (ola 2): las secciones del Delivery de antes.
  // «Postulantes» no es pestaña (es Repartidores con su filtro) pero se busca
  // por su nombre.
  pedidos: [
    { vista: "reparto", key: "en-vivo", label: "Repartidores en vivo", hint: "Mapa con los repartidores en la calle y, plegadas, las rutas y paradas de hoy", origen: ["delivery-partners", "delivery-live"] },
    { vista: "reparto", key: "repartidores", label: "Repartidores", hint: "Tu equipo de reparto y sus datos", origen: ["delivery-partners"] },
    { vista: "reparto", key: "postulantes", label: "Postulantes a repartidor", hint: "Quienes postularon para repartir (antes Solicitudes)", origen: ["delivery-partners"] },
    { vista: "reparto", key: "asignaciones", label: "Asignaciones y permisos de repartidores", hint: "Qué pedido va con qué repartidor y qué puede hacer cada uno", origen: ["delivery-partners"] },
    { vista: "reparto", key: "pagos", label: "Pagos a repartidores", hint: "Lo que cobran los repartidores por sus entregas (antes Retiros)", origen: ["delivery-partners"] },
    { vista: "reparto", key: "ranking", label: "Ranking de repartidores", hint: "Quién entrega más y mejor", origen: ["delivery-partners"] },
  ],
  // Libros forestales (ola 2): las vistas que se fundieron son pestañas
  // internas. Se declaran con su nombre de antes para que buscar «GTF
  // ingresadas» o «Reportes» siga llevando adonde están.
  "ctp-libro-operaciones": [
    { vista: "ingresos", key: "recepcionadas", label: "GTF ingresadas", hint: "Las guías ya recepcionadas, con sus piezas disponibles para la sierra" },
    { vista: "tablero", key: "produccion", label: "Reportes de producción", hint: "La producción por semanas, mes o rango: PT por dueño de la madera, por permiso y por especie" },
    { vista: "tablero", key: "tendencias", label: "Análisis del libro", hint: "Reorden de materia prima y tendencias de 6 meses" },
    { vista: "tablero", key: "margen", label: "Rentabilidad del CTP", hint: "Margen: venta − costo de lo vendido" },
    { vista: "tablero", key: "rendimiento", label: "Rendimiento del aserradero", hint: "Por especie y por corrida, tu rango, la plata por PT y el simulador", origen: ["forestal-herramientas"] },
    { vista: "despacho", key: "lotes-qr", label: "Lotes comerciales y QR", hint: "Corridas agrupadas en un lote con código, grado, certificado y QR", origen: ["forestal-lotes"] },
  ],
  "loth-libro-operaciones": [
    { vista: "tablero", key: "kardex", label: "Kárdex del permiso", hint: "Cada movimiento de trozas con su saldo" },
    { vista: "tablero", key: "extraccion", label: "Extracción", hint: "Censo − tala, trozado y despacho por permiso" },
  ],
};

/**
 * Libro de Operaciones de Títulos Habilitantes (forestal) — 9 vistas (10 hasta
 * la ola 2 del panel unificado: Extracción es una pestaña interna del Control
 * del permiso). El orden sólo lo lee el buscador; la cabina arma el suyo.
 */
export const LOTH_VISTAS: readonly SubvistaModulo[] = [
  { key: "secciones", label: "Secciones", hint: "Las 6 secciones SERFOR" },
  { key: "gtf", label: "GTF", hint: "Guías de transporte forestal" },
  { key: "tablero", label: "Control del permiso", hint: "Por permiso: volumen que le queda, trozas en el patio y su antigüedad, kárdex y extracción (censo − tala, trozado y despacho)" },
  { key: "plan", label: "Plan de Manejo", hint: "Censo + especies autorizadas" },
  { key: "mapa", label: "Mapa", hint: "Dónde se taló cada árbol (GPS de campo)" },
  { key: "trazabilidad", label: "Por árbol", hint: "Operación completa de un árbol" },
  { key: "cumplimiento", label: "Cumplimiento", hint: "Veredicto de fiscalización + reporte imprimible" },
  { key: "cierre", label: "Cierre", hint: "Cerrar el mes → acta inmutable (OSINFOR)" },
  { key: "rentabilidad", label: "Rentabilidad y rendimiento", hint: "Margen por especie y por árbol, flujo bosque→producto, anomalías y valor" },
];

/**
 * Las vistas de una pestaña, vengan del registro que vengan: el de los hubs, el
 * de los que cambian con estado local o la cabina de un libro forestal.
 *
 * `Object.hasOwn`, no `mapa[tab]` a secas: con `?tab=constructor` devolvía la
 * función `Object` (lo cazó el carril de redirecciones en `destino-tab.ts`).
 */
export function vistasDelModulo(tab: string): readonly SubvistaModulo[] {
  if (tab === "ctp-libro-operaciones") return CTP_VISTAS;
  if (tab === "loth-libro-operaciones") return LOTH_VISTAS;
  if (Object.hasOwn(VISTAS_POR_MODULO, tab)) return VISTAS_POR_MODULO[tab];
  if (Object.hasOwn(VISTAS_LOCALES_POR_MODULO, tab)) return VISTAS_LOCALES_POR_MODULO[tab];
  return [];
}
