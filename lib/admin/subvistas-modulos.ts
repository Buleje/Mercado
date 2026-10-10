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

/** Libro de Operaciones CTP (forestal) — 19 vistas. */
export const CTP_VISTAS: readonly SubvistaModulo[] = [
  { key: "ingresos", label: "Ingresos", hint: "Bandeja: las guías que llegaron y falta recepcionar" },
  { key: "gtf-ingresadas", label: "GTF ingresadas", hint: "Las guías ya recepcionadas, con sus piezas disponibles para la sierra" },
  { key: "lotes", label: "Lotes de aserrío", hint: "Armar lo que va junto a la sierra: trozas de una especie apartadas en un lote" },
  { key: "consumos", label: "Consumos", hint: "Qué queda en el patio y qué entró a la sierra" },
  { key: "produccion", label: "Producción", hint: "Transformación" },
  { key: "disponibles", label: "Volumen disponible", hint: "Cuánta madera hay para trabajar: trozas, productos aserrados, lo que sobra en los lotes y lo por recepcionar, por separado o sumado" },
  { key: "despacho", label: "Despacho", hint: "Salida de producto" },
  { key: "trozas", label: "Trozas", hint: "Buscar una pieza por su codificación" },
  { key: "radar", label: "Radar", hint: "Cadena de custodia visual" },
  { key: "historia-lote", label: "Historia del lote", hint: "Todo lo que pasó con una pila: qué trozas se apartaron, qué corrida se las comió, qué salió y con qué guía se fue" },
  { key: "reprocesos", label: "Reprocesos", hint: "Qué producto volvió a la sierra, en qué se convirtió y cuánta merma dejó" },
  { key: "planta", label: "Planta", hint: "Mapa del aserradero" },
  { key: "eudr", label: "EUDR", hint: "Geolocalización + dossier UE" },
  { key: "guias", label: "Guías emitidas", hint: "Las GTF de salida del CTP y cuáles quedaron a medio llenar" },
  { key: "tablero", label: "Tablero", hint: "Todo el movimiento del libro en gráficos: entradas, sierra, producción y despachos" },
  { key: "saldos", label: "Saldos", hint: "Lo que declaras y lo que puede salir" },
  { key: "resumenes", label: "Cuadros SERFOR", hint: "Los 3 cuadros resumen del formato oficial" },
  { key: "cumplimiento", label: "Cumplimiento", hint: "Alertas del período" },
  { key: "cierre", label: "Cierre", hint: "Cerrar mes · bloquear el acta" },
  { key: "reportes", label: "Reportes", hint: "La producción por semanas, mes o rango: gráficos de progreso, PT por dueño de la madera, por permiso y por especie" },
  { key: "rentabilidad", label: "Rentabilidad", hint: "Margen: venta − COGS" },
  { key: "analisis", label: "Análisis", hint: "Reorden + tendencias" },
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
 * Los módulos ANIDADOS (Contratos y Cotizaciones dentro de Documentos, la
 * página de tienda dentro de Mi Tienda) van en `ANIDADAS_POR_MODULO`: comparten
 * `?vista=` con su padre y necesitan las dos coordenadas.
 */
export const VISTAS_POR_MODULO: Readonly<Record<string, readonly SubvistaModulo[]>> = {
  "ventas-caja": [
    { key: "pos", label: "Vender", hint: "Punto de venta: buscar producto y cobrar" },
    { key: "turnos", label: "Turnos", hint: "Abrir y cerrar turnos del equipo" },
    { key: "caja-registradora", label: "Caja Registradora", hint: "Movimientos de efectivo, retiros e ingresos" },
    { key: "cuentas-cobrar", label: "Me deben", hint: "Lo que quedó a cuenta en el mostrador" },
    { key: "arqueo", label: "Cuadrar Caja", hint: "Contar la caja y cuadrar el turno" },
    { key: "comisiones", label: "Comisiones", hint: "Lo que ganó cada vendedor" },
  ],
  plata: [
    { key: "resumen", label: "Resumen", hint: "Cómo viene la plata del mes" },
    { key: "pl", label: "Ganancias y pérdidas", hint: "Estado de resultados" },
    { key: "rentabilidad", label: "Rentabilidad", hint: "Margen por producto y categoría" },
    { key: "comparador", label: "Comparar períodos", hint: "Este mes contra el anterior" },
    /* El presupuesto dejó de ser una vista propia: vive DENTRO de Gastos desde
       que Mi Plata se unificó. Se nombra igual en el label y en la pista para
       que buscar «presupuesto» siga llevando a donde está. */
    { key: "gastos", label: "Gastos y presupuesto", hint: "En qué se va la plata y cuánto planeaste gastar" },
    { key: "flujo-caja", label: "Proyección de caja", hint: "Flujo de caja de las próximas semanas" },
    { key: "tesoreria", label: "Tesorería", hint: "Cuentas bancarias y saldos" },
    { key: "por-cobrar", label: "Todo lo que me deben", hint: "Cobranzas pendientes" },
    { key: "por-pagar", label: "Lo que debo", hint: "Adelantos recibidos, proveedores y cuentas a favor de otro" },
    { key: "fiados", label: "Fiados", hint: "Lo que se llevaron anotado" },
    { key: "prestamos", label: "Préstamos", hint: "Plata prestada y cuotas" },
    { key: "adelantos", label: "Adelantos", hint: "Adelantos al personal" },
    { key: "scoring", label: "Scoring", hint: "A quién conviene fiarle" },
    { key: "reportes", label: "Reportes", hint: "Reportes financieros para el contador" },
    { key: "activos", label: "Activos", hint: "Bienes y depreciación" },
  ],
  compras: [
    { key: "punto-compra", label: "Punto de Compra", hint: "Cargar una compra al proveedor" },
    { key: "historial-gastos", label: "Historial de Gastos", hint: "Todo lo comprado" },
    { key: "sugerencias", label: "Sugerencias", hint: "Qué reponer según la venta" },
    { key: "ordenes-compra", label: "Ordenes", hint: "Órdenes de compra emitidas" },
    { key: "proveedores", label: "Proveedores", hint: "A quién le compras" },
    { key: "recepcion", label: "Recepcion", hint: "Recibir la mercadería que llegó" },
    { key: "cuentas-por-pagar", label: "Por pagar", hint: "Lo que le debes a cada proveedor y cuándo vence" },
    { key: "comparador", label: "Comparador", hint: "Qué proveedor conviene por producto" },
    { key: "devoluciones", label: "Devoluciones", hint: "Devolver al proveedor" },
  ],
  inventario: [
    { key: "stock", label: "Stock", hint: "Qué hay y cuánto queda" },
    { key: "kardex", label: "Entradas y Salidas", hint: "Movimiento de cada producto" },
    { key: "lotes", label: "Vencimientos", hint: "Lotes y vencimientos" },
    { key: "mermas", label: "Pérdidas", hint: "Lo que se perdió, rompió o venció" },
  ],
  clientes: [
    { key: "crm", label: "Mis clientes", hint: "Ficha de cada cliente" },
    { key: "leads", label: "Leads", hint: "Interesados que todavía no compran" },
    { key: "resenas", label: "Opiniones", hint: "Qué dicen los clientes" },
    { key: "segmentos", label: "Segmentos", hint: "Agrupar clientes por comportamiento" },
    { key: "mapa", label: "Mapa", hint: "Dónde viven los clientes" },
    { key: "mensajes", label: "Mensajes masivos", hint: "Conversaciones con clientes" },
  ],
  // Mi Tienda: la puerta del hub. Las sub-vistas de «Mi tienda pública» van
  // aparte, en ANIDADAS_POR_MODULO.
  config: [
    { key: "negocio", label: "Datos del negocio", hint: "Nombre, RUC, WhatsApp, dirección, horario, logo, portada y redes" },
    { key: "cobros", label: "Cobros y comprobantes", hint: "Efectivo, Yape, Plin, transferencia, alerta de caja, hora de cierre, RUC emisor e IGV" },
    { key: "delivery", label: "Delivery", hint: "Zonas con tarifa y tiempo, y desde cuánto el envío es gratis" },
    { key: "tienda", label: "Tienda web", hint: "Colores, slogan, modo vacaciones y las secciones y menú de la tienda" },
    { key: "plan", label: "Plan", hint: "Tu suscripción: Básico, Pro, Enterprise o Max" },
    { key: "equipo", label: "Equipo y acceso", hint: "Usuarios y roles, cambiar contraseña, sesión activa y dispositivos" },
    { key: "panel", label: "Mi panel", hint: "Módulos, orden de la barra lateral, accesos directos y pestaña por defecto" },
    { key: "sistema", label: "Sistema", hint: "Lenguaje simple o técnico, tutorial y respaldo de tus datos" },
  ],
  "pagina-inicio": [
    { key: "identidad", label: "Identidad y tema", hint: "Logo, colores y cómo se ve tu tienda" },
    { key: "pagina", label: "Mi tienda pública", hint: "Secciones, banners y promociones de la página de inicio" },
    { key: "paginas", label: "Páginas", hint: "Crear, editar y publicar páginas propias (Ofertas, Nosotros…) armadas con bloques" },
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
  "delivery-partners": [
    { key: "live", label: "En vivo", hint: "Mapa con los repartidores en la calle" },
    { key: "pedidos-vivo", label: "Pedidos en vivo", hint: "Los pedidos que están saliendo y quién los lleva" },
    { key: "repartidores", label: "Repartidores", hint: "Tu equipo de reparto y sus datos" },
    { key: "solicitudes", label: "Solicitudes", hint: "Quienes postularon para repartir" },
    { key: "asignaciones", label: "Asignaciones", hint: "Qué pedido va con qué repartidor" },
    { key: "retiros", label: "Retiros", hint: "Lo que cobran los repartidores por sus entregas" },
    { key: "ranking", label: "Ranking", hint: "Quién entrega más y mejor" },
    { key: "permisos", label: "Permisos", hint: "Qué puede hacer cada repartidor" },
  ],
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
    { key: "hoy", label: "Hoy", hint: "La venta de hoy, hora por hora, contra la meta" },
    { key: "calendario", label: "Calendario", hint: "Cada día de la semana y del mes contra su meta" },
    { key: "logros", label: "Logros", hint: "Las rachas y metas que ya cumpliste" },
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
  ],
  tareas: [
    { key: "tareas", label: "Tareas", hint: "Lo que tiene que hacer el equipo y quién lo hace" },
    { key: "notas", label: "Notas", hint: "Apuntes rápidos del negocio" },
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
  // Clave = id del TAB (`?tab=documentos` abre el hub de Documentos).
  documentos: [
    { vista: "contratos", key: "plantillas", label: "Plantillas de contrato", hint: "Modelos para generar contratos" },
    { vista: "contratos", key: "contratos", label: "Mis Contratos", hint: "Contratos emitidos y su estado de firma" },
    { vista: "contratos", key: "crear", label: "Crear Contrato", hint: "Redactar un contrato nuevo" },
    { vista: "cotizaciones", key: "lista", label: "Lista de cotizaciones", hint: "Presupuestos enviados" },
    { vista: "cotizaciones", key: "nueva", label: "Nueva cotización", hint: "Armar un presupuesto" },
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
  "pagina-inicio": [
    { vista: "pagina", key: "sections", label: "Secciones de la tienda", hint: "El orden de los bloques de la página" },
    { vista: "pagina", key: "branding", label: "Branding de la tienda", hint: "Logo, colores y tipografía" },
    { vista: "pagina", key: "banners", label: "Banners", hint: "Las imágenes grandes del inicio" },
    { vista: "pagina", key: "promotions", label: "Promociones de la página", hint: "Qué ofertas se destacan" },
  ],
};

/** Libro de Operaciones de Títulos Habilitantes (forestal) — 10 vistas. */
export const LOTH_VISTAS: readonly SubvistaModulo[] = [
  { key: "secciones", label: "Secciones", hint: "Las 6 secciones SERFOR" },
  { key: "gtf", label: "GTF", hint: "Guías de transporte forestal" },
  { key: "plan", label: "Plan de Manejo", hint: "Censo + especies autorizadas" },
  { key: "mapa", label: "Mapa", hint: "Dónde se taló cada árbol (GPS de campo)" },
  { key: "trazabilidad", label: "Por árbol", hint: "Operación completa de un árbol" },
  { key: "tablero", label: "Control del permiso", hint: "Por permiso: volumen que le queda, trozas en el patio y su antigüedad; despachar, etiquetas y Excel" },
  { key: "cumplimiento", label: "Cumplimiento", hint: "Veredicto de fiscalización + reporte imprimible" },
  { key: "cierre", label: "Cierre", hint: "Cerrar el mes → acta inmutable (OSINFOR)" },
  { key: "extraccion", label: "Extracción", hint: "Censo − tala, trozado y despacho por permiso" },
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
