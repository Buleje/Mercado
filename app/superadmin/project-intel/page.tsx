"use client";

/**
 * /superadmin/project-intel
 *
 * Panorama completo del proyecto — un solo lugar donde Brandon ve:
 *   1. Stack de tecnologías
 *   2. Arquitectura en capas
 *   3. IA y modelos usados (Groq, Anthropic, router tiers)
 *   4. Agentes (Claude Code + dominios internos)
 *   5. Skills disponibles
 *   6. MCP servers
 *   7. Implementaciones (Excel 2026 + Excel Agentes IA)
 *   8. Avance / scores
 *   9. Modelo de negocio y precio de venta
 *  10. Roadmap
 *
 * Los datos son constantes hardcodeadas (no SSR fetching) porque son
 * metadata del proyecto, no estado de runtime. Si Brandon quiere que
 * algún dato sea dinámico (p.ej. score leyendo docs/practicas-2026-audit.md),
 * se migra a un API route en una sesión posterior.
 */

import { useState, type ReactNode } from "react";
import {
  Layers,
  Cpu,
  Bot,
  Sparkles,
  Plug,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Map,
  Code2,
  Brain,
  Zap,
  Package,
} from "lucide-react";

// ─── Tabs definition ────────────────────────────────────────────────────────

type TabId =
  | "stack"
  | "arch"
  | "ai"
  | "agents"
  | "skills"
  | "mcp"
  | "impl"
  | "scores"
  | "business"
  | "roadmap";

interface TabDef {
  id: TabId;
  label: string;
  icon: ReactNode;
  count?: number;
}

const TABS: TabDef[] = [
  { id: "stack",    label: "Stack",         icon: <Code2 className="w-4 h-4" />,        count: 28 },
  { id: "arch",     label: "Arquitectura",  icon: <Layers className="w-4 h-4" />,       count: 11 },
  { id: "ai",       label: "IA & Modelos",  icon: <Brain className="w-4 h-4" />,        count: 8 },
  { id: "agents",   label: "Agentes",       icon: <Bot className="w-4 h-4" />,          count: 25 },
  { id: "skills",   label: "Skills",        icon: <Sparkles className="w-4 h-4" />,     count: 34 },
  { id: "mcp",      label: "MCP Servers",   icon: <Plug className="w-4 h-4" />,         count: 7 },
  { id: "impl",     label: "Implementado",  icon: <CheckCircle2 className="w-4 h-4" />, count: 48 },
  { id: "scores",   label: "Avance",        icon: <TrendingUp className="w-4 h-4" />,   count: 2 },
  { id: "business", label: "Negocio",       icon: <DollarSign className="w-4 h-4" />,   count: 5 },
  { id: "roadmap",  label: "Roadmap",       icon: <Map className="w-4 h-4" />,          count: 4 },
];

// ─── DATA: Tech Stack ───────────────────────────────────────────────────────

interface StackItem {
  category: string;
  name: string;
  version: string;
  purpose: string;
}

const STACK: StackItem[] = [
  { category: "Framework",     name: "Next.js",        version: "16",      purpose: "App Router, Turbopack, Server Components" },
  { category: "Framework",     name: "React",          version: "19",      purpose: "UI library con Actions y Suspense" },
  { category: "Framework",     name: "TypeScript",     version: "5.x",     purpose: "Tipado estricto (251 errores residuales, ver TD-012)" },
  { category: "Styling",       name: "Tailwind CSS",   version: "4",       purpose: "Utility-first + design tokens" },
  { category: "Styling",       name: "Framer Motion",  version: "12",      purpose: "Animaciones declarativas" },
  { category: "Styling",       name: "GSAP",           version: "3",       purpose: "Timeline animations storefront" },
  { category: "DB",            name: "Prisma",         version: "7.4.2",   purpose: "ORM con PrismaPg adapter" },
  { category: "DB",            name: "Supabase",       version: "—",       purpose: "PostgreSQL pooler + IPv6 direct" },
  { category: "DB",            name: "Redis",          version: "opc.",    purpose: "Cache distribuido (lib/cache.ts híbrido)" },
  { category: "Validation",    name: "Zod",            version: "4",       purpose: "safeParse() en cada endpoint" },
  { category: "Queue",         name: "BullMQ",         version: "5.73",    purpose: "Worker queues + domain events (ADR 003)" },
  { category: "AI/LLM",        name: "Groq",           version: "—",       purpose: "Llama 3.1/3.3/4-scout (free tier)" },
  { category: "AI/LLM",        name: "Anthropic",      version: "stub",    purpose: "Claude 4.6 family (pendiente ANTHROPIC_API_KEY)" },
  { category: "AI/LLM",        name: "OpenAI",         version: "opc.",    purpose: "OCR Vision (ocr/invoice)" },
  { category: "Payments",      name: "Stripe",         version: "placeholder", purpose: "No activo hasta rotar keys reales" },
  { category: "Payments",      name: "MercadoPago",    version: "—",       purpose: "Pagos locales Perú" },
  { category: "Auth",          name: "JWT httpOnly",   version: "—",       purpose: "bsm-admin-sess + rotación" },
  { category: "Auth",          name: "RBAC",           version: "—",       purpose: "26 recursos × 6 roles (lib/auth/role-permissions.ts)" },
  { category: "Observability", name: "Sentry",         version: "3 capas", purpose: "client + server + edge configs" },
  { category: "Observability", name: "@vercel/otel",   version: "—",       purpose: "OpenTelemetry tracing" },
  { category: "Testing",       name: "Vitest",         version: "4",       purpose: "Unit tests (26 propios + 2113 totales)" },
  { category: "Testing",       name: "Playwright",     version: "—",       purpose: "E2E tests" },
  { category: "Testing",       name: "k6",             version: "—",       purpose: "Load tests" },
  { category: "Mobile",        name: "Capacitor",      version: "—",       purpose: "iOS/Android build desde web" },
  { category: "Docs",          name: "Storybook",      version: "—",       purpose: "Component library" },
  { category: "Docs",          name: "OpenAPI",        version: "generado", purpose: "Zod → OpenAPI spec" },
  { category: "CI/CD",         name: "GitHub Actions", version: "—",       purpose: "CI + release-please" },
  { category: "CI/CD",         name: "Vercel",         version: "Hobby",   purpose: "Auto-deploy + Fluid Compute" },
];

// ─── DATA: Architecture layers ──────────────────────────────────────────────

interface ArchLayer {
  layer: string;
  responsibility: string;
  files: string;
  example: string;
}

const ARCH: ArchLayer[] = [
  { layer: "Routing",           responsibility: "Next.js App Router + middleware (proxy.ts)", files: "app/**, middleware.ts, proxy.ts (470 líneas)",     example: "/admin, /api/v1/*, /t/{slug}/*" },
  { layer: "Auth & Tenant",     responsibility: "JWT httpOnly + dual tenant resolution",     files: "lib/auth/, lib/superadmin-session.ts",             example: "requireAdmin() + active-tenant cookie" },
  { layer: "Route handlers",    responsibility: "Validación Zod + delegación a DB classes",  files: "app/api/**/route.ts (~435 archivos)",              example: "POST /api/orders → OrdersDB.create" },
  { layer: "DB classes",        responsibility: "Business logic + Prisma queries",           files: "lib/db/*.db.ts (25 clases)",                       example: "ProductsDB, OrdersDB, CustomersDB" },
  { layer: "Prisma",            responsibility: "ORM + migrations + schema (116 modelos)",   files: "prisma/schema.prisma + lib/prisma.ts",             example: "PrismaPg adapter max=5" },
  { layer: "Contexts",          responsibility: "Client state + BroadcastChannel multi-tab", files: "contexts/*.tsx (10 providers)",                    example: "cart, customer, settings, theme" },
  { layer: "Agent system",      responsibility: "Multi-agent orchestration + tool calling",  files: "lib/agents/ (orchestrator 506 líneas + 6 domains)", example: "inventory, customers, orders, pricing..." },
  { layer: "LLM layer",         responsibility: "Router tiers + providers abstraction",      files: "lib/llm-router.ts, lib/llm-providers/",            example: "callLLM('balanced', ...) → Groq + Anthropic" },
  { layer: "Queue",             responsibility: "BullMQ + domain events async",              files: "lib/queue/, lib/domain-events/",                   example: "VentaCompletada, StockBajo, FacturaEmitida" },
  { layer: "Cache",             responsibility: "Memory + Redis write-through",              files: "lib/cache.ts",                                     example: "getOrSet(), invalidateByPrefix()" },
  { layer: "Observability",     responsibility: "Structured logs + traceId + Sentry + OTEL", files: "lib/logger.ts, sentry.*.config.ts, instrumentation.ts", example: "logger.info({ requestId, tenantId })" },
];

// ─── DATA: AI models + router tiers ─────────────────────────────────────────

interface AIEntry {
  tier: "cheap" | "balanced" | "premium" | "specialized";
  provider: string;
  model: string;
  usage: string;
  status: "active" | "ready" | "stub" | "pending-key";
}

const AI_MODELS: AIEntry[] = [
  { tier: "cheap",       provider: "Groq",      model: "llama-3.1-8b-instant",               usage: "Chat clientes, WhatsApp auto-reply, voice-interpret, OCR simple", status: "active" },
  { tier: "balanced",    provider: "Groq",      model: "llama-3.3-70b-versatile",            usage: "ai-assistant, coach, promotions, demand-prediction",               status: "active" },
  { tier: "premium",     provider: "Groq",      model: "meta-llama/llama-4-scout-17b-16e",   usage: "Fallback cuando balanced cae. Soporta streaming+tools",            status: "active" },
  { tier: "cheap",       provider: "Anthropic", model: "claude-haiku-4-5-20251001",          usage: "Futuro tier cheap de alta calidad",                                status: "pending-key" },
  { tier: "balanced",    provider: "Anthropic", model: "claude-sonnet-4-6",                  usage: "Futuro tier balanced calidad+",                                    status: "pending-key" },
  { tier: "premium",     provider: "Anthropic", model: "claude-opus-4-6",                    usage: "Decisiones críticas (futuro)",                                     status: "pending-key" },
  { tier: "specialized", provider: "OpenAI",    model: "gpt-4o-mini",                        usage: "OCR Vision (ocr/invoice)",                                         status: "ready" },
  { tier: "specialized", provider: "Google",    model: "gemini-2.0-flash",                   usage: "Fallback legacy en lib/ai-config (marcado deprecated)",            status: "ready" },
];

// ─── DATA: Agents (Claude Code user agents + internal domain agents) ────────

interface AgentEntry {
  kind: "claude-code" | "internal-domain" | "team-orchestrator";
  name: string;
  purpose: string;
  status: "active" | "ready";
}

const AGENTS: AgentEntry[] = [
  // Claude Code user-defined agents (for coding sessions)
  { kind: "claude-code",       name: "backend-platform-engineer",     purpose: "API routes, auth, RBAC, lib/db",                        status: "active" },
  { kind: "claude-code",       name: "frontend-engineer",             purpose: "React components, state, UI",                           status: "active" },
  { kind: "claude-code",       name: "checkout-specialist",           purpose: "CheckoutModal + flujo de pago (exclusivo)",             status: "active" },
  { kind: "claude-code",       name: "database-engineer",             purpose: "Prisma queries, índices, migrations",                   status: "active" },
  { kind: "claude-code",       name: "migration-planner",             purpose: "Plan seguro de migraciones con rollback",               status: "active" },
  { kind: "claude-code",       name: "devops-release-engineer",       purpose: "Vercel deploy, CI/CD, env vars",                        status: "active" },
  { kind: "claude-code",       name: "security-auditor",              purpose: "OWASP review post-edit",                                status: "active" },
  { kind: "claude-code",       name: "qa-reliability-engineer",       purpose: "Testing + Sprint C waves (TS errors)",                  status: "active" },
  { kind: "claude-code",       name: "performance-engineer",          purpose: "Bundle, Core Web Vitals, cache",                        status: "active" },
  { kind: "claude-code",       name: "data-analyst",                  purpose: "KPIs, dashboards, forecasting",                         status: "active" },
  { kind: "claude-code",       name: "integration-specialist",        purpose: "WhatsApp, RENIEC, Stripe, SUNAT, email",                status: "active" },
  { kind: "claude-code",       name: "mobile-engineer",               purpose: "Capacitor, iOS/Android, plugins nativos",               status: "active" },
  { kind: "claude-code",       name: "seo-growth-strategist",         purpose: "SEO, OG, JSON-LD, sitemap",                             status: "active" },
  { kind: "claude-code",       name: "product-uiux-strategist",       purpose: "User flows, visual hierarchy",                          status: "active" },
  { kind: "claude-code",       name: "solution-architect",            purpose: "Decisiones arquitectónicas de alto impacto",            status: "active" },
  { kind: "claude-code",       name: "director-orchestrator",         purpose: "Coordina múltiples agentes en tareas complejas",        status: "active" },
  // Internal domain agents (runtime multi-agent system)
  { kind: "internal-domain",   name: "inventory.agent",               purpose: "Stock, FEFO, reorder, stock valuation (437 líneas)",    status: "active" },
  { kind: "internal-domain",   name: "customers.agent",               purpose: "Segmentation, churn risk, customer 360 (445 líneas)",   status: "active" },
  { kind: "internal-domain",   name: "orders.agent",                  purpose: "Pending, delivery schedule, returns (355 líneas)",      status: "active" },
  { kind: "internal-domain",   name: "analytics.agent",               purpose: "Daily KPIs, margin, trends (515 líneas)",               status: "active" },
  { kind: "internal-domain",   name: "notifications.agent",           purpose: "Order updates, stock alerts, promotions (448 líneas)",  status: "active" },
  { kind: "internal-domain",   name: "pricing.agent",                 purpose: "Margin check, bundles, price history (448 líneas)",     status: "active" },
  // Team orchestrators (meta-agents)
  { kind: "team-orchestrator", name: "/agent-team",                   purpose: "Lanza equipos de agentes para tareas complejas 2+ áreas", status: "active" },
  { kind: "team-orchestrator", name: "director-orchestrator (team)",  purpose: "Diagnostica + despacha agentes + entrega resultado",     status: "active" },
  { kind: "team-orchestrator", name: "Orchestrator core (lib/agents/)", purpose: "Priority queue + circuit breaker + max=10 concurrent", status: "active" },
];

// ─── DATA: Skills installed ─────────────────────────────────────────────────

interface SkillEntry {
  origin: string;
  name: string;
  purpose: string;
}

const SKILLS: SkillEntry[] = [
  { origin: "claude-code:core",  name: "update-config",              purpose: "Settings.json + hooks config" },
  { origin: "claude-code:core",  name: "keybindings-help",           purpose: "~/.claude/keybindings.json" },
  { origin: "claude-code:core",  name: "simplify",                   purpose: "Revisa código cambiado y mejora claridad" },
  { origin: "claude-code:core",  name: "loop",                       purpose: "Ejecuta comando en intervalo recurrente" },
  { origin: "claude-code:core",  name: "schedule",                   purpose: "Crea triggers cron para agentes" },
  { origin: "claude-code:core",  name: "claude-api",                 purpose: "Build apps con Claude API / Agent SDK" },
  { origin: "project:local",     name: "/agent-team",                purpose: "Agent Team para Bodega San Martín" },
  { origin: "project:local",     name: "/checkpoint",                purpose: "Guardar estado de progreso" },
  { origin: "project:local",     name: "/deploy",                    purpose: "Deploy completo a Vercel" },
  { origin: "project:local",     name: "/fix",                       purpose: "Protocolo de debugging sistemático" },
  { origin: "project:local",     name: "/new-feature",               purpose: "Nueva feature con branch aislada" },
  { origin: "project:local",     name: "/review",                    purpose: "Revisar cambios del branch" },
  { origin: "project:local",     name: "/test-all",                  purpose: "Suite completa lint + build + test" },
  { origin: "feature-dev",       name: "feature-dev:feature-dev",    purpose: "Guided feature dev con arch focus" },
  { origin: "code-review",       name: "code-review:code-review",    purpose: "Code review de un PR" },
  { origin: "ralph-loop",        name: "ralph-loop:*",               purpose: "Start/cancel Ralph Loop en sesión actual" },
  { origin: "vercel:plugin",     name: "vercel:bootstrap",           purpose: "Bootstrap repo con recursos Vercel-linked" },
  { origin: "vercel:plugin",     name: "vercel:deploy",              purpose: "Deploy al proyecto Vercel" },
  { origin: "vercel:plugin",     name: "vercel:env",                 purpose: "Manage Vercel env vars" },
  { origin: "vercel:plugin",     name: "vercel:marketplace",         purpose: "Marketplace integrations" },
  { origin: "vercel:plugin",     name: "vercel:status",              purpose: "Status del proyecto Vercel" },
  { origin: "vercel:plugin",     name: "vercel:ai-sdk",              purpose: "AI SDK expert guidance" },
  { origin: "vercel:plugin",     name: "vercel:ai-gateway",          purpose: "AI Gateway routing + failover" },
  { origin: "vercel:plugin",     name: "vercel:nextjs",              purpose: "Next.js App Router guidance" },
  { origin: "vercel:plugin",     name: "vercel:env-vars",            purpose: ".env files + vercel env CLI" },
  { origin: "vercel:plugin",     name: "vercel:knowledge-update",    purpose: "Corrige conocimiento outdated de Vercel" },
  { origin: "vercel:plugin",     name: "vercel:verification",        purpose: "Full-story verification del flow" },
  { origin: "superpowers",       name: "superpowers:brainstorming",  purpose: "Explorar intent antes de creativo" },
  { origin: "superpowers",       name: "superpowers:writing-plans",  purpose: "Plan multi-step antes de código" },
  { origin: "superpowers",       name: "superpowers:executing-plans", purpose: "Ejecutar plan en sesión separada" },
  { origin: "superpowers",       name: "superpowers:test-driven-development", purpose: "TDD antes de implementación" },
  { origin: "superpowers",       name: "superpowers:systematic-debugging", purpose: "Debug sistemático" },
  { origin: "frontend-design",   name: "frontend-design:frontend-design", purpose: "UI distintiva production-grade" },
  { origin: "supabase",          name: "supabase-postgres-best-practices", purpose: "32 mejores prácticas Postgres/Supabase" },
];

// ─── DATA: MCP Servers ──────────────────────────────────────────────────────

interface MCPEntry {
  name: string;
  purpose: string;
  status: "active" | "optional";
}

const MCP_SERVERS: MCPEntry[] = [
  { name: "context7",          purpose: "Fetch current docs de librerías/frameworks (override training cutoff)", status: "active" },
  { name: "playwright",        purpose: "Browser automation para E2E testing + debugging visual",               status: "active" },
  { name: "desktop-commander", purpose: "File ops + terminal + process management",                             status: "active" },
  { name: "memory",            purpose: "Knowledge graph persistente (entities/relations/observations)",        status: "active" },
  { name: "sequential-thinking", purpose: "Multi-step reasoning tool",                                          status: "active" },
  { name: "claude_ai_Gmail",   purpose: "Gmail read/search/create drafts",                                      status: "active" },
  { name: "claude_ai_Google_Calendar", purpose: "GCal events + meeting finder",                                 status: "active" },
];

// ─── DATA: Implementations (48 Excel 2026 + 28 Excel Agentes IA) ────────────

interface ImplEntry {
  category: string;
  practice: string;
  status: "✅" | "⚠️" | "❌" | "➖";
  evidence: string;
}

const IMPLEMENTATIONS: ImplEntry[] = [
  // Subset de las 48+28 — las más importantes del scoreboard real
  { category: "Clean Code",      practice: "Funciones < 15 líneas, SRP",                  status: "✅", evidence: "ESLint + Husky + admin/page.tsx 3996→1257" },
  { category: "Repository",      practice: "lib/db/*.db.ts nunca Prisma directo",        status: "✅", evidence: "25 clases DB" },
  { category: "Validación",      practice: "Zod safeParse obligatorio",                   status: "✅", evidence: "Todos los route handlers" },
  { category: "Multi-tenancy",   practice: "tenantId en todas las queries + aislamiento", status: "✅", evidence: "44 grietas cerradas en audit, 7 menores" },
  { category: "Índices",         practice: "@@index en WHERE/ORDER BY",                   status: "✅", evidence: "113/116 modelos + 6 nuevos hoy (TD-019)" },
  { category: "Cache",           practice: "getOrSet + invalidate híbrido",               status: "✅", evidence: "lib/cache.ts Memory+Redis" },
  { category: "Testing",         practice: "Coverage ≥80%",                               status: "✅", evidence: "2113 tests, 80% lines enforced" },
  { category: "Monitoring",      practice: "Sentry + OTEL + traceId",                     status: "✅", evidence: "3 capas + 4 alertas pendientes" },
  { category: "API",             practice: "OpenAPI generado + versionado /v1",           status: "✅", evidence: "npm run openapi:generate + app/api/v1" },
  { category: "Rolling Releases", practice: "Vercel canary 10→50→100",                    status: "⚠️", evidence: "Config lista, falta upgrade a Pro" },
  { category: "Secret Management", practice: "Doppler",                                   status: "⚠️", evidence: "Plan docs/doppler.md, falta Fase 1" },
  { category: "LLM Router",      practice: "Tiers cheap/balanced/premium",                status: "✅", evidence: "lib/llm-router.ts + 5 endpoints migrados" },
  { category: "HITL",            practice: "Approval modal antes de tool crítico",        status: "✅", evidence: "HITLApprovalsBanner.tsx + 2 tools marked" },
  { category: "Structured Output", practice: "JSON schema en respuestas LLM",             status: "⚠️", evidence: "ai-json-parser + 3 endpoints (prompt-based)" },
  { category: "Temperaturas",    practice: "Diferenciadas por rol",                       status: "✅", evidence: "lib/ai-temperatures.ts 8 roles × 9 endpoints" },
  { category: "Prompt Injection", practice: "Sanitization + guard",                       status: "✅", evidence: "buildInjectionGuard() en cada call" },
  { category: "Rate Limiting",   practice: "Per-endpoint + per-IP",                       status: "✅", evidence: "60 req/min + MODERATE/STRICT tiers" },
  { category: "Function Calling", practice: "Tools con permisos granulares",              status: "✅", evidence: "32 tools en tool-definitions.ts + RBAC" },
  { category: "RAG vectorial",   practice: "ChromaDB / pgvector",                         status: "❌", evidence: "Snapshot text + tools (suficiente hasta >1000 productos)" },
  { category: "LlamaGuard",      practice: "Moderación de outputs",                       status: "❌", evidence: "moderateLLMOutput regex básico" },
  { category: "Voice",           practice: "Speech API + one-click",                      status: "✅", evidence: "AICommandCenter.tsx webkitSpeechRecognition" },
  { category: "ADR",             practice: "Decisiones arquitectónicas en docs/adr/",     status: "✅", evidence: "10 ADRs (001-010)" },
  { category: "TypeScript",      practice: "Strict gate (ignoreBuildErrors=false)",       status: "⚠️", evidence: "251 errores pendientes (-218 en sesión)" },
];

// ─── DATA: Scoreboards ──────────────────────────────────────────────────────

const SCORES = {
  excel2026: { applied: 28, partial: 13, missing: 3, na: 4, total: 48 },
  agentesIA: { applied: 13, partial: 10, missing: 5, na: 0, total: 28 },
};

function calcScore(s: { applied: number; partial: number; missing: number; na: number; total: number }) {
  const denom = s.total - s.na;
  const solid = (s.applied + s.partial * 0.5) / denom;
  const perfect = s.applied / denom;
  return {
    solidPct: Math.round(solid * 1000) / 10,
    perfectPct: Math.round(perfect * 1000) / 10,
  };
}

// ─── DATA: Business model / pricing ─────────────────────────────────────────

interface PricingEntry {
  model: string;
  price: string;
  setup: string;
  target: string;
  notes: string;
}

const PRICING: PricingEntry[] = [
  {
    model: "Licencia perpetua (self-hosted)",
    price: "$3,500 - $5,500 USD único",
    setup: "2-5 días instalación + training",
    target: "Bodegas medianas con IT propio",
    notes: "Incluye 116 modelos Prisma, admin completo, marketplace, 15+ módulos IA, sin subscription. Cliente hostea.",
  },
  {
    model: "SaaS multi-tenant (hosted)",
    price: "$49 - $149 USD / mes por tenant",
    setup: "0 días — login inmediato",
    target: "Bodegas pequeñas sin IT",
    notes: "Tier básico $49 (hasta 500 productos), Plus $99 (2000), Pro $149 (ilimitado + IA avanzada). Marketplace compartido.",
  },
  {
    model: "White-label para cadenas",
    price: "$8,000 - $15,000 USD / año",
    setup: "1-3 semanas customización",
    target: "Cadenas de tiendas (5-50 sucursales)",
    notes: "Branding custom, dominio propio, features exclusivas. Soporte dedicado.",
  },
  {
    model: "Franquicia Buleje SaaS",
    price: "$500 USD inicial + 15% revenue share",
    setup: "1 semana onboarding",
    target: "Emprendedores locales que quieran operar",
    notes: "Brandon opera la plataforma, el franquiciado gestiona clientes en su ciudad.",
  },
  {
    model: "API + módulos on-demand",
    price: "$0.05 USD por llamada AI / $99 base",
    setup: "0 días — solo API key",
    target: "Desarrolladores/ISVs que integran IA a su propia app",
    notes: "Vender los 32 tools del orchestrator como API. Cobrar por uso. Vale la pena si hay tráfico.",
  },
];

// ─── DATA: Roadmap ──────────────────────────────────────────────────────────

interface RoadmapEntry {
  phase: string;
  items: string[];
  effort: string;
  impact: string;
}

const ROADMAP: RoadmapEntry[] = [
  {
    phase: "Inmediato (próximas 2-3 sesiones)",
    items: [
      "Sprint C Wave 3 — cluster Backend (48 errores TS)",
      "Sprint C Wave 4 — long tail (203 errores)",
      "Flip ignoreBuildErrors=false + ADR-008",
      "Activar Anthropic provider real (requiere API key)",
      "Toggles humanos: Vercel Rolling + Sentry alerts + Doppler + Stripe",
    ],
    effort: "3-4 sesiones + 35 min humanos",
    impact: "TS gate activado, Excel 2026 → 80%, Excel IA → 70%",
  },
  {
    phase: "Corto plazo (1-2 sprints)",
    items: [
      "TD-018 Float → Decimal en 47 campos monetarios (SUNAT compliance)",
      "Refactor admin/page.tsx Pasos 4-7 (1257 → <300 líneas)",
      "Promotions/ai-suggest → UI estructurada (consume items[] del JSON)",
      "Unused-vars cleanup sweeping",
      "E2E Playwright para HITL modal",
    ],
    effort: "4-6 sesiones",
    impact: "Correctness fiscal, calidad de código, UX admin",
  },
  {
    phase: "Mediano plazo (1 mes)",
    items: [
      "RAG vectorial (pgvector o ChromaDB) cuando catálogo > 1000 productos",
      "LlamaGuard moderación antes de abrir chat al marketplace",
      "Service Worker + IndexedDB para PWA offline-first",
      "DDD formal en módulos core (ventas, facturas)",
    ],
    effort: "3-4 sprints",
    impact: "Escalabilidad + PWA + correctness dominio",
  },
  {
    phase: "Largo plazo / visión",
    items: [
      "Lanzar SaaS multi-tenant público ($49-$149/mes)",
      "Franquicia Buleje para 3-5 emprendedores locales",
      "Integración SUNAT facturación electrónica productiva",
      "App móvil Capacitor con push + offline",
      "Marketplace B2B mayorista (WholesaleOrder ya modelado)",
    ],
    effort: "6 meses",
    impact: "Conversión de proyecto → producto con revenue",
  },
];

// ─── Main component ─────────────────────────────────────────────────────────

export default function ProjectIntelPage() {
  const [activeTab, setActiveTab] = useState<TabId>("stack");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panorama del Proyecto</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Stack, arquitectura, agentes, IA, implementaciones y modelo de negocio — todo en un solo lugar
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex items-center gap-2 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                    : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200",
                ].join(" ")}
              >
                {tab.icon}
                {tab.label}
                {tab.count != null && (
                  <span
                    className={[
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      active
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                    ].join(" ")}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div>
        {activeTab === "stack" && <StackTab />}
        {activeTab === "arch" && <ArchTab />}
        {activeTab === "ai" && <AITab />}
        {activeTab === "agents" && <AgentsTab />}
        {activeTab === "skills" && <SkillsTab />}
        {activeTab === "mcp" && <MCPTab />}
        {activeTab === "impl" && <ImplTab />}
        {activeTab === "scores" && <ScoresTab />}
        {activeTab === "business" && <BusinessTab />}
        {activeTab === "roadmap" && <RoadmapTab />}
      </div>
    </div>
  );
}

// ─── Tab components ─────────────────────────────────────────────────────────

function StackTab() {
  const categories = Array.from(new Set(STACK.map((s) => s.category)));
  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
            <Zap className="w-3 h-3" />
            {cat}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {STACK.filter((s) => s.category === cat).map((item) => (
              <div
                key={item.name}
                className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{item.name}</span>
                  <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{item.version}</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{item.purpose}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArchTab() {
  return (
    <div className="space-y-2">
      {ARCH.map((a, i) => (
        <div
          key={a.layer}
          className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
        >
          <div className="flex items-start gap-3">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 w-6 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">{a.layer}</h4>
                <span className="text-[10px] text-gray-400 font-mono truncate">{a.files}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{a.responsibility}</p>
              <code className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                {a.example}
              </code>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AITab() {
  const statusCfg: Record<AIEntry["status"], { label: string; cls: string }> = {
    active:        { label: "Activo",        cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    ready:         { label: "Listo",         cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    stub:          { label: "Stub",          cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    "pending-key": { label: "Falta API key", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  };
  const tierCfg: Record<AIEntry["tier"], string> = {
    cheap:       "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    balanced:    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    premium:     "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    specialized: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
            <th className="text-left py-2 px-2">Tier</th>
            <th className="text-left py-2 px-2">Provider</th>
            <th className="text-left py-2 px-2">Modelo</th>
            <th className="text-left py-2 px-2">Uso</th>
            <th className="text-left py-2 px-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {AI_MODELS.map((m, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-900">
              <td className="py-2 px-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${tierCfg[m.tier]}`}>
                  {m.tier}
                </span>
              </td>
              <td className="py-2 px-2 font-semibold text-gray-900 dark:text-white">{m.provider}</td>
              <td className="py-2 px-2 text-xs font-mono text-gray-600 dark:text-gray-400">{m.model}</td>
              <td className="py-2 px-2 text-xs text-gray-600 dark:text-gray-400">{m.usage}</td>
              <td className="py-2 px-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${statusCfg[m.status].cls}`}>
                  {statusCfg[m.status].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentsTab() {
  const kinds: AgentEntry["kind"][] = ["claude-code", "internal-domain", "team-orchestrator"];
  const kindLabels: Record<AgentEntry["kind"], string> = {
    "claude-code":       "Claude Code Agents (sesiones de desarrollo)",
    "internal-domain":   "Internal Domain Agents (runtime multi-agent)",
    "team-orchestrator": "Orquestadores de equipo",
  };
  return (
    <div className="space-y-6">
      {kinds.map((kind) => (
        <div key={kind}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
            <Bot className="w-3 h-3" />
            {kindLabels[kind]}
          </h3>
          <div className="space-y-1.5">
            {AGENTS.filter((a) => a.kind === kind).map((agent) => (
              <div
                key={agent.name}
                className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3 flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0">
                  <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <code className="text-xs font-mono font-bold text-gray-900 dark:text-white">{agent.name}</code>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{agent.purpose}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillsTab() {
  const origins = Array.from(new Set(SKILLS.map((s) => s.origin)));
  return (
    <div className="space-y-4">
      {origins.map((origin) => (
        <div key={origin}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            {origin}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {SKILLS.filter((s) => s.origin === origin).map((skill) => (
              <div
                key={skill.name}
                className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-2.5 flex items-start gap-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <code className="text-[11px] font-mono font-bold text-gray-900 dark:text-white">{skill.name}</code>
                  <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">{skill.purpose}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MCPTab() {
  return (
    <div className="space-y-2">
      {MCP_SERVERS.map((m) => (
        <div
          key={m.name}
          className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
            <Plug className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-sm font-mono font-bold text-gray-900 dark:text-white">{m.name}</code>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                  m.status === "active"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {m.status}
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{m.purpose}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ImplTab() {
  const statusCfg: Record<ImplEntry["status"], { cls: string; label: string }> = {
    "✅": { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", label: "Aplicada" },
    "⚠️": { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",         label: "Parcial"  },
    "❌": { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",                 label: "Falta"    },
    "➖": { cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",                label: "N/A"      },
  };
  return (
    <div className="space-y-1.5">
      {IMPLEMENTATIONS.map((i, idx) => (
        <div
          key={idx}
          className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3 flex items-start gap-3"
        >
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide shrink-0 ${statusCfg[i.status].cls}`}
          >
            {i.status} {statusCfg[i.status].label}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">{i.practice}</h4>
              <span className="text-[10px] text-gray-400 uppercase tracking-wide">{i.category}</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{i.evidence}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoresTab() {
  const e2026 = calcScore(SCORES.excel2026);
  const eIA = calcScore(SCORES.agentesIA);
  return (
    <div className="space-y-4">
      <ScoreCard
        title="Excel 2026 — 48 prácticas generales"
        snap={SCORES.excel2026}
        score={e2026}
        accent="teal"
      />
      <ScoreCard
        title="Excel Agentes IA — 28 prácticas de sistemas de agentes"
        snap={SCORES.agentesIA}
        score={eIA}
        accent="purple"
      />
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Métricas de sesión multi-turno
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="TS errors" before="469" after="251" delta="-46.5%" />
          <Metric label="ADRs" before="7" after="10" delta="+3" />
          <Metric label="Commits sesión" before="0" after="17" delta="+17" />
          <Metric label="Tests verdes" before="26" after="26" delta="0 regresiones" />
        </div>
      </div>
    </div>
  );
}

function ScoreCard({
  title,
  snap,
  score,
  accent,
}: {
  title: string;
  snap: { applied: number; partial: number; missing: number; na: number; total: number };
  score: { solidPct: number; perfectPct: number };
  accent: "teal" | "purple";
}) {
  const bar = accent === "teal" ? "from-teal-500 to-emerald-500" : "from-purple-500 to-indigo-500";
  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">{title}</h3>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Bucket n={snap.applied} label="✅ Aplicadas"  color="text-emerald-500" />
        <Bucket n={snap.partial} label="⚠️ Parciales"  color="text-amber-500" />
        <Bucket n={snap.missing} label="❌ Faltan"     color="text-red-500" />
        <Bucket n={snap.na}      label="➖ N/A"         color="text-gray-400" />
      </div>
      <div className="space-y-2">
        <ScoreBar label="Score sólido" pct={score.solidPct} gradient={bar} />
        <ScoreBar label="Score perfecto" pct={score.perfectPct} gradient="from-blue-500 to-indigo-500" />
      </div>
    </div>
  );
}

function Bucket({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-extrabold ${color}`}>{n}</div>
      <div className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function ScoreBar({ label, pct, gradient }: { label: string; pct: number; gradient: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-xs font-bold text-gray-900 dark:text-white">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${gradient}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, before, after, delta }: { label: string; before: string; after: string; delta: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">{label}</div>
      <div className="text-xl font-extrabold text-gray-900 dark:text-white">{after}</div>
      <div className="text-[10px] text-gray-400">
        de {before} · <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{delta}</span>
      </div>
    </div>
  );
}

function BusinessTab() {
  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-4 text-xs text-emerald-800 dark:text-emerald-300">
        <strong className="block mb-1">💰 Valoración honesta del proyecto hoy</strong>
        Bodega San Martín tiene 116 modelos Prisma, admin completo con 30+ tabs, marketplace B2B multi-tenant,
        15 módulos de IA en el centro, sistema de agentes reales con 32 tools, HITL, router LLM multi-provider,
        y una base técnica con 10 ADRs. Es un producto vendible YA — no un MVP.
      </div>
      {PRICING.map((p) => (
        <div
          key={p.model}
          className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">{p.model}</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{p.price}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs mb-2">
            <div>
              <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-0.5">
                Setup
              </div>
              <div className="text-gray-800 dark:text-gray-200">{p.setup}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-0.5">
                Target
              </div>
              <div className="text-gray-800 dark:text-gray-200">{p.target}</div>
            </div>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-900 pt-2 mt-2">
            {p.notes}
          </p>
        </div>
      ))}
    </div>
  );
}

function RoadmapTab() {
  return (
    <div className="space-y-3">
      {ROADMAP.map((r, idx) => (
        <div
          key={r.phase}
          className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[11px] font-extrabold text-indigo-700 dark:text-indigo-300">
                {idx + 1}
              </span>
              {r.phase}
            </h3>
          </div>
          <ul className="space-y-1.5 mb-3">
            {r.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3 text-[10px] pt-2 border-t border-gray-100 dark:border-gray-900">
            <div>
              <div className="uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide">Esfuerzo</div>
              <div className="text-gray-800 dark:text-gray-200 mt-0.5">{r.effort}</div>
            </div>
            <div>
              <div className="uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wide">Impacto</div>
              <div className="text-gray-800 dark:text-gray-200 mt-0.5">{r.impact}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
