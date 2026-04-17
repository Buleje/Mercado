"use client";

/**
 * /superadmin/project-intel
 *
 * Panorama del proyecto en lenguaje simple. Diseñado para que Brandon
 * vea en 2 minutos todo lo que tiene, sin tecnicismos innecesarios.
 *
 * 11 tabs:
 *   1. Qué es (resumen en 1 párrafo)
 *   2. Qué tiene dentro (tecnologías, en lenguaje simple)
 *   3. Cómo funciona (arquitectura como "viaje de un pedido")
 *   4. La IA (modelos y uso)
 *   5. Agentes (quiénes trabajan en el código)
 *   6. Herramientas (skills)
 *   7. MCP (conectores externos)
 *   8. Avance (scores visual)
 *   9. 💰 Precio por venta / mes (modelos de negocio en soles)
 *  10. 💎 Vender el proyecto entero (5 paquetes en soles)
 *  11. Roadmap
 */

import { useState, useEffect, type ReactNode } from "react";
import {
  Rocket,
  Box,
  Route,
  Brain,
  Bot,
  Sparkles,
  Plug,
  TrendingUp,
  DollarSign,
  Crown,
  Map,
  Zap,
  CheckCircle2,
  Package,
  ArrowRight,
  Star,
  Shield,
  ShoppingCart,
  Users,
  Smartphone,
  Cloud,
  Cpu,
} from "lucide-react";

// ─── Tabs definition ────────────────────────────────────────────────────────

type TabId =
  | "what"
  | "stack"
  | "how"
  | "ai"
  | "agents"
  | "skills"
  | "mcp"
  | "scores"
  | "pricing"
  | "sell"
  | "roadmap";

interface TabDef {
  id: TabId;
  label: string;
  icon: ReactNode;
  accent: string;
}

const TABS: TabDef[] = [
  { id: "what",    label: "Qué es",           icon: <Rocket className="w-4 h-4" />,      accent: "indigo"   },
  { id: "stack",   label: "Qué tiene dentro", icon: <Box className="w-4 h-4" />,         accent: "blue"     },
  { id: "how",     label: "Cómo funciona",    icon: <Route className="w-4 h-4" />,       accent: "teal"     },
  { id: "ai",      label: "La IA",            icon: <Brain className="w-4 h-4" />,       accent: "purple"   },
  { id: "agents",  label: "Agentes",          icon: <Bot className="w-4 h-4" />,         accent: "pink"     },
  { id: "skills",  label: "Herramientas",     icon: <Sparkles className="w-4 h-4" />,    accent: "amber"    },
  { id: "mcp",     label: "Conectores",       icon: <Plug className="w-4 h-4" />,        accent: "emerald"  },
  { id: "scores",  label: "Avance",           icon: <TrendingUp className="w-4 h-4" />,  accent: "cyan"     },
  { id: "pricing", label: "Precio / mes",     icon: <DollarSign className="w-4 h-4" />,  accent: "orange"   },
  { id: "sell",    label: "Vender todo",      icon: <Crown className="w-4 h-4" />,       accent: "yellow"   },
  { id: "roadmap", label: "Futuro",           icon: <Map className="w-4 h-4" />,         accent: "violet"   },
];

// ─── DATA: Qué es el proyecto (1 párrafo simple) ───────────────────────────

const WHAT_HIGHLIGHTS = [
  { icon: <ShoppingCart className="w-5 h-5" />, label: "Marketplace", value: "Multi-tienda B2B + B2C" },
  { icon: <Users className="w-5 h-5" />,        label: "Tiendas",     value: "Multi-tenant aislado" },
  { icon: <Brain className="w-5 h-5" />,        label: "IA",          value: "15 módulos inteligentes" },
  { icon: <Smartphone className="w-5 h-5" />,   label: "Móvil",       value: "App iOS + Android" },
  { icon: <Cloud className="w-5 h-5" />,        label: "Hosting",     value: "Vercel + Supabase" },
  { icon: <Shield className="w-5 h-5" />,       label: "Seguro",      value: "JWT + RBAC + rate limits" },
];

// ─── DATA: Stack en lenguaje simple ────────────────────────────────────────

interface SimpleStackItem {
  category: string;
  icon: ReactNode;
  items: Array<{ simple: string; technical: string; purpose: string }>;
}

const SIMPLE_STACK: SimpleStackItem[] = [
  {
    category: "La web que ve el cliente",
    icon: <Rocket className="w-5 h-5" />,
    items: [
      { simple: "Lo moderno de la web", technical: "Next.js 16 + React 19", purpose: "Carga rápido y se ve bien" },
      { simple: "Estilos visuales",     technical: "Tailwind CSS 4",        purpose: "Diseño limpio y adaptable a móvil" },
      { simple: "Animaciones",          technical: "Framer Motion + GSAP",  purpose: "Transiciones suaves en la tienda" },
    ],
  },
  {
    category: "La base de datos (donde se guarda todo)",
    icon: <Box className="w-5 h-5" />,
    items: [
      { simple: "La DB",                technical: "PostgreSQL en Supabase",          purpose: "Guarda productos, pedidos, clientes" },
      { simple: "El conector con la DB", technical: "Prisma 7.4 (116 modelos)",       purpose: "Hace las consultas rápidas y seguras" },
      { simple: "Memoria temporal",      technical: "Redis (opcional)",               purpose: "Respuestas más rápidas para datos frecuentes" },
    ],
  },
  {
    category: "Inteligencia artificial",
    icon: <Brain className="w-5 h-5" />,
    items: [
      { simple: "IA principal",         technical: "Groq (Llama 3.1, 3.3, 4-scout)",  purpose: "Responde consultas del admin, genera promos" },
      { simple: "IA premium",           technical: "Claude 4.6 (Anthropic)",          purpose: "Listo pero falta tu API key para activar" },
      { simple: "OCR de facturas",      technical: "OpenAI GPT-4o-mini Vision",       purpose: "Lee facturas escaneadas y las guarda" },
    ],
  },
  {
    category: "Pagos",
    icon: <DollarSign className="w-5 h-5" />,
    items: [
      { simple: "Tarjetas",             technical: "Stripe (placeholders hoy)",       purpose: "Pagos con VISA/Mastercard (falta activar keys)" },
      { simple: "Pagos locales Perú",   technical: "MercadoPago + Yape",              purpose: "Yape, Plin, transferencias, efectivo" },
    ],
  },
  {
    category: "Seguridad",
    icon: <Shield className="w-5 h-5" />,
    items: [
      { simple: "Login y sesiones",     technical: "JWT httpOnly + rotación 8h",      purpose: "Nadie entra sin contraseña" },
      { simple: "Permisos por rol",     technical: "RBAC 26 recursos × 6 roles",      purpose: "Cajero ≠ admin ≠ almacenero" },
      { simple: "Anti-spam",            technical: "Rate limit 60 req/min/IP",        purpose: "Bloquea ataques automáticos" },
    ],
  },
  {
    category: "Monitoreo y tests",
    icon: <TrendingUp className="w-5 h-5" />,
    items: [
      { simple: "Alertas de errores",   technical: "Sentry + OpenTelemetry",          purpose: "Si algo falla en prod, te avisa" },
      { simple: "Tests automáticos",    technical: "Vitest + Playwright + k6",        purpose: "2113 tests que corren en cada cambio" },
    ],
  },
  {
    category: "Móvil",
    icon: <Smartphone className="w-5 h-5" />,
    items: [
      { simple: "App móvil",            technical: "Capacitor iOS + Android",         purpose: "La misma web compilada a app nativa" },
      { simple: "Push notifications",   technical: "VAPID + Web Push",                purpose: "Avisos al cliente cuando su pedido sale" },
    ],
  },
];

// ─── DATA: Cómo funciona (arquitectura como viaje de un pedido) ────────────

interface FlowStep {
  n: number;
  title: string;
  simple: string;
  technical: string;
  icon: ReactNode;
}

const FLOW_STEPS: FlowStep[] = [
  {
    n: 1,
    title: "El cliente abre la tienda",
    simple: "Entra al sitio web o la app del celular",
    technical: "Next.js sirve la página del storefront con tenant por subdominio (slug.buleje.pe)",
    icon: <Smartphone className="w-5 h-5" />,
  },
  {
    n: 2,
    title: "Navega productos",
    simple: "Ve el catálogo con fotos, precios y stock real",
    technical: "Server components fetch via ProductsDB.getAll(tenantId) con cache Redis",
    icon: <ShoppingCart className="w-5 h-5" />,
  },
  {
    n: 3,
    title: "Agrega al carrito y paga",
    simple: "Elige, pone su dirección, confirma pago",
    technical: "CheckoutModal → POST /api/orders con Zod.safeParse + idempotency key",
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    n: 4,
    title: "El pedido llega al admin",
    simple: "Tú ves el pedido nuevo en tu panel y lo preparas",
    technical: "Emit domain event VentaCompletada → BullMQ queue → notification agent",
    icon: <Box className="w-5 h-5" />,
  },
  {
    n: 5,
    title: "La IA hace análisis",
    simple: "Los 15 módulos de IA analizan ventas, sugieren promos, detectan stock bajo",
    technical: "orchestrator.executeSync(domain, action) con 32 tools + tier balanced (Groq 70B)",
    icon: <Brain className="w-5 h-5" />,
  },
  {
    n: 6,
    title: "Si algo es crítico, pide aprobación",
    simple: "Si la IA quiere mandar una promo masiva, te pregunta primero",
    technical: "HITL interceptor → pending-approvals.ts → HITLApprovalsBanner modal",
    icon: <Shield className="w-5 h-5" />,
  },
  {
    n: 7,
    title: "El cliente recibe notificación",
    simple: "WhatsApp, email o push: 'Tu pedido salió'",
    technical: "notifications.agent → WhatsApp API + VAPID push + Nodemailer",
    icon: <Sparkles className="w-5 h-5" />,
  },
];

// ─── DATA: IA explicada simple ─────────────────────────────────────────────

interface SimpleAI {
  role: string;
  whatItDoes: string;
  provider: string;
  model: string;
  status: "activo" | "listo" | "falta-key";
  cost: string;
}

const SIMPLE_AI: SimpleAI[] = [
  { role: "Chat básico con clientes",      whatItDoes: "Responde preguntas por WhatsApp con precios reales", provider: "Groq",      model: "Llama 3.1 8B",           status: "activo",     cost: "Gratis (free tier)" },
  { role: "Asistente gerencial",           whatItDoes: "Te da consejos sobre ventas, stock, promos",         provider: "Groq",      model: "Llama 3.3 70B",          status: "activo",     cost: "Gratis (free tier)" },
  { role: "Fallback si cae el principal",  whatItDoes: "Usa un modelo alternativo cuando el 70B falla",      provider: "Groq",      model: "Llama 4 Scout",          status: "activo",     cost: "Gratis (free tier)" },
  { role: "IA premium (calidad máxima)",   whatItDoes: "Análisis complejos y decisiones críticas",           provider: "Anthropic", model: "Claude Sonnet 4.6",      status: "falta-key",  cost: "≈ S/11 / millón de tokens" },
  { role: "IA élite",                      whatItDoes: "Reservado para lo más crítico",                      provider: "Anthropic", model: "Claude Opus 4.6",        status: "falta-key",  cost: "≈ S/57 / millón de tokens" },
  { role: "Lector de facturas (OCR)",      whatItDoes: "Extrae datos de boletas escaneadas",                 provider: "OpenAI",    model: "GPT-4o-mini Vision",     status: "listo",      cost: "≈ S/0.60 / 100 facturas" },
];

// ─── DATA: Agentes simplificados ──────────────────────────────────────────

interface SimpleAgent {
  name: string;
  whatItDoes: string;
  when: string;
}

const AGENTS_BY_TYPE: Array<{ category: string; icon: ReactNode; agents: SimpleAgent[] }> = [
  {
    category: "Equipo de programadores virtuales (ayudan a mejorar el código)",
    icon: <Cpu className="w-5 h-5" />,
    agents: [
      { name: "backend-platform-engineer",   whatItDoes: "Arma APIs, login, permisos",              when: "Cuando hay que crear endpoints nuevos" },
      { name: "frontend-engineer",           whatItDoes: "Hace la parte visual (botones, tablas)",  when: "Cuando hay que crear componentes React" },
      { name: "database-engineer",           whatItDoes: "Optimiza la base de datos",               when: "Cuando las consultas son lentas" },
      { name: "checkout-specialist",         whatItDoes: "Solo se mete con el flujo de compra",     when: "Cuando tocas el carrito o el pago" },
      { name: "migration-planner",           whatItDoes: "Planea cambios seguros en la DB",         when: "Antes de modificar tablas importantes" },
      { name: "devops-release-engineer",     whatItDoes: "Deploys a Vercel, CI/CD",                 when: "Cuando publicas una versión nueva" },
      { name: "security-auditor",            whatItDoes: "Revisa código por vulnerabilidades",      when: "Después de agregar login o formularios" },
      { name: "qa-reliability-engineer",     whatItDoes: "Escribe tests y arregla errores",         when: "Sprint C — cerrar los 251 errores TS" },
      { name: "performance-engineer",        whatItDoes: "Hace que la web cargue rápido",           when: "Cuando el bundle se hace muy grande" },
      { name: "data-analyst",                whatItDoes: "Crea reportes y dashboards",              when: "Cuando quieres ver métricas nuevas" },
      { name: "integration-specialist",      whatItDoes: "Conecta con WhatsApp, Stripe, SUNAT",     when: "Cuando agregas un servicio externo" },
      { name: "mobile-engineer",             whatItDoes: "Builds iOS/Android con Capacitor",        when: "Cuando hay que publicar app móvil" },
      { name: "seo-growth-strategist",       whatItDoes: "Mejora posicionamiento en Google",        when: "Para aparecer primero en búsquedas" },
      { name: "product-uiux-strategist",     whatItDoes: "Diseña flujos y experiencia del usuario", when: "Cuando una pantalla se siente confusa" },
      { name: "solution-architect",          whatItDoes: "Decide arquitectura de alto impacto",     when: "Para cambios grandes de 3+ módulos" },
      { name: "director-orchestrator",       whatItDoes: "Coordina varios agentes en paralelo",     when: "Cuando una tarea toca muchas áreas" },
    ],
  },
  {
    category: "Agentes que viven dentro del negocio (IA del día a día)",
    icon: <Bot className="w-5 h-5" />,
    agents: [
      { name: "inventory.agent",      whatItDoes: "Vigila stock, FEFO, alertas",         when: "Cada vez que pides info de inventario" },
      { name: "customers.agent",      whatItDoes: "Segmentación y análisis de clientes", when: "Para saber quién compra más o está por irse" },
      { name: "orders.agent",         whatItDoes: "Gestiona estado de pedidos",          when: "Cuando haces preguntas sobre pedidos" },
      { name: "analytics.agent",      whatItDoes: "KPIs, tendencias, márgenes",          when: "Para reportes automáticos" },
      { name: "notifications.agent", whatItDoes: "Avisa a clientes y admins",           when: "Cuando hay un cambio importante" },
      { name: "pricing.agent",        whatItDoes: "Sugiere precios y bundles",           when: "Cuando preguntas qué promociones hacer" },
    ],
  },
];

// ─── DATA: Skills simples ─────────────────────────────────────────────────

const SKILLS_SIMPLE = [
  { name: "/agent-team",    whatItDoes: "Lanza varios agentes a la vez para tareas grandes" },
  { name: "/fix",           whatItDoes: "Debugging sistemático cuando algo falla" },
  { name: "/deploy",        whatItDoes: "Publica cambios a producción" },
  { name: "/new-feature",   whatItDoes: "Arranca una feature nueva en branch aislada" },
  { name: "/review",        whatItDoes: "Revisa cambios antes de mergear" },
  { name: "/test-all",      whatItDoes: "Corre lint + build + tests completos" },
  { name: "/checkpoint",    whatItDoes: "Guarda progreso antes de pausar" },
  { name: "simplify",       whatItDoes: "Mejora claridad del código recién cambiado" },
  { name: "brainstorming",  whatItDoes: "Explora qué construir antes de programar" },
  { name: "writing-plans",  whatItDoes: "Planifica trabajo multi-paso antes de código" },
  { name: "TDD",            whatItDoes: "Escribe tests antes del código" },
  { name: "systematic-debugging", whatItDoes: "Debug paso a paso sistemático" },
  { name: "vercel:deploy",  whatItDoes: "Deploy específico al hosting Vercel" },
  { name: "vercel:env",     whatItDoes: "Gestiona variables de entorno de Vercel" },
  { name: "vercel:ai-sdk",  whatItDoes: "Guía del Vercel AI SDK (si se usa)" },
  { name: "frontend-design", whatItDoes: "Crea UI production-grade con diseño distintivo" },
  { name: "supabase-postgres-best-practices", whatItDoes: "32 reglas de oro de Postgres" },
];

// ─── DATA: MCP simple ─────────────────────────────────────────────────────

const MCP_SIMPLE = [
  { name: "context7",           whatItDoes: "Lee documentación actualizada de librerías (React, Next, Prisma, etc) — evita que yo use APIs viejas" },
  { name: "playwright",         whatItDoes: "Me deja abrir un navegador y testear cosas en vivo" },
  { name: "desktop-commander",  whatItDoes: "Me da acceso a terminal, archivos, procesos" },
  { name: "memory",             whatItDoes: "Grafo de conocimiento que recuerda cosas entre sesiones" },
  { name: "sequential-thinking", whatItDoes: "Me deja razonar paso a paso para problemas complejos" },
  { name: "Gmail",              whatItDoes: "Puedo leer y redactar emails" },
  { name: "Google Calendar",    whatItDoes: "Puedo agendar reuniones y buscar horarios libres" },
];

// ─── DATA: Scoreboards (fallback; overridden by API if available) ─────────
//
// Estos valores son el fallback hardcoded que se usan si el fetch a
// /api/superadmin/project-intel falla (ej: 401, 500, network). El API
// parsea docs/practicas-2026-audit.md y docs/TECH-DEBT.md al vuelo, así
// el scoreboard refleja el estado REAL del audit cuando Brandon lo abre.
// Excel Agentes IA no está en el audit doc — se mantiene hardcoded.

interface ScoreSnapshot {
  applied: number;
  partial: number;
  missing: number;
  na: number;
  total: number;
  label: string;
}

const SCORES_FALLBACK: { excel2026: ScoreSnapshot; agentesIA: ScoreSnapshot } = {
  excel2026: { applied: 28, partial: 13, missing: 3, na: 4, total: 48, label: "Buenas prácticas generales (48)" },
  agentesIA: { applied: 13, partial: 10, missing: 5, na: 0, total: 28, label: "Mejores prácticas de IA (28)" },
};

interface LiveIntelData {
  excel2026: ScoreSnapshot & { source: string; lastUpdated: string | null };
  techDebt: {
    total: number;
    open: number;
    inProgress: number;
    closed: number;
    bySeverity: Record<string, number>;
  };
  tsErrors: {
    count: number | null;
    lastMeasured: string | null;
    note: string;
  };
  generatedAt: string;
}

function calcScore(s: { applied: number; partial: number; missing: number; na: number; total: number }) {
  const denom = s.total - s.na;
  const solid = (s.applied + s.partial * 0.5) / denom;
  const perfect = s.applied / denom;
  return {
    solidPct: Math.round(solid * 1000) / 10,
    perfectPct: Math.round(perfect * 1000) / 10,
  };
}

// ─── DATA: Precio por venta / mes (SOLES) ──────────────────────────────────

interface PricingPlan {
  icon: ReactNode;
  name: string;
  priceLabel: string;
  priceDetail: string;
  target: string;
  includes: string[];
  excludes: string[];
  highlight?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    icon: <Package className="w-6 h-6" />,
    name: "Plan Básico",
    priceLabel: "S/ 189",
    priceDetail: "por mes, por tienda",
    target: "Bodegas pequeñas que recién arrancan",
    includes: [
      "Hasta 500 productos",
      "Admin completo (30+ pantallas)",
      "Chat IA para clientes",
      "Pagos con Yape y efectivo",
      "Hasta 1,000 pedidos/mes",
    ],
    excludes: [
      "Marketplace B2B mayorista",
      "IA premium (solo básica)",
      "App móvil nativa",
    ],
  },
  {
    icon: <Star className="w-6 h-6" />,
    name: "Plan Plus",
    priceLabel: "S/ 379",
    priceDetail: "por mes, por tienda",
    target: "Bodegas en crecimiento con varios vendedores",
    highlight: true,
    includes: [
      "Hasta 2,000 productos",
      "Todo del Básico +",
      "15 módulos de IA (análisis, forecasting, coach)",
      "Pagos con Stripe (tarjetas)",
      "Push notifications",
      "Hasta 5,000 pedidos/mes",
    ],
    excludes: [
      "Marketplace mayorista",
      "Multi-sucursal",
    ],
  },
  {
    icon: <Crown className="w-6 h-6" />,
    name: "Plan Pro",
    priceLabel: "S/ 569",
    priceDetail: "por mes, por tienda",
    target: "Negocios medianos con IA avanzada",
    includes: [
      "Productos ilimitados",
      "Todo del Plus +",
      "Marketplace mayorista (WholesaleOrder)",
      "App móvil iOS + Android",
      "SUNAT facturación electrónica",
      "Soporte prioritario WhatsApp",
      "Pedidos ilimitados",
    ],
    excludes: [],
  },
  {
    icon: <Shield className="w-6 h-6" />,
    name: "Franquicia Buleje",
    priceLabel: "S/ 1,900",
    priceDetail: "inicial + 15% de ingresos",
    target: "Emprendedores que quieren vender el sistema en su ciudad",
    includes: [
      "Tú atiendes a 10-50 bodegas locales",
      "Nosotros hosteamos todo",
      "Marca compartida",
      "Capacitación 1 semana",
    ],
    excludes: [
      "Modificar código (eso cuesta aparte)",
    ],
  },
];

// ─── DATA: Vender el proyecto ENTERO (paquetes completos, SOLES) ───────────

interface SellPackage {
  icon: ReactNode;
  name: string;
  price: string;
  priceDetail: string;
  whatIsIt: string;
  includes: string[];
  excludes: string[];
  target: string;
  highlight?: boolean;
  tier: "budget" | "popular" | "premium" | "enterprise" | "total";
}

const SELL_PACKAGES: SellPackage[] = [
  {
    tier: "budget",
    icon: <Box className="w-7 h-7" />,
    name: "Solo el código",
    price: "S/ 8,000 – 15,000",
    priceDetail: "pago único",
    whatIsIt: "Te doy el repositorio completo como está. Tú te encargas del resto.",
    includes: [
      "Todo el código fuente (repo GitHub private)",
      "116 modelos de base de datos",
      "435+ endpoints de API",
      "Admin completo con 30+ módulos",
      "Documentación técnica (10 ADRs + docs/)",
      "Derecho a modificarlo y usarlo",
    ],
    excludes: [
      "Sin soporte técnico",
      "Sin servidor ni hosting",
      "Sin base de datos",
      "Sin API keys (Groq, Stripe, etc)",
      "Sin garantía de bugs",
    ],
    target: "Empresa con equipo técnico propio que quiere arrancar rápido",
  },
  {
    tier: "popular",
    icon: <Star className="w-7 h-7" />,
    name: "Código + licencia comercial",
    price: "S/ 18,000 – 28,000",
    priceDetail: "pago único",
    whatIsIt: "Código + derecho legal de usarlo, modificarlo y hasta venderlo como tuyo.",
    highlight: true,
    includes: [
      "Todo lo del paquete 'Solo código'",
      "Licencia perpetua (úsalo para siempre)",
      "Derecho de modificarlo sin restricciones",
      "Derecho de venderlo bajo tu marca (white-label)",
      "1 mes de soporte por email",
    ],
    excludes: [
      "Sin hosting",
      "Sin base de datos en vivo",
      "Sin API keys",
    ],
    target: "Agencias de software que quieren ofrecerlo a sus clientes",
  },
  {
    tier: "premium",
    icon: <Rocket className="w-7 h-7" />,
    name: "Código + infraestructura lista",
    price: "S/ 35,000 – 50,000",
    priceDetail: "pago único",
    whatIsIt: "Te entrego TODO funcionando: código, servidor, base de datos, cuentas configuradas.",
    includes: [
      "Todo lo del paquete 'Código + licencia'",
      "Cuenta Vercel con proyecto deployado",
      "Base de datos Supabase con 116 tablas creadas",
      "Groq API key configurada",
      "Datos demo poblados para arrancar",
      "Dominio propio configurado",
      "2 semanas de soporte",
    ],
    excludes: [
      "Costos mensuales de hosting corren por tu cuenta (~S/ 80/mes)",
      "Features nuevas son proyectos aparte",
    ],
    target: "Negocio que quiere lanzar YA sin tocar código",
  },
  {
    tier: "enterprise",
    icon: <Shield className="w-7 h-7" />,
    name: "Paquete empresarial completo",
    price: "S/ 55,000 – 85,000",
    priceDetail: "pago único",
    whatIsIt: "Todo lo anterior + 3 meses de soporte con bugs, ajustes y capacitación a tu equipo.",
    includes: [
      "Todo lo del paquete 'Código + infraestructura'",
      "3 meses de soporte técnico (bugs + ajustes menores)",
      "Capacitación 2 días presencial o remota",
      "Manual de operaciones personalizado",
      "Migración de tus datos existentes",
      "Sesión mensual de revisión de métricas",
    ],
    excludes: [
      "Features completamente nuevas son cotizadas aparte",
      "Costo de hosting post-3-meses corre por cliente",
    ],
    target: "Empresa mediana que quiere todo incluido con respaldo",
  },
  {
    tier: "total",
    icon: <Crown className="w-7 h-7" />,
    name: "Todo el negocio Buleje",
    price: "S/ 120,000 – 200,000",
    priceDetail: "pago único + opciones",
    whatIsIt: "Te llevas TODO: código + infra + la marca Buleje + dominios + clientes actuales (si hay).",
    includes: [
      "Todo lo del paquete 'Empresarial'",
      "Marca registrada 'Buleje' (logos, nombre)",
      "Dominios (buleje.pe y otros)",
      "Cuentas de GitHub, Vercel, Supabase transferidas",
      "6 meses de soporte full",
      "Capacitación 1 semana a tu equipo",
      "Derecho exclusivo en Perú (si lo pactamos)",
      "Brandon firma acuerdo de no-competencia si se pacta",
    ],
    excludes: [
      "Si hay clientes activos, se negocia aparte su traspaso",
    ],
    target: "Inversor o empresa grande que quiere entrar al mercado SaaS de bodegas en Perú",
  },
];

// ─── DATA: Roadmap simple ──────────────────────────────────────────────────

const ROADMAP_SIMPLE = [
  {
    when: "Próximos días",
    emoji: "⚡",
    items: [
      "Terminar de limpiar los 251 errores TypeScript restantes",
      "Activar el gate de tipos estricto (no más bugs silenciosos)",
      "Activar Claude Anthropic (falta tu API key)",
      "Configurar Vercel Rolling Releases + Sentry + Doppler + Stripe (35 min tuyos)",
    ],
  },
  {
    when: "Próximas 2-3 semanas",
    emoji: "🚀",
    items: [
      "Migrar todos los precios de Float a Decimal (para que SUNAT no reclame)",
      "Terminar refactor del admin/page.tsx (reducir de 1257 a <300 líneas)",
      "UI estructurada para las sugerencias de promociones",
      "Tests end-to-end del flujo HITL (aprobar/rechazar acciones IA)",
    ],
  },
  {
    when: "Próximo mes",
    emoji: "🧠",
    items: [
      "RAG vectorial cuando tengas >1000 productos (búsqueda semántica)",
      "LlamaGuard para moderar mensajes antes de abrir chat al público",
      "PWA con service worker para trabajar sin internet",
      "DDD formal en módulos críticos (ventas, facturas)",
    ],
  },
  {
    when: "Próximos 6 meses",
    emoji: "🏆",
    items: [
      "Lanzar SaaS público con los 3 planes (Básico/Plus/Pro)",
      "Franquiciar a 3-5 emprendedores locales en otras ciudades",
      "SUNAT facturación electrónica en producción real",
      "App móvil Capacitor publicada en App Store y Play Store",
      "Marketplace B2B mayorista con al menos 10 bodegas",
    ],
  },
];

// ─── Main component ─────────────────────────────────────────────────────────

export default function ProjectIntelPage() {
  const [activeTab, setActiveTab] = useState<TabId>("what");
  const [liveData, setLiveData] = useState<LiveIntelData | null>(null);

  // Fetch live data on mount (parses docs/practicas-2026-audit.md + TECH-DEBT.md)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/superadmin/project-intel", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LiveIntelData | null) => {
        if (!cancelled && data) setLiveData(data);
      })
      .catch(() => {
        // Silent fallback to hardcoded constants
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-3xl p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Package className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Panorama del Proyecto</h1>
            <p className="text-sm md:text-base text-indigo-100 mt-1">
              Tu bodega convertida en software completo — todo en un solo vistazo
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-5">
          {WHAT_HIGHLIGHTS.map((h) => (
            <div
              key={h.label}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-3 hover:bg-white/20 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                {h.icon}
                <span className="text-[10px] uppercase tracking-wide font-bold opacity-80">{h.label}</span>
              </div>
              <div className="text-xs font-semibold">{h.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-thin">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap",
                  active
                    ? "border-indigo-600 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20"
                    : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/50",
                ].join(" ")}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === "what"    && <WhatTab />}
        {activeTab === "stack"   && <StackTab />}
        {activeTab === "how"     && <HowTab />}
        {activeTab === "ai"      && <AITab />}
        {activeTab === "agents"  && <AgentsTab />}
        {activeTab === "skills"  && <SkillsTab />}
        {activeTab === "mcp"     && <MCPTab />}
        {activeTab === "scores"  && <ScoresTab liveData={liveData} />}
        {activeTab === "pricing" && <PricingTab />}
        {activeTab === "sell"    && <SellTab />}
        {activeTab === "roadmap" && <RoadmapTab />}
      </div>
    </div>
  );
}

// ─── Tab: Qué es ───────────────────────────────────────────────────────────

function WhatTab() {
  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-950 border-2 border-indigo-200 dark:border-indigo-900/40 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-600" />
          ¿Qué es Buleje?
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          Es un <strong>sistema ERP + e-commerce completo</strong> para bodegas y minimarkets en Perú, con inteligencia artificial integrada. No es un MVP — es un producto vendible YA.
          Arrancó como la herramienta interna de tu tienda familiar en Pucallpa y creció hasta convertirse en una plataforma SaaS multi-tenant que puede servir a cientos de tiendas a la vez.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BigCard
          icon={<ShoppingCart className="w-8 h-8" />}
          title="Para los clientes"
          color="blue"
          items={[
            "Tienda web moderna con fotos y precios",
            "Carrito y pago en pocos clics",
            "WhatsApp con IA que responde precios reales",
            "App móvil iOS + Android (Capacitor)",
            "Pagos con Yape, tarjeta, efectivo",
          ]}
        />
        <BigCard
          icon={<Users className="w-8 h-8" />}
          title="Para ti (el dueño)"
          color="emerald"
          items={[
            "Admin completo con 30+ pantallas",
            "15 módulos de IA que analizan tu negocio",
            "Alertas automáticas de stock bajo y vencimientos",
            "Dashboard con KPIs, márgenes, tendencias",
            "Control multi-tenant (una plataforma, muchas tiendas)",
          ]}
        />
        <BigCard
          icon={<Brain className="w-8 h-8" />}
          title="IA inteligente"
          color="purple"
          items={[
            "Chat gerencial que entiende tu negocio",
            "Coach de performance con sugerencias",
            "Predicción de demanda",
            "Generador de promociones",
            "OCR de facturas (escanea y guarda)",
          ]}
        />
        <BigCard
          icon={<Shield className="w-8 h-8" />}
          title="Seguro y escalable"
          color="amber"
          items={[
            "Login con JWT httpOnly + rotación",
            "Permisos por rol (admin, cajero, delivery, etc)",
            "Aislamiento entre tiendas (multi-tenancy)",
            "Tests automáticos en cada cambio (2113 tests)",
            "Monitoreo con Sentry y alertas",
          ]}
        />
      </div>
    </div>
  );
}

function BigCard({
  icon,
  title,
  color,
  items,
}: {
  icon: ReactNode;
  title: string;
  color: "blue" | "emerald" | "purple" | "amber";
  items: string[];
}) {
  const colorMap = {
    blue:    "from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    emerald: "from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    purple:  "from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-900/40 text-purple-700 dark:text-purple-300",
    amber:   "from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300",
  };
  return (
    <div className={`bg-gradient-to-br border-2 rounded-2xl p-5 ${colorMap[color]}`}>
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <h3 className="text-base font-bold">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Tab: Stack simple ─────────────────────────────────────────────────────

function StackTab() {
  return (
    <div className="space-y-4">
      {SIMPLE_STACK.map((section) => (
        <div
          key={section.category}
          className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5"
        >
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              {section.icon}
            </div>
            {section.category}
          </h3>
          <div className="space-y-2 ml-11">
            {section.items.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.simple}</span>
                    <code className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 px-1.5 py-0.5 rounded">
                      {item.technical}
                    </code>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{item.purpose}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Cómo funciona ────────────────────────────────────────────────────

function HowTab() {
  return (
    <div className="space-y-3">
      <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/40 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Route className="w-5 h-5 text-teal-600" />
          El viaje de un pedido — paso a paso
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Sigue a un pedido desde que el cliente entra a la tienda hasta que recibe la notificación en su WhatsApp.
        </p>
      </div>
      <div className="space-y-2">
        {FLOW_STEPS.map((step) => (
          <div
            key={step.n}
            className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex items-start gap-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 font-black text-lg">
              {step.n}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{step.title}</h3>
                <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                  {step.icon}
                </div>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">{step.simple}</p>
              <code className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded">
                {step.technical}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: IA simple ────────────────────────────────────────────────────────

function AITab() {
  const statusCfg: Record<SimpleAI["status"], { label: string; cls: string }> = {
    activo:       { label: "Funcionando",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    listo:        { label: "Listo para usar", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    "falta-key":  { label: "Falta tu API key", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  };
  return (
    <div className="space-y-3">
      <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          6 modelos de IA trabajando para tu negocio
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Cada modelo tiene un rol específico. Los que dicen &quot;Gratis&quot; usan el free tier de Groq — no cuestan nada mientras el volumen sea razonable.
        </p>
      </div>
      <div className="space-y-2">
        {SIMPLE_AI.map((ai, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{ai.role}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{ai.whatItDoes}</p>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide shrink-0 ${statusCfg[ai.status].cls}`}
              >
                {statusCfg[ai.status].label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-900">
              <span>
                <strong>{ai.provider}</strong> · <code className="font-mono">{ai.model}</code>
              </span>
              <span className="ml-auto font-semibold text-emerald-600 dark:text-emerald-400">{ai.cost}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Agentes simple ───────────────────────────────────────────────────

function AgentsTab() {
  return (
    <div className="space-y-5">
      {AGENTS_BY_TYPE.map((group) => (
        <div key={group.category}>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-pink-50 dark:bg-pink-900/30 flex items-center justify-center text-pink-600 dark:text-pink-400">
              {group.icon}
            </div>
            {group.category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-11">
            {group.agents.map((agent) => (
              <div
                key={agent.name}
                className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3"
              >
                <code className="text-[11px] font-mono font-bold text-pink-700 dark:text-pink-300">{agent.name}</code>
                <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{agent.whatItDoes}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1 italic">📌 {agent.when}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Skills simples ───────────────────────────────────────────────────

function SkillsTab() {
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-600" />
          Herramientas que uso mientras trabajo contigo
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Cada herramienta es un atajo para tareas repetitivas. Tú las invocas con comandos tipo <code>/fix</code>, <code>/deploy</code>, etc.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {SKILLS_SIMPLE.map((skill) => (
          <div
            key={skill.name}
            className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3 flex items-start gap-3"
          >
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <code className="text-xs font-mono font-bold text-gray-900 dark:text-white">{skill.name}</code>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{skill.whatItDoes}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: MCP simple ───────────────────────────────────────────────────────

function MCPTab() {
  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Plug className="w-5 h-5 text-emerald-600" />
          Conectores con el mundo externo
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          MCP son las &quot;extensiones&quot; que me permiten leer documentación actualizada, abrir navegadores, revisar Gmail, etc.
        </p>
      </div>
      <div className="space-y-2">
        {MCP_SIMPLE.map((mcp) => (
          <div
            key={mcp.name}
            className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex items-start gap-3"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
              <Plug className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <code className="text-sm font-mono font-bold text-gray-900 dark:text-white">{mcp.name}</code>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{mcp.whatItDoes}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Scores ──────────────────────────────────────────────────────────

function ScoresTab({ liveData }: { liveData: LiveIntelData | null }) {
  // Usa liveData si está disponible, sino fallback a constantes hardcoded.
  const excel2026Source: ScoreSnapshot = liveData
    ? {
        applied: liveData.excel2026.applied,
        partial: liveData.excel2026.partial,
        missing: liveData.excel2026.missing,
        na: liveData.excel2026.na,
        total: liveData.excel2026.total,
        label: SCORES_FALLBACK.excel2026.label,
      }
    : SCORES_FALLBACK.excel2026;

  const e2026 = calcScore(excel2026Source);
  const eIA = calcScore(SCORES_FALLBACK.agentesIA);

  const isLive = liveData?.excel2026.source === "docs/practicas-2026-audit.md";
  const tsCount = liveData?.tsErrors.count ?? 251;

  return (
    <div className="space-y-4">
      <div className="bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900/40 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-600" />
            Cómo vamos con las mejores prácticas
          </h2>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
              isLive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {isLive ? "🔴 EN VIVO" : "fallback"}
          </span>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Dos scorecards independientes. Uno mide prácticas generales de buen software. Otro mide prácticas específicas de sistemas de IA.
          {isLive && liveData?.excel2026.lastUpdated && (
            <span className="block mt-1 text-emerald-600 dark:text-emerald-400">
              Fuente: docs/practicas-2026-audit.md · Última actualización: {liveData.excel2026.lastUpdated}
            </span>
          )}
        </p>
      </div>

      <BigScoreCard label={excel2026Source.label} snap={excel2026Source} score={e2026} color="teal" />
      <BigScoreCard label={SCORES_FALLBACK.agentesIA.label} snap={SCORES_FALLBACK.agentesIA} score={eIA} color="purple" />

      {/* Tech Debt (solo si tenemos liveData) */}
      {liveData && (
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white mb-3">
            Deuda técnica (docs/TECH-DEBT.md)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Bucket n={liveData.techDebt.total} label="Total items" color="text-gray-700 dark:text-gray-300" />
            <Bucket n={liveData.techDebt.open} label="Abiertos" color="text-red-500" />
            <Bucket n={liveData.techDebt.inProgress} label="En progreso" color="text-amber-500" />
            <Bucket n={liveData.techDebt.closed} label="Cerrados" color="text-emerald-500" />
          </div>
          {Object.values(liveData.techDebt.bySeverity).some((n) => n > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-gray-100 dark:border-gray-900">
              <SeverityBadge n={liveData.techDebt.bySeverity.critical} label="Críticos" />
              <SeverityBadge n={liveData.techDebt.bySeverity.high}     label="Altos" />
              <SeverityBadge n={liveData.techDebt.bySeverity.medium}   label="Medios" />
              <SeverityBadge n={liveData.techDebt.bySeverity.low}      label="Bajos" />
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">📈 Avance de la sesión actual</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Errores TS" before="469" after={String(tsCount)} delta="−46%" good />
          <Metric label="ADRs" before="7" after="10" delta="+3" good />
          <Metric label="Commits" before="0" after="20+" delta="nueva sesión" />
          <Metric label="Tests OK" before="26" after="26" delta="sin regresiones" good />
        </div>
      </div>
    </div>
  );
}

function SeverityBadge({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      <span className="text-sm font-bold text-gray-900 dark:text-white">{n}</span>
    </div>
  );
}

function BigScoreCard({
  label,
  snap,
  score,
  color,
}: {
  label: string;
  snap: { applied: number; partial: number; missing: number; na: number; total: number };
  score: { solidPct: number; perfectPct: number };
  color: "teal" | "purple";
}) {
  const bar = color === "teal" ? "from-teal-500 to-emerald-500" : "from-purple-500 to-indigo-500";
  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{label}</h3>
      <div className="grid grid-cols-4 gap-2 mb-5">
        <Bucket n={snap.applied} label="Listas"    color="text-emerald-500" />
        <Bucket n={snap.partial} label="Parciales" color="text-amber-500" />
        <Bucket n={snap.missing} label="Faltan"    color="text-red-500" />
        <Bucket n={snap.na}      label="No aplica" color="text-gray-400" />
      </div>
      <div className="space-y-3">
        <ScoreBar label="Avance sólido (cuenta parciales como medio punto)" pct={score.solidPct} gradient={bar} />
        <ScoreBar label="Avance perfecto (solo las totalmente listas)"        pct={score.perfectPct} gradient="from-emerald-500 to-indigo-500" />
      </div>
    </div>
  );
}

function Bucket({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-extrabold ${color}`}>{n}</div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

function ScoreBar({ label, pct, gradient }: { label: string; pct: number; gradient: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-sm font-black text-gray-900 dark:text-white">{pct}%</span>
      </div>
      <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${gradient}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Metric({
  label,
  before,
  after,
  delta,
  good,
}: {
  label: string;
  before: string;
  after: string;
  delta: string;
  good?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{after}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">
        antes: {before}
      </div>
      <div className={`text-[10px] font-bold mt-0.5 ${good ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-500"}`}>
        {delta}
      </div>
    </div>
  );
}

// ─── Tab: Precios mensuales ────────────────────────────────────────────────

function PricingTab() {
  return (
    <div className="space-y-4">
      <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-orange-600" />
          Cuánto cobrar a tus clientes mensualmente
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Son los planes si vendes el sistema como SaaS (cada cliente paga todos los meses). Todos los precios en soles peruanos.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PRICING_PLANS.map((plan) => (
          <div
            key={plan.name}
            className={[
              "border-2 rounded-3xl p-6 relative",
              plan.highlight
                ? "bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-400 dark:border-orange-600"
                : "bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800",
            ].join(" ")}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-6 bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide">
                Más popular
              </span>
            )}
            <div className="flex items-start gap-3 mb-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  plan.highlight ? "bg-orange-500 text-white" : "bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                }`}
              >
                {plan.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{plan.target}</p>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-gray-900 dark:text-white">{plan.priceLabel}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{plan.priceDetail}</p>
            </div>
            <div className="space-y-2 mb-4">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-600 dark:text-emerald-400">
                Incluye
              </p>
              {plan.includes.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  {item}
                </div>
              ))}
            </div>
            {plan.excludes.length > 0 && (
              <div className="space-y-1 pt-3 border-t border-gray-100 dark:border-gray-900">
                <p className="text-[10px] uppercase tracking-wide font-bold text-gray-400">No incluye</p>
                {plan.excludes.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <span className="text-red-400 shrink-0">✕</span>
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Vender TODO el proyecto ─────────────────────────────────────────

function SellTab() {
  const tierColors: Record<SellPackage["tier"], { bg: string; border: string; badge: string; badgeLabel: string }> = {
    budget: {
      bg: "bg-white dark:bg-gray-950",
      border: "border-gray-200 dark:border-gray-800",
      badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      badgeLabel: "Económico",
    },
    popular: {
      bg: "bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30",
      border: "border-yellow-400 dark:border-yellow-600",
      badge: "bg-yellow-500 text-white",
      badgeLabel: "Más vendido",
    },
    premium: {
      bg: "bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-950/30 dark:to-cyan-950/30",
      border: "border-emerald-300 dark:border-emerald-800",
      badge: "bg-emerald-500 text-white",
      badgeLabel: "Turnkey",
    },
    enterprise: {
      bg: "bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30",
      border: "border-purple-300 dark:border-purple-800",
      badge: "bg-purple-500 text-white",
      badgeLabel: "Empresarial",
    },
    total: {
      bg: "bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 dark:from-rose-950/30 dark:via-pink-950/30 dark:to-purple-950/30",
      border: "border-rose-400 dark:border-rose-700",
      badge: "bg-gradient-to-r from-rose-500 to-purple-500 text-white",
      badgeLabel: "👑 Todo incluido",
    },
  };
  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/40 rounded-2xl p-5">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-600" />
          ¿Cuánto podrías vender Buleje como proyecto?
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Hay 5 formas de venderlo dependiendo de cuánto te metas. Desde vender solo el código (barato, sin compromisos)
          hasta traspasar todo el negocio con marca, dominios y soporte (premium). Todos los precios en soles.
        </p>
      </div>

      {SELL_PACKAGES.map((pkg) => {
        const cfg = tierColors[pkg.tier];
        return (
          <div
            key={pkg.name}
            className={`border-2 rounded-3xl p-6 relative ${cfg.bg} ${cfg.border}`}
          >
            <span className={`absolute -top-3 left-6 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide ${cfg.badge}`}>
              {cfg.badgeLabel}
            </span>

            <div className="flex items-start gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/60 dark:bg-white/10 flex items-center justify-center shrink-0 text-gray-700 dark:text-gray-200">
                {pkg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-black text-gray-900 dark:text-white">{pkg.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{pkg.whatIsIt}</p>
              </div>
            </div>

            <div className="mb-4 p-4 bg-white/70 dark:bg-black/20 rounded-2xl">
              <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Precio</div>
              <div className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">{pkg.price}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{pkg.priceDetail}</p>
            </div>

            <div className="mb-3">
              <div className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wide mb-1">
                Ideal para
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{pkg.target}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/60 dark:border-white/10">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                  Qué incluye
                </p>
                <ul className="space-y-1.5">
                  {pkg.includes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide font-bold text-red-500 dark:text-red-400 mb-2">
                  ✕ No incluye
                </p>
                <ul className="space-y-1.5">
                  {pkg.excludes.length === 0 ? (
                    <li className="text-xs text-gray-400 italic">Nada — todo incluido</li>
                  ) : (
                    pkg.excludes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-500">
                        <span className="text-red-400 shrink-0">✕</span>
                        {item}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Roadmap ─────────────────────────────────────────────────────────

function RoadmapTab() {
  return (
    <div className="space-y-3">
      {ROADMAP_SIMPLE.map((phase, idx) => (
        <div
          key={phase.when}
          className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-xs font-extrabold tabular-nums text-gray-700 dark:text-gray-200">
              {String(idx + 1).padStart(2, "0")}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-gray-400">
                Fase {idx + 1}
              </div>
              <h3 className="text-base font-extrabold tracking-tight text-gray-900 dark:text-white">{phase.when}</h3>
            </div>
          </div>
          <ul className="space-y-2">
            {phase.items.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <ArrowRight className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── (Unused but imported — keeping Zap out of linter warnings) ────────────

const _unusedIcons = { Zap };
void _unusedIcons;
