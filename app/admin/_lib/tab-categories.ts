/**
 * app/admin/_lib/tab-categories.ts
 *
 * Constantes de configuración de los tabs/módulos del panel admin.
 * Extraído de app/admin/page.tsx (Sesión 2 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Contenido:
 *  - `DEMO_DATA_MODULES`  → Módulos con datos de demo y endpoint de limpieza
 *  - `MODULE_INFO`        → Metadata visible (emoji, prioridad, descripción, tip)
 *  - `TabCategory`        → Tipo de la categoría del sidebar
 *  - `BASIC_MODULES`      → 17 módulos básicos del sidebar
 *  - `CONFIG_MODULE`      → Configuración (último renglón de la barra + menú del usuario)
 *  - `TAB_CATEGORIES`     → Composición final usada por el sidebar
 *
 * Las constantes son `as const` cuando aplica para preservar inferencia
 * estrecha de tipos.
 */

import type { ComponentType } from "react";
import {
  Camera,
  Ruler,
  Wallet,
  Heart,
  HandCoins,
  Banknote,
  Store,
  SlidersHorizontal,
  Zap,
  BarChart3,
  Gauge,
  Inbox,
  BotMessageSquare,
  Receipt,
  Warehouse,
  BadgePercent,
  PackagePlus,
  ClipboardCheck,
  TimerReset,
  TrendingUp,
  ChefHat,
  Repeat,
  Gift,
  HeartHandshake,
  Radio,
  Share2,
  UserPlus,
  TreePine,
  Leaf,
  Megaphone,
  ClipboardList,
  Truck,
  Users,
  Briefcase,
  FileCheck,
  FolderArchive,
} from "@buleje/design-system/icons";
import type { Tab } from "./tabs.types";

// Modules that ship with auto-seeded demo data and their API cleanup endpoint
export const DEMO_DATA_MODULES: Partial<Record<Tab, { label: string; api?: string }>> = {
  inventario: {
    label: "24 productos de ejemplo cargados al inicio",
    api: "/api/admin/demo-products",
  },
};

// Rich metadata for every module: icon, color, priority, description and a helpful tip
export const MODULE_INFO: Partial<
  Record<Tab, { icon: ComponentType<{ className?: string }>; iconColor: string; priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>
> = {
  "vendor-dashboard": {
    icon: Gauge,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "core",
    desc: "Inicio del admin con resumen general y accesos a los dashboards clave del negocio.",
    tip: "Empieza aqui para ver ventas, stock, clientes, compras y marketplace en una sola entrada.",
  },
  "asistente-ia": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "core",
    desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",
    tip: "Empieza aquí cada mañana para tener el pulso del negocio.",
  },
  "ai-command": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Comandos rápidos al asistente IA para ejecutar acciones del negocio.",
    tip: "Dale órdenes naturales y deja que IA haga el trabajo pesado.",
  },
  "sugerencias-ia": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Recomendaciones automáticas de IA sobre el negocio.",
    tip: "Revísalo antes de tomar decisiones importantes.",
  },
  "metas-logros": {
    icon: BotMessageSquare,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Objetivos comerciales y progreso hacia ellos.",
    tip: "Mantén foco en lo que realmente mueve la aguja.",
  },
  "ventas-caja": {
    icon: Receipt,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "core",
    desc: "Vender, los turnos, la caja del día con su cuadre, lo que te deben (fiados) y las comisiones.",
    tip: "Úsalo para cobrar, cuadrar la caja y cobrar los fiados sin salir del panel.",
  },
  inventario: {
    icon: Warehouse,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "core",
    desc: "Tus productos y su stock, entradas y salidas, vencimientos, pérdidas, el conteo físico, categorías, precios y ofertas.",
    tip: "El catálogo y lo que hay en el almacén, en una sola pestaña.",
  },
  productos: {
    icon: BadgePercent,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "high",
    desc: "Categorías, precios, ofertas y cupones: hoy viven en Productos e inventario.",
    tip: "Gestiona tu catálogo y optimiza precios.",
  },
  compras: {
    icon: PackagePlus,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "high",
    desc: "Comprar, órdenes y recepción, qué reponer, proveedores, lo que les debes, devoluciones y dropship.",
    tip: "Flujo completo de compras desde la orden hasta la recepción y el pago.",
  },
  plata: {
    icon: Wallet,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Resumen, resultado, gastos, lo que te deben y lo que debes, préstamos, adelantos, activos, impuestos y reportes.",
    tip: "Visión financiera completa del negocio; los fiados se cobran en Ventas y caja › Me deben.",
  },
  clientes: {
    icon: Heart,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "high",
    desc: "CRM, delivery, opiniones y programa de fidelización.",
    tip: "Conoce a tus clientes y personaliza la atención.",
  },
  config: {
    icon: SlidersHorizontal,
    iconColor: "text-[var(--text-secondary)]",
    priority: "core",
    desc: "Datos del negocio, cobros, delivery, tienda web, tu plan, usuarios y acceso, tu panel y el sistema.",
    tip: "Configura esto primero para que todo funcione correctamente.",
  },
  pedidos: {
    icon: ClipboardCheck,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "core",
    desc: "Los pedidos en marcha por estado, el reparto con tus repartidores y los archivados.",
    tip: "Centraliza pedidos de WhatsApp, tienda online y mostrador, y quién los lleva.",
  },
  plan: {
    icon: Zap,
    iconColor: "text-[var(--text-secondary)]",
    priority: "medium",
    desc: "Tu plan actual, límites y opciones de mejora.",
    tip: "Revisa tu plan para aprovechar al máximo la plataforma.",
  },
  fiados: {
    icon: HandCoins,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Control de créditos informales: registro, pagos y saldos pendientes (Ventas y caja › Me deben).",
    tip: "Lleva la cuenta de lo que te deben tus clientes de confianza.",
  },
  turnos: {
    icon: TimerReset,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Apertura y cierre de turnos con conteo de efectivo.",
    tip: "Control de caja por turno para saber exactamente cuánto entró.",
  },
  prestamos: {
    icon: Banknote,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "medium",
    desc: "Préstamos a clientes con cuotas, interés y tabla de amortización.",
    tip: "Gestiona préstamos con calculadora integrada y seguimiento de pagos.",
  },
  "analytics-pro": {
    icon: BarChart3,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "high",
    desc: "Métricas del negocio, ventas, conversión y tendencias para tomar decisiones.",
    tip: "Aquí ves la película completa del negocio, no solo la foto del día.",
  },
  forecasting: {
    icon: TrendingUp,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Proyección de demanda y apoyo para reposición inteligente.",
    tip: "Anticípate a quiebres y compras urgentes con datos históricos.",
  },
  "a-medida": {
    icon: Ruler,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "low",
    desc: "Herramientas hechas a la medida de tu negocio.",
    tip: "Aquí aparece lo que pediste para tu negocio, como el Excel del mes para tu contador.",
  },
  camaras: {
    icon: Camera,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Las fotos que manda la cámara del patio o del local, con lectura automática.",
    tip: "Mira qué pasó anoche sin abrir la app de la cámara.",
  },
  rendimiento: {
    icon: Gauge,
    iconColor: "text-[var(--text-tertiary)]",
    priority: "medium",
    desc: "Salud técnica, velocidad web, navegador y recursos del sistema.",
    tip: "Útil cuando quieres revisar si el sistema está corriendo fino o pesado.",
  },
  auditoria: {
    icon: Gauge,
    iconColor: "text-[var(--text-tertiary)]",
    priority: "medium",
    desc: "Registro de actividad y trazabilidad de cambios dentro del panel.",
    tip: "Te ayuda a saber quién hizo qué y cuándo.",
  },
  "support-inbox": {
    icon: Inbox,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Bandeja unificada de mensajes, WhatsApp y reseñas pendientes.",
    tip: "Úsala para responder soporte sin perderte entre varios frentes.",
  },
  "leads-funnel": {
    icon: UserPlus,
    iconColor: "text-[var(--accent)]",
    priority: "high",
    desc: "Funnel de leads captados (outbound WhatsApp + ads + referidos). Conversión + status workflow.",
    tip: "Cada lead que llena el formulario aparece acá. Movele el status a 'contacted' cuando lo llames.",
  },
  "pagina-inicio": {
    icon: Store,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "medium",
    desc: "Cómo se ve tu tienda, qué muestra, sus páginas y de dónde llegan tus visitas.",
    tip: "Apariencia para logo y colores; Contenido para el inicio; Redes y medición para tus pixeles y visitas.",
  },
  // ── ENRICH-5: bridges admin para marketplace features ──
  subscriptions: {
    icon: Repeat,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Bodega al Mes: suscripciones recurrentes de canastas mensuales.",
    tip: "Monitorea MRR, churn y canastas programadas.",
  },
  "gift-cards-admin": {
    icon: Gift,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Gift cards vendidas en marketplace. Validar códigos, cancelar o emitir manualmente.",
    tip: "Controla saldo pendiente y gift cards próximas a vencer.",
  },
  "socio-members": {
    icon: HeartHandshake,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Programa Socio Buleje: miembros con precios exclusivos y cashback.",
    tip: "Mide MRR del programa y gestiona ofertas Socio.",
  },
  "lives-admin": {
    icon: Radio,
    iconColor: "text-[var(--data-error-500)]",
    priority: "medium",
    desc: "Transmisiones en vivo para mostrar productos y vender en directo.",
    tip: "Programa lives con productos destacados y mide performance.",
  },
  // ── Crecimiento (Marketing & Fidelización) ──
  campanas: {
    icon: Megaphone,
    iconColor: "text-[var(--accent)]",
    priority: "high",
    desc: "Campañas segmentadas por WhatsApp/email + automatizaciones de marketing.",
    tip: "Crea una campaña desde un segmento en un clic para que tus clientes vuelvan.",
  },
  puntos: {
    icon: Heart,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Programa de puntos y fidelización: acumulación, canje y reglas.",
    tip: "Premia a tus clientes frecuentes para que compren más seguido.",
  },
  canales: {
    icon: Share2,
    iconColor: "text-[var(--accent)]",
    priority: "medium",
    desc: "Canales de venta social: conecta TikTok Shop y Meta (Facebook + Instagram).",
    tip: "Pega tus Pixel IDs y los eventos se activan en tu tienda para optimizar anuncios.",
  },
  // ── Equipo ──
  tareas: {
    icon: ClipboardList,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Tareas del equipo con prioridad, estado y asignación.",
    tip: "Coordina pendientes del día sin perderlos entre conversaciones.",
  },
  notas: {
    icon: ClipboardList,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "low",
    desc: "Notas de turno y recordatorios tipo sticky.",
    tip: "Deja anotado lo importante para el siguiente turno.",
  },
  // ── Recursos Humanos (ADR-414) ──
  rrhh: {
    icon: Users,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Personal, asistencia del día y del mes, lo ganado de referencia, contratos, y las tareas y notas del equipo.",
    tip: "Marca la asistencia de hoy en un par de clics; el sueldo es sólo referencia, no reemplaza la boleta.",
  },
  // ── Dropshipping (ADR-298) ──
  dropship: {
    icon: Truck,
    iconColor: "text-[var(--accent)]",
    priority: "high",
    desc: "Envíos al proveedor automáticos cuando se paga un pedido (el proveedor despacha al cliente).",
    tip: "Para tiendas dropshipping: vincula productos a proveedores y trackea los envíos.",
  },
  // ── Comprobantes y Documentos (ola 3 del panel unificado, 2026-10-10) ──
  facturacion: {
    icon: FileCheck,
    iconColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    priority: "high",
    desc: "Boletas y facturas con su estado en SUNAT, notas de crédito, guías de remisión y cotizaciones.",
    tip: "Los papeles de tus ventas en un solo lugar; la conexión con SUNAT está en Configuración.",
  },
  documentos: {
    icon: FolderArchive,
    iconColor: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    priority: "medium",
    desc: "Tu archivo: documentos en carpetas con su vencimiento, y los contratos con sus plantillas y firmas.",
    tip: "Sube lo importante y el panel te avisa antes de que venza.",
  },
  // ── Recetas (vertical comida — restaurante) ──
  recetas: {
    icon: ChefHat,
    iconColor: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    priority: "high",
    desc: "Recetas, producción y recetario: define platos, su costo por insumos y descuenta stock al producir.",
    tip: "Para negocios de comida: arma cada plato con sus ingredientes y controla el costo real.",
  },
};

export type TabCategory = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tabs: Tab[];
  /**
   * Si true, la categoría SIEMPRE se renderiza como grupo desplegable en el
   * sidebar — aunque tenga un solo tab visible. Por default una categoría de
   * 1 tab colapsa a enlace directo (ej. Ventas). Las especializaciones lo
   * fuerzan para que "Agricultura" muestre su header aunque solo tenga Cacao.
   */
  alwaysGroup?: boolean;
};

// ── Sidebar modules v6 — reorganized by FUNCTIONAL AREA (2026-04-18) ────────
//
// Antes (v5): metáforas ambiguas — "Cobrar", "Crecer", "Conocer". El dueño
// no sabía dónde buscar (¿"plata" está en Cobrar o en Conocer?).
//
// Ahora (v6): nombres FUNCIONALES directos — el dueño lee el label y sabe
// exactamente qué hay adentro. Agrupación por AREA DE NEGOCIO, no por
// outcome ni metáfora.
//
// 7 categorías (Miller's Law 7±2):
//   01 Inicio              → Dashboard + IA
//   02 Ventas              → POS, pedidos, facturación, documentos de venta
//   03 Compras             → Pedidos a proveedor, contratos
//   04 Productos e inventario → Catálogo + stock
//   05 Clientes            → CRM, fiados, préstamos, chat, soporte
//   06 Gráficos            → Analytics, forecast, rendimiento, finanzas
//   07 Marketplace         → Tienda online, delivery, subs, gift cards, socio, lives
//
// Mi Tienda (personalización) + Config quedan como módulos separados.
export const BASIC_MODULES: TabCategory[] = [
  // ── 01 · INICIO ──────────────────────────────────
  // Lo primero que ve el dueño al entrar. Overview + IA + metas.
  {
    id: "inicio",
    label: "Inicio",
    icon: Gauge,
    // "asistente-ia" abre AsistenteIAHubModule, que YA contiene Chat / Comandos /
    // Sugerencias como sub-tabs internas (consolidacion 3->1). Antes el sidebar
    // listaba los 3 ids (asistente-ia/ai-command/sugerencias-ia) → 3 enlaces que
    // abrian el MISMO hub. Ahora una sola entrada "Asistente IA"; las otras 2
    // siguen accesibles desde la barra de sub-tabs del hub.
    tabs: [
      "vendor-dashboard",
      "asistente-ia",
      "metas-logros",
    ],
  },

  // ── 02 · VENTAS ──────────────────────────────────
  // Ola 3 del panel unificado (2026-10-10): Ventas y caja · Pedidos y reparto ·
  // Comprobantes. `facturacion` es el hub Comprobantes (Facturas y boletas,
  // Notas de crédito, Guías de remisión, Cotizaciones); el Archivo y los
  // Contratos (`documentos`) pasaron al grupo Gestión.
  {
    id: "ventas",
    label: "Ventas",
    icon: Receipt,
    tabs: [
      "ventas-caja",
      "pedidos",
      "facturacion",
    ],
  },

  // ── 03 · ABASTECIMIENTO (ola 3 del panel unificado, 2026-10-10) ──
  // Lo que entra al negocio: Productos e inventario (absorbe Productos y el
  // Conteo físico), Compras (absorbe Dropship y Devoluciones) y Recetas. Eran
  // dos renglones («Compras» y «Productos e inventario»).
  //
  // El id se queda en "compras": lo guardan el orden de la barra de cada
  // navegador y el color por categoría, y va justo después de Ventas, que es
  // donde iba Compras. "productos" y "dropship" abren por su id viejo
  // (TAB_MIGRATION) y ya no ocupan renglón.
  //
  // "recetas" se auto-oculta por el filtro vertical: solo aparece en negocios
  // de comida (vertical "restaurante", que lo tiene en modules.enabled). Para
  // bodega/otros NO está en su enabled → oculto. Brandon 2026-06-21.
  {
    id: "compras",
    label: "Abastecimiento",
    icon: Warehouse,
    tabs: [
      "inventario",
      "compras",
      "recetas",
    ],
  },

  // ── 05 · CLIENTES ────────────────────────────────
  // CRM (con Leads dentro) + Mensajes. "whatsapp-inbox" y "marketplace-chat"
  // abren el MISMO MensajesHubModule (initialTab "whatsapp"/"chat") — atajo
  // redundante (auditoría 2026-08-02). Se deja sólo "whatsapp-inbox" (canal
  // principal del negocio, ADR-058); "Chat con clientes" sigue a 1 click desde
  // la barra de sub-tabs del hub. leads → sub-tab de CRM. (Créditos/préstamos
  // en Finanzas.)
  {
    id: "clientes",
    label: "Clientes",
    icon: Heart,
    tabs: [
      "clientes",
      "whatsapp-inbox",
    ],
  },

  // ── 05b · CRECIMIENTO (Marketing & Fidelización) ──
  // Hub único que reúne TODO lo que hace volver al cliente. Antes estaba
  // disperso y/o invisible: campañas/puntos/segmentos/RFM eran huérfanos (sin
  // entrada en el sidebar) y los 4 programas (gift cards, socio, suscripciones,
  // lives) vivían enterrados como sub-tabs del Marketplace. Ahora UNA categoría
  // visible cuyos accesos directos abren el CrecimientoHubModule en su sub-tab.
  // (segmentos y RFM quedan como sub-tabs internos del hub, a 1 click.)
  // "campanas" es el único enlace visible: los otros 5 (puntos, gift-cards,
  // socio, subscriptions, lives) abrían el MISMO CrecimientoHubModule con un
  // initialTab distinto — atajo redundante (auditoría 2026-08-02, 6→1). Siguen
  // a 1 click desde la barra de sub-tabs del hub.
  {
    id: "crecimiento",
    label: "Crecimiento",
    icon: Megaphone,
    tabs: [
      "campanas",
    ],
  },

  // ── 06 · GESTIÓN (ola 3 del panel unificado, 2026-10-10) ──
  // Brandon eligió el GRUPO (2026-10-09): Mi Plata, Equipo y Documentos en un
  // solo renglón desplegable — dos renglones menos a cambio de un clic más.
  //
  // Mi Plata va con UN solo id. Antes iban `plata` y `activos` porque el plan
  // Básico desbloquea `activos` y no `plata`: hoy la barra mira el `origen` de
  // cada vista (R2), y las hojas de Mi Plata nombran `activos` (la puerta por la
  // que Básico entraba al hub entero), así que un Básico sigue viendo Mi Plata
  // como hoy. `activos`, `adelantos`, `prestamos`, `scoring` y `por-cobrar`
  // abren por su id viejo (TAB_MIGRATION).
  //
  // El id se queda en "finanzas" (orden guardado y color); «Equipo» (`rrhh`)
  // sale de su categoría propia y «Documentos» de Ventas.
  {
    id: "finanzas",
    label: "Gestión",
    icon: Briefcase,
    tabs: [
      "plata",
      "rrhh",
      "documentos",
    ],
  },

  // ── 07 · GRÁFICOS ────────────────────────────────
  // Visión estratégica: analytics + forecast (ambos abren AnalisisHubModule).
  // (rendimiento técnico movido a la categoría Sistema.)
  {
    id: "graficos",
    label: "Análisis",
    icon: BarChart3,
    // "analytics-pro" abre AnalisisHubModule (Analytics Pro + Predicción + Inteligencia).
    tabs: [
      "analytics-pro",
    ],
  },

  // ── 07 · CANALES (ola 2 del panel unificado, 2026-10-10) ──
  // Por dónde vende el negocio: su Tienda online y el Marketplace. Es el grupo
  // que antes eran dos renglones (Marketplace + Mi Tienda). «canales» (Redes y
  // medición) vive dentro de Tienda online y Delivery dentro de Pedidos y
  // reparto: siguen abriendo por su id viejo (TAB_MIGRATION).
  //
  // El id se queda en "marketplace-ops" a propósito: lo guardan el orden de la
  // barra de cada navegador, los colores por categoría y SECTION_BEFORE.
  // "pagina-inicio" va primero y no "store-customizer": en la plantilla del
  // superadmin `store-customizer` nace oculto (`defaultVisible: false`).
  {
    id: "marketplace-ops",
    label: "Canales",
    icon: Store,
    tabs: [
      "pagina-inicio",
      "marketplace",
    ],
  },
];

// ── Módulos de Especialización por vertical (ADR-124) ──────────────────────────
// Tabs verticales habilitables por superadmin, agrupados por VERTICAL de negocio
// (Brandon 2026-05-29: separar Forestal de Agricultura — son cosas distintas).
// El render del sidebar SOLO muestra cada tab si:
//   1. allowedTabs lo incluye (rol+plan pasan — spec bypassa plan filter)
//   2. La feature flag de spec está enabled para el tenant
// Cada categoría se auto-oculta si NINGÚN tab suyo está visible (catTabs.length
// === 0 en el sidebar) — así un tenant solo-forestal no ve "Agricultura" y
// viceversa. Mantener sincronizado con lib/specializations.ts (vertical).
export const FORESTAL_MODULE: TabCategory = {
  id: "forestal",
  label: "Forestal",
  icon: TreePine,
  alwaysGroup: true,
  // Cuando gtf-emisor entre al Tab union (ADR-124 Fase futura) se suma acá.
  //
  // «Lotes de Producción» salió del menú (Brandon, 2026-09-09: «no tiene ningún
  // contenido»). NO se borró nada: el módulo, sus endpoints, sus lotes y su
  // certificado QR siguen enteros y la pantalla se abre por URL
  // (`/admin?tab=forestal-lotes`) y desde la búsqueda global. Para devolverlo al
  // sidebar alcanza con sumarlo de nuevo a esta lista — un módulo vacío ocupa
  // un renglón del menú todos los días; borrarlo costaría una migración.
  //
  // Ola 2 del panel unificado (2026-10-10): «Trámites y Oficios» es la 2.ª fase
  // de Herramientas y trámites. La pestaña aparece si pasa
  // forestal-herramientas O forestal-tramites (el `origen` de sus vistas).
  tabs: ["ctp-libro-operaciones", "loth-libro-operaciones", "forestal-herramientas"],
};

export const AGRICULTURA_MODULE: TabCategory = {
  id: "agricultura",
  label: "Agricultura",
  icon: Leaf,
  alwaysGroup: true, // 1 solo tab (Cacao) pero igual muestra header "Agricultura"
  tabs: ["cacao-acopio"],
};

/**
 * Cámaras (ADR-411) — su propio renglón en la barra lateral.
 *
 * NO va dentro de Forestal aunque hoy mire el patio del aserradero: ese grupo
 * es de especializaciones, y el sidebar sólo dibuja sus tabs cuando la spec del
 * tenant está encendida. Cámaras no es una especialización —una bodega también
 * quiere ver quién entró— así que ahí quedaba renderizada pero invisible.
 * Un tab suelto se colapsa a enlace directo, que es exactamente lo que se pidió:
 * entrar de un clic.
 */
export const CAMARAS_MODULE: TabCategory = {
  id: "camaras",
  label: "Cámaras",
  icon: Camera,
  tabs: ["camaras"],
};

/**
 * A medida (ADR-457) — un solo renglón, y sólo si el negocio tiene alguna pieza
 * en `panel.pestana`: `a-medida` está en `SPEC_GATED_MODULE_IDS`, así que el
 * sidebar, la plantilla y el candado de `TabRouter` lo esconden solos.
 */
export const A_MEDIDA_MODULE: TabCategory = {
  id: "a-medida",
  label: "A medida",
  icon: Ruler,
  tabs: ["a-medida"],
};

// ── Configuración: último renglón de la barra + menú del usuario ─────────────
// Ola 2 del panel unificado (2026-10-10): Plan (`plan`) y Sistema
// (`rendimiento`, `auditoria`, `colas`) son vistas de Configuración y abren por
// su id viejo (TAB_MIGRATION). La categoría «Sistema» salió de la barra: su
// lugar es este renglón, en la sección «Configuración».
export const CONFIG_MODULE: TabCategory = {
  id: "config",
  label: "Configuración",
  icon: SlidersHorizontal,
  tabs: ["config"],
};

// ── TAB_CATEGORIES: composición final del sidebar ────────────────────────────
//
// Orden 2026-05-28:
// 1. BASIC_MODULES (inicio → ventas → compras → productos → clientes → finanzas → marketplace)
// 2. FORESTAL_MODULE + AGRICULTURA_MODULE — ANTES de Mi Tienda. Razón: el footer
//    fijo del sidebar tapaba el último item del nav scrollable en viewports
//    estándar (1080p). Las especializaciones están activas para tenants que las
//    habilitan; ponerlas arriba las hace descubribles sin scroll. Cada una
//    auto-oculta si vacía (tenant solo-forestal no ve Agricultura y viceversa).
// 3. TIENDA_MODULE — al final (configuración visual, menos frecuente).
// Orden 2026-08-02 (Brandon: "categorías más ordenadas y manejables"): las
// categorías se agrupan en SECCIONES con encabezado en el sidebar
// (`SECTION_BEFORE` en AdminSidebar), y una sección sólo se lee como bloque si
// sus categorías van seguidas. Antes el orden las intercalaba —"Equipo" caía
// después de "Marketplace"— así que ningún encabezado agrupaba algo contiguo.
//
//   Inicio            (sin encabezado: es el punto de entrada)
//   Operaciones       ventas · compras («Abastecimiento») · camaras
//   Clientes          clientes · crecimiento
//   Gestión           finanzas («Gestión»: Mi Plata, Equipo, Documentos) · graficos · a-medida
//   Canales           marketplace-ops (Tienda online + Marketplace)
//   Especializaciones forestal · agricultura
//   Configuración     config
// (ola 2 del panel unificado, 2026-10-10: Cámaras a Operaciones, A medida a
// Gestión, Mi Tienda dentro de Canales, Sistema dentro de Configuración.
// Ola 3: Compras + Productos e inventario = Abastecimiento; Comprobantes en
// Ventas; Mi Plata, Equipo y Documentos en el grupo Gestión.)
const byId = (id: string) => BASIC_MODULES.find((c) => c.id === id)!;

/**
 * Encabezado de sección que se dibuja ANTES de esta categoría.
 *
 * Single source: lo leen el sidebar de escritorio y el drawer móvil. Vivía
 * dentro de AdminSidebar, así que el drawer agrupaba por CATEGORÍA (14
 * encabezados) mientras el escritorio agrupaba por SECCIÓN (6) — el mismo menú
 * con dos organizaciones distintas según el ancho de pantalla.
 *
 * "Inicio" no lleva encabezado a propósito: es el punto de entrada, no un grupo.
 */
export const SECTION_BEFORE: Record<string, string> = {
  ventas: "Operaciones",
  clientes: "Clientes",
  finanzas: "Gestión",
  "marketplace-ops": "Canales",
  forestal: "Especializaciones",
  config: "Configuración",
};

export const TAB_CATEGORIES: TabCategory[] = [
  byId("inicio"),
  // Operaciones — lo que pasa cada día en el mostrador y el almacén
  byId("ventas"),
  byId("compras"), // «Abastecimiento»: Productos e inventario · Compras · Recetas
  // Lo que pasa en el local o el patio (ADR-411): de todos los días.
  CAMARAS_MODULE,
  // Clientes — quién compra y qué lo hace volver
  byId("clientes"),
  byId("crecimiento"),
  // Gestión — la plata, el equipo, los documentos y los números
  byId("finanzas"), // «Gestión»: Mi Plata · Equipo · Documentos
  byId("graficos"),
  A_MEDIDA_MODULE,
  // Canales — por dónde vende (Tienda online + Marketplace)
  byId("marketplace-ops"),
  // Especializaciones por vertical
  FORESTAL_MODULE,
  AGRICULTURA_MODULE,
  // Configuración — el negocio, el plan, el acceso y el sistema
  CONFIG_MODULE,
];

// ── Modo Fácil vs Avanzado ──────────────────────────────────────────────────
// Modo Fácil: solo las secciones esenciales del día a día.
// Modo Avanzado: todo visible (Documentos, Analytics Pro, Finanzas avanzadas, Sistema).
export const EASY_MODE_TABS: ReadonlySet<Tab> = new Set<Tab>([
  // Inicio
  "vendor-dashboard",
  // Centro IA
  "ai-command", "sugerencias-ia", "asistente-ia",
  // Metas y Logros
  "metas-logros",
  // Ventas y Caja
  "ventas-caja", "pedidos",
  // Productos
  "productos",
  // Inventario
  "inventario",
  // Compras
  "compras",
  // Clientes y Créditos
  "clientes", "fiados", "prestamos",
  // Recursos Humanos — marcar asistencia es del día a día
  "rrhh",
  // Marketplace
  "marketplace", "delivery-partners", "delivery-live",
  // Comunicación
  "marketplace-chat", "whatsapp-inbox",
  // Mi Tienda
  "store-customizer", "pagina-inicio",
  // Config (siempre visible)
  "config", "plan", "mi-perfil",
]);

// Tabs que solo se muestran en Modo Avanzado (no incluidos en EASY_MODE_TABS):
// - analytics-pro, forecasting       → Análisis
// - plata                            → Mi Plata (en Modo Fácil se ve con lo que
//   llega de `prestamos`: el permiso es por el `origen` de cada vista)
// - facturacion, cotizaciones, guias-remision, notas-credito → Comprobantes
// - documentos, contratos            → Documentos
// - support-inbox, rendimiento, colas, auditoria           → Configuración › Sistema
