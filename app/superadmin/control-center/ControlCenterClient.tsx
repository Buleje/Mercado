"use client";

/**
 * app/superadmin/control-center/ControlCenterClient.tsx
 *
 * Cliente del Centro de Control. Recibe el estado de env vars y la salud de
 * cada plataforma desde el server component padre — nunca lee process.env
 * directamente ni muestra valores de secretos.
 *
 * Estructura:
 *   A) Launchpad — TODAS las páginas del proyecto (~110) agrupadas en 15
 *      categorías. Filtro de búsqueda en vivo.
 *   B) Credenciales — 15 envs agrupadas por dominio (auth/db/pagos/etc).
 *   C) Info del sistema (versión + Next + Node + deploy).
 */

import { useMemo, useState } from "react";
import {
  AdminPage,
  AdminSection,
  BodyText,
  Kicker,
  cn,
} from "@buleje/design-system";
import { AdminTabShell } from "../_components/_shared";
import {
  Activity,
  AlertOctagon,
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  ChefHat,
  ClipboardCheck,
  Code,
  Compass,
  CreditCard,
  Database,
  DollarSign,
  Eye,
  FileCheck,
  FileText,
  Gauge,
  Gift,
  Globe,
  HandCoins,
  Heart,
  HeartHandshake,
  HeartPulse,
  HelpCircle,
  Home,
  ImageIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  LogIn,
  Mail,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Package,
  Palette,
  PartyPopper,
  Phone,
  PiggyBank,
  Receipt,
  Rocket,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Sliders,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingUp,
  Trophy,
  Truck,
  User,
  Users,
  Wallet,
  Warehouse,
  Webhook,
  WandSparkles,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { PlatformCard } from "@/components/superadmin/control-center/PlatformCard";
import { CredentialRow } from "@/components/superadmin/control-center/CredentialRow";
import { SystemInfoCard } from "@/components/superadmin/control-center/SystemInfoCard";
import type { EnvStatus } from "@/lib/superadmin/env-status";
import type { PlatformHealthMap, PlatformHealthStatus } from "@/lib/superadmin/platform-health";

type Tone = "teal" | "violet" | "amber" | "sky" | "rose" | "emerald" | "slate";

// ── Plataformas del Launchpad ────────────────────────────────────────────────

type Category =
  | "SuperAdmin · Gestión"
  | "SuperAdmin · Diseño"
  | "SuperAdmin · Operaciones"
  | "SuperAdmin · Sistema"
  | "Admin del tenant"
  | "Storefront público"
  | "Marketplace público"
  | "Marketplace · Vendor onboarding"
  | "Cuenta del comprador"
  | "Checkout & Pedidos"
  | "Repartidores"
  | "Proveedores"
  | "Onboarding & Landing"
  | "Asistente IA"
  | "Devs · Design System";

interface PlatformDef {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Categoría agrupable — encabeza grupo en el launchpad. */
  category: Category;
  /** Tono visual del card (gradient + color del icono). */
  tone: Tone;
}

// ── Audit completo: TODAS las páginas navegables del proyecto ────────────
// 110+ rutas distribuidas en 15 categorías. Solo se omiten rutas con
// `[param]` en último segmento (no son navegables sin contexto) y la
// página /superadmin/login (auth no es destino del launchpad).
const PLATFORMS: readonly PlatformDef[] = [
  // ═══════ SuperAdmin · Gestión ════════════════════════════════════════
  { id: "sa-root",        name: "SuperAdmin home",     description: "Raíz del panel SaaS.",                                    href: "/superadmin",                  icon: ShieldCheck,    category: "SuperAdmin · Gestión", tone: "teal"    },
  { id: "sa-dashboard",   name: "Dashboard ejecutivo", description: "MRR, ARR, crecimiento de tenants, top stores.",          href: "/superadmin/dashboard",        icon: LayoutDashboard, category: "SuperAdmin · Gestión", tone: "teal"    },
  { id: "sa-control",     name: "Centro de control",   description: "Esta pantalla — accesos rápidos a todo.",                href: "/superadmin/control-center",   icon: Gauge,           category: "SuperAdmin · Gestión", tone: "teal"    },
  { id: "sa-activity",    name: "Actividad",           description: "Feed de eventos en tiempo real.",                        href: "/superadmin/activity",         icon: Activity,        category: "SuperAdmin · Gestión", tone: "teal"    },
  { id: "sa-tenants",     name: "Tenants",             description: "Listado y gestión de tenants.",                          href: "/superadmin/tenants",          icon: Building2,       category: "SuperAdmin · Gestión", tone: "violet"  },
  { id: "sa-orders",      name: "Pedidos",             description: "Pedidos cross-tenant consolidados.",                     href: "/superadmin/orders",           icon: Package,         category: "SuperAdmin · Gestión", tone: "violet"  },
  { id: "sa-repartidores",name: "Repartidores",        description: "Aprobación y gestión global.",                           href: "/superadmin/repartidores",     icon: Truck,           category: "SuperAdmin · Gestión", tone: "violet"  },
  { id: "sa-mkt",         name: "Marketplace",         description: "Hub multi-vendor admin.",                                href: "/superadmin/marketplace",      icon: Store,           category: "SuperAdmin · Gestión", tone: "amber"   },
  { id: "sa-vendor-apps", name: "Solicitudes vendors", description: "Cola de aprobación de vendors.",                          href: "/superadmin/vendor-applications", icon: FileCheck,    category: "SuperAdmin · Gestión", tone: "amber"   },
  { id: "sa-vendor-health",name:"Salud vendors",       description: "Re-verificación RUC/DNI (RENIEC/SUNAT).",                 href: "/superadmin/vendor-health",    icon: HeartPulse,      category: "SuperAdmin · Gestión", tone: "amber"   },
  { id: "sa-stores",      name: "Tiendas publicadas",  description: "Vendors visibles en marketplace.",                       href: "/superadmin/stores",           icon: ShoppingBasket,  category: "SuperAdmin · Gestión", tone: "amber"   },
  { id: "sa-pagos-pend",  name: "Pagos pendientes",    description: "Yape/Plin/transferencia por aprobar.",                   href: "/superadmin/pagos-pendientes", icon: HandCoins,       category: "SuperAdmin · Gestión", tone: "emerald" },
  { id: "sa-pagos-yape",  name: "Pagos Yape (IA)",     description: "Aprobación con visión IA de comprobantes.",              href: "/superadmin/pagos-yape",       icon: WandSparkles,    category: "SuperAdmin · Gestión", tone: "emerald" },
  { id: "sa-billing",     name: "Billing & Stripe",    description: "MRR consolidado y suscripciones.",                       href: "/superadmin/billing",          icon: Receipt,         category: "SuperAdmin · Gestión", tone: "emerald" },

  // ═══════ SuperAdmin · Diseño ═════════════════════════════════════════
  { id: "sa-ds",          name: "Centro de diseño",    description: "Tokens heredables a todos los admin.",                   href: "/superadmin/design-system",    icon: Palette,         category: "SuperAdmin · Diseño",  tone: "rose"    },
  { id: "sa-plantilla",   name: "Plantilla del admin", description: "Layout del panel del tenant.",                           href: "/superadmin/plantilla",        icon: Layers,          category: "SuperAdmin · Diseño",  tone: "rose"    },
  { id: "sa-marca",       name: "Marca",               description: "Logo, colores, identidad.",                              href: "/superadmin/marca",            icon: Sparkles,        category: "SuperAdmin · Diseño",  tone: "rose"    },
  { id: "sa-banners",     name: "Banners",             description: "Banners promocionales del marketplace.",                 href: "/superadmin/banners",          icon: ImageIcon,       category: "SuperAdmin · Diseño",  tone: "rose"    },
  { id: "sa-banco-img",   name: "Banco de imágenes",   description: "Recursos globales por rubro.",                           href: "/superadmin/banco-imagenes",   icon: ImageIcon,       category: "SuperAdmin · Diseño",  tone: "rose"    },
  { id: "sa-variants",    name: "Variantes",           description: "Plantillas globales de variantes.",                      href: "/superadmin/variant-catalog",  icon: BookOpen,        category: "SuperAdmin · Diseño",  tone: "rose"    },
  { id: "sa-recetario",   name: "Recetario",           description: "Recetas heredables a los tenants.",                      href: "/superadmin/recetario",        icon: ChefHat,         category: "SuperAdmin · Diseño",  tone: "rose"    },

  // ═══════ SuperAdmin · Operaciones ════════════════════════════════════
  { id: "sa-analytics",   name: "Analytics detallado", description: "Análisis profundo con filtros.",                          href: "/superadmin/analytics",        icon: BarChart3,       category: "SuperAdmin · Operaciones", tone: "sky" },
  { id: "sa-health",      name: "Salud del sistema",   description: "Uptime, latencia, error rate.",                          href: "/superadmin/health",           icon: HeartPulse,      category: "SuperAdmin · Operaciones", tone: "sky" },
  { id: "sa-slo",         name: "SLO & budgets",       description: "Budget de error y burn rate.",                           href: "/superadmin/slo",              icon: TrendingUp,      category: "SuperAdmin · Operaciones", tone: "sky" },
  { id: "sa-dlq",         name: "Dead-letter",         description: "Cola de jobs fallidos.",                                 href: "/superadmin/dlq",              icon: AlertOctagon,    category: "SuperAdmin · Operaciones", tone: "sky" },
  { id: "sa-setup",       name: "Setup score",         description: "Completitud de configuración.",                          href: "/superadmin/setup",            icon: ClipboardCheck,  category: "SuperAdmin · Operaciones", tone: "sky" },

  // ═══════ SuperAdmin · Sistema ════════════════════════════════════════
  { id: "sa-security",    name: "Seguridad",           description: "Pentest, OWASP, auditoría.",                              href: "/superadmin/security",         icon: ShieldCheck,     category: "SuperAdmin · Sistema", tone: "slate"   },
  { id: "sa-config",      name: "Configuración",       description: "Yape/Plin, marca, contacto.",                            href: "/superadmin/configuracion",    icon: Sliders,         category: "SuperAdmin · Sistema", tone: "slate"   },
  { id: "sa-settings",    name: "Settings",            description: "Precios, comisiones, sidebar config.",                   href: "/superadmin/settings",         icon: Settings,        category: "SuperAdmin · Sistema", tone: "slate"   },
  { id: "sa-sitemap",     name: "Sitemap",             description: "Mapa completo de rutas.",                                href: "/superadmin/sitemap",          icon: MapIcon,         category: "SuperAdmin · Sistema", tone: "slate"   },
  { id: "sa-roadmap",     name: "Roadmap",             description: "Próximas features y entregas.",                          href: "/superadmin/roadmap",          icon: Rocket,          category: "SuperAdmin · Sistema", tone: "slate"   },

  // ═══════ Admin del tenant ════════════════════════════════════════════
  { id: "admin",          name: "Admin del tenant",    description: "ERP de la bodega — día a día.",                          href: "/admin",                       icon: LayoutDashboard, category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-cms",      name: "CMS · Editor",        description: "Editor de páginas custom del tenant.",                   href: "/admin/cms",                   icon: FileText,        category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-store",    name: "Mi tienda pública",   description: "Editor visual del storefront.",                          href: "/admin/store-page",            icon: Store,           category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-reviews",  name: "Reseñas",             description: "Moderación de calificaciones.",                          href: "/admin/store-reviews",         icon: Star,            category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-analytics",name: "Analytics tienda",    description: "Métricas del storefront del tenant.",                    href: "/admin/store-analytics",       icon: BarChart3,       category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-pos",      name: "POS móvil",           description: "Punto de venta táctil del cajero.",                      href: "/admin/pos-mobile",            icon: ShoppingCart,    category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-kiosk",    name: "Modo Kiosko",         description: "Vista TV/tablet para mostrador.",                        href: "/admin/kiosk",                 icon: Eye,             category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-dlq",      name: "Cron dead-letters",   description: "Cola de jobs fallidos del tenant.",                      href: "/admin/cron-dead-letters",     icon: AlertOctagon,    category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-webhooks", name: "Webhook queue",       description: "Eventos entrantes en cola.",                             href: "/admin/webhook-queue",         icon: Webhook,         category: "Admin del tenant",     tone: "violet"  },
  { id: "admin-plan",     name: "Mi plan",             description: "Checkout de plan del tenant.",                           href: "/admin/plan/checkout",         icon: CreditCard,      category: "Admin del tenant",     tone: "violet"  },
  { id: "panel",          name: "Page builder",        description: "Editor visual de páginas.",                              href: "/panel",                       icon: Layers,          category: "Admin del tenant",     tone: "violet"  },

  // ═══════ Storefront público ══════════════════════════════════════════
  { id: "home",           name: "Home",                description: "Página principal del marketplace.",                       href: "/",                            icon: Home,            category: "Storefront público",   tone: "amber"   },
  { id: "tienda",         name: "Tienda principal",    description: "Storefront del tenant Buleje.",                          href: "/tienda",                      icon: Store,           category: "Storefront público",   tone: "amber"   },
  { id: "buscar",         name: "Buscar",              description: "Búsqueda global de productos.",                          href: "/buscar",                      icon: Search,          category: "Storefront público",   tone: "amber"   },
  { id: "favoritos",      name: "Favoritos",           description: "Productos guardados del cliente.",                       href: "/favoritos",                   icon: Heart,           category: "Storefront público",   tone: "amber"   },
  { id: "about",          name: "Acerca de",           description: "Nuestra historia.",                                       href: "/about",                       icon: Globe,           category: "Storefront público",   tone: "amber"   },
  { id: "ayuda",          name: "Ayuda",               description: "FAQ + soporte.",                                          href: "/ayuda",                       icon: HelpCircle,      category: "Storefront público",   tone: "amber"   },
  { id: "precios",        name: "Precios",             description: "Planes SaaS para bodegas.",                              href: "/precios",                     icon: DollarSign,      category: "Storefront público",   tone: "amber"   },
  { id: "pricing",        name: "Pricing (legacy)",    description: "Página antigua de precios.",                             href: "/pricing",                     icon: DollarSign,      category: "Storefront público",   tone: "amber"   },
  { id: "delivery",       name: "Delivery",            description: "Info de envíos.",                                         href: "/delivery",                    icon: Truck,           category: "Storefront público",   tone: "amber"   },
  { id: "tracking",       name: "Tracking",            description: "Seguimiento público de pedidos.",                        href: "/tracking",                    icon: MapPin,          category: "Storefront público",   tone: "amber"   },
  { id: "abrir-tienda",   name: "Abrir tienda",        description: "Landing para nuevos comerciantes.",                      href: "/abrir-tienda",                icon: Store,           category: "Storefront público",   tone: "amber"   },
  { id: "negocios",       name: "Negocios",            description: "Landing B2B con tab features.",                          href: "/negocios",                    icon: Building2,       category: "Storefront público",   tone: "amber"   },
  { id: "recetas",        name: "Recetas",             description: "Recetario público.",                                      href: "/recetas",                     icon: ChefHat,         category: "Storefront público",   tone: "amber"   },
  { id: "guias",          name: "Guías",               description: "Contenido SEO + guías de uso.",                          href: "/guias",                       icon: BookOpen,        category: "Storefront público",   tone: "amber"   },
  { id: "descubri",       name: "Descubrí",            description: "Meta-landing de features.",                              href: "/descubri",                    icon: Compass,         category: "Storefront público",   tone: "amber"   },
  { id: "comprar-invitado",name:"Comprar como invitado",description:"Checkout sin cuenta.",                                    href: "/comprar-invitado",            icon: User,            category: "Storefront público",   tone: "amber"   },
  { id: "terminos",       name: "Términos",            description: "Términos y condiciones.",                                 href: "/terminos",                    icon: FileText,        category: "Storefront público",   tone: "amber"   },
  { id: "privacidad",     name: "Privacidad",          description: "Política Ley 29733 PE.",                                  href: "/privacidad",                  icon: Lock,            category: "Storefront público",   tone: "amber"   },
  { id: "tiendas",        name: "Tiendas por zona",    description: "Listado SEO local.",                                      href: "/tiendas",                     icon: MapIcon,         category: "Storefront público",   tone: "amber"   },

  // ═══════ Marketplace público ═════════════════════════════════════════
  { id: "mk-root",        name: "Marketplace",         description: "Hub multi-vendor público.",                              href: "/marketplace",                 icon: ShoppingBag,     category: "Marketplace público",  tone: "sky"     },
  { id: "mk-buscar",      name: "Buscar",              description: "Búsqueda cross-vendor.",                                 href: "/marketplace/buscar",          icon: Search,          category: "Marketplace público",  tone: "sky"     },
  { id: "mk-explorar",    name: "Explorar",            description: "Hero exploratorio editorial.",                           href: "/marketplace/explorar",        icon: Compass,         category: "Marketplace público",  tone: "sky"     },
  { id: "mk-carrito",     name: "Carrito",             description: "Carrito multi-tienda.",                                  href: "/marketplace/carrito",         icon: ShoppingCart,    category: "Marketplace público",  tone: "sky"     },
  { id: "mk-comparar",    name: "Comparar productos",  description: "Comparador side-by-side.",                               href: "/marketplace/comparar",        icon: Layers,          category: "Marketplace público",  tone: "sky"     },
  { id: "mk-favoritos",   name: "Favoritos",           description: "Productos guardados.",                                   href: "/marketplace/favoritos",       icon: Heart,           category: "Marketplace público",  tone: "sky"     },
  { id: "mk-ofertas",     name: "Ofertas",             description: "Descuentos activos.",                                    href: "/marketplace/ofertas",         icon: Tag,             category: "Marketplace público",  tone: "sky"     },
  { id: "mk-para-vos",    name: "Para vos",            description: "Recomendaciones personalizadas.",                        href: "/marketplace/para-vos",        icon: Sparkles,        category: "Marketplace público",  tone: "sky"     },
  { id: "mk-en-vivo",     name: "En vivo",             description: "Live shopping (próximamente).",                          href: "/marketplace/en-vivo",         icon: PartyPopper,     category: "Marketplace público",  tone: "sky"     },
  { id: "mk-recetas",     name: "Recetas",             description: "Recetas del marketplace.",                               href: "/marketplace/recetas",         icon: ChefHat,         category: "Marketplace público",  tone: "sky"     },
  { id: "mk-pagar",       name: "Cómo pagar",          description: "Métodos de pago aceptados.",                             href: "/marketplace/como-pagar",      icon: CreditCard,      category: "Marketplace público",  tone: "sky"     },
  { id: "mk-giftcards",   name: "Gift Cards",          description: "Tarjetas de regalo.",                                    href: "/marketplace/gift-cards",      icon: Gift,            category: "Marketplace público",  tone: "sky"     },
  { id: "mk-gift-comprar",name: "Comprar Gift Card",   description: "Flujo de compra de gift card.",                          href: "/marketplace/gift-cards/comprar", icon: Gift,         category: "Marketplace público",  tone: "sky"     },
  { id: "mk-calificar",   name: "Calificar entrega",   description: "Rating del repartidor.",                                 href: "/marketplace/calificar-entrega", icon: Star,         category: "Marketplace público",  tone: "sky"     },
  { id: "mk-payment-res", name: "Resultado pago",      description: "Pantalla post-checkout.",                                href: "/marketplace/payment-result",  icon: Receipt,         category: "Marketplace público",  tone: "sky"     },
  { id: "mk-registrar",   name: "Registrar",           description: "Registro de cuenta marketplace.",                        href: "/marketplace/registrar",       icon: LogIn,           category: "Marketplace público",  tone: "sky"     },

  // ═══════ Marketplace · Vendor onboarding ═════════════════════════════
  { id: "vender",         name: "Vende en Buleje",     description: "Landing B2B principal.",                                 href: "/vender",                      icon: Building2,       category: "Marketplace · Vendor onboarding", tone: "rose" },
  { id: "vender-reg",     name: "Registro de vendor",  description: "Form para nuevos vendors.",                              href: "/vender/registro",             icon: FileCheck,       category: "Marketplace · Vendor onboarding", tone: "rose" },
  { id: "vender-mi",      name: "Mi tienda (vendor)",  description: "Panel del vendor aprobado.",                             href: "/vender/mi-tienda",            icon: Store,           category: "Marketplace · Vendor onboarding", tone: "rose" },
  { id: "mk-apply",       name: "Apply vendor",        description: "Formulario corto de aplicación.",                        href: "/marketplace/apply",           icon: FileCheck,       category: "Marketplace · Vendor onboarding", tone: "rose" },
  { id: "mk-negocios",    name: "Negocios MP",         description: "Sub-landing B2B desde MP.",                              href: "/marketplace/negocios",        icon: Building2,       category: "Marketplace · Vendor onboarding", tone: "rose" },

  // ═══════ Cuenta del comprador ════════════════════════════════════════
  { id: "cuenta",         name: "Mi cuenta",           description: "Dashboard del comprador (storefront).",                  href: "/cuenta",                      icon: User,            category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-pedidos", name: "Mis pedidos",         description: "Historial de compras.",                                  href: "/cuenta/pedidos",              icon: Package,         category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-cupones", name: "Mis cupones",         description: "Cupones disponibles.",                                   href: "/cuenta/cupones",              icon: Tag,             category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-direcc",  name: "Direcciones",         description: "Libreta de direcciones.",                                href: "/cuenta/direcciones",          icon: MapPin,          category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-gift",    name: "Gift cards",          description: "Saldos de tarjetas regalo.",                             href: "/cuenta/gift-cards",           icon: Gift,            category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-notif",   name: "Notificaciones",      description: "Preferencias de avisos.",                                href: "/cuenta/notificaciones",       icon: MessageSquare,   category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-pagos",   name: "Métodos de pago",     description: "Tarjetas y métodos guardados.",                          href: "/cuenta/pagos",                icon: CreditCard,      category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-prefs",   name: "Preferencias",        description: "Idioma, moneda, alertas.",                               href: "/cuenta/preferencias",         icon: Settings,        category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-socio",   name: "Socio Buleje",        description: "Programa de lealtad del cliente.",                       href: "/cuenta/socio-buleje",         icon: HeartHandshake,  category: "Cuenta del comprador", tone: "violet"  },
  { id: "cuenta-subs",    name: "Suscripciones",       description: "Suscripciones recurrentes.",                             href: "/cuenta/suscripciones",        icon: Calendar,        category: "Cuenta del comprador", tone: "violet"  },
  { id: "mis-pedidos",    name: "Mis pedidos (legacy)",description: "Versión antigua.",                                        href: "/mis-pedidos",                 icon: Package,         category: "Cuenta del comprador", tone: "violet"  },
  { id: "mi-credito",     name: "Mi crédito",          description: "Fiado digital del cliente.",                             href: "/mi-credito",                  icon: PiggyBank,       category: "Cuenta del comprador", tone: "violet"  },
  { id: "mi-panel",       name: "Mi panel",            description: "Panel resumen.",                                          href: "/mi-panel",                    icon: LayoutDashboard, category: "Cuenta del comprador", tone: "violet"  },
  { id: "puntos",         name: "Puntos",              description: "Programa de puntos.",                                     href: "/puntos",                      icon: Trophy,          category: "Cuenta del comprador", tone: "violet"  },
  { id: "socio-buleje",   name: "Socio Buleje (land.)",description: "Landing del programa.",                                   href: "/socio-buleje",                icon: HeartHandshake,  category: "Cuenta del comprador", tone: "violet"  },
  { id: "mk-mi-cuenta",   name: "Mi cuenta MP",        description: "Dashboard del comprador marketplace.",                   href: "/marketplace/mi-cuenta",       icon: User,            category: "Cuenta del comprador", tone: "violet"  },
  { id: "mk-mc-cupones",  name: "Cupones MP",          description: "Cupones del marketplace.",                                href: "/marketplace/mi-cuenta/cupones", icon: Tag,           category: "Cuenta del comprador", tone: "violet"  },
  { id: "mk-mc-direcc",   name: "Direcciones MP",      description: "Direcciones del MP.",                                     href: "/marketplace/mi-cuenta/direcciones", icon: MapPin,    category: "Cuenta del comprador", tone: "violet"  },
  { id: "mk-mc-favs",     name: "Favoritos MP",        description: "Wishlist MP.",                                            href: "/marketplace/mi-cuenta/favoritos", icon: Heart,       category: "Cuenta del comprador", tone: "violet"  },
  { id: "mk-mc-hist",     name: "Historial MP",        description: "Historial de pedidos MP.",                                href: "/marketplace/mi-cuenta/historial", icon: Package,     category: "Cuenta del comprador", tone: "violet"  },
  { id: "mk-mc-pedidos",  name: "Pedidos MP",          description: "Pedidos actuales MP.",                                    href: "/marketplace/mi-cuenta/pedidos", icon: Package,       category: "Cuenta del comprador", tone: "violet"  },
  { id: "mk-mc-priv",     name: "Privacidad MP",       description: "ARCO Ley 29733 — datos del usuario.",                     href: "/marketplace/mi-cuenta/privacidad", icon: Lock,         category: "Cuenta del comprador", tone: "violet"  },

  // ═══════ Checkout & Pedidos ══════════════════════════════════════════
  { id: "checkout",       name: "Checkout",            description: "Flujo principal de pago.",                                href: "/checkout",                    icon: ShoppingCart,    category: "Checkout & Pedidos",   tone: "emerald" },
  { id: "checkout-auth",  name: "Checkout · Auth",     description: "Login/signup mid-checkout.",                              href: "/checkout/auth",               icon: LogIn,           category: "Checkout & Pedidos",   tone: "emerald" },
  { id: "checkout-datos", name: "Checkout · Datos",    description: "Datos del comprador.",                                    href: "/checkout/datos",              icon: User,            category: "Checkout & Pedidos",   tone: "emerald" },
  { id: "checkout-ent",   name: "Checkout · Entrega",  description: "Dirección y método de envío.",                            href: "/checkout/entrega",            icon: Truck,           category: "Checkout & Pedidos",   tone: "emerald" },
  { id: "checkout-conf",  name: "Checkout · Confirmar",description:"Resumen y pago.",                                          href: "/checkout/confirmar",          icon: ClipboardCheck,  category: "Checkout & Pedidos",   tone: "emerald" },
  { id: "pedido",         name: "Pedido",              description: "Detalle de pedido.",                                       href: "/pedido",                      icon: Package,         category: "Checkout & Pedidos",   tone: "emerald" },

  // ═══════ Repartidores ════════════════════════════════════════════════
  { id: "delivery-app",   name: "App del repartidor",  description: "Panel principal del rider.",                              href: "/delivery-app",                icon: Truck,           category: "Repartidores",         tone: "amber"   },
  { id: "delivery-login", name: "Repartidor · Login",  description: "Acceso al rider.",                                        href: "/delivery-app/login",          icon: LogIn,           category: "Repartidores",         tone: "amber"   },
  { id: "delivery-mapa",  name: "Mapa rider",          description: "Mapa con ofertas activas.",                               href: "/delivery-app/mapa",           icon: MapIcon,         category: "Repartidores",         tone: "amber"   },
  { id: "delivery-perfil",name: "Perfil rider",        description: "Datos del repartidor.",                                   href: "/delivery-app/perfil",         icon: User,            category: "Repartidores",         tone: "amber"   },
  { id: "delivery-gan",   name: "Ganancias rider",     description: "Reporte de earnings.",                                    href: "/delivery-app/ganancias",      icon: DollarSign,      category: "Repartidores",         tone: "amber"   },
  { id: "mk-repartidor",  name: "Repartidor MP",       description: "Landing del rider en MP.",                                href: "/marketplace/repartidor",      icon: Truck,           category: "Repartidores",         tone: "amber"   },
  { id: "mk-rep-bienv",   name: "Bienvenida rider",    description: "Onboarding del rider MP.",                                href: "/marketplace/repartidor/bienvenida", icon: PartyPopper, category: "Repartidores",       tone: "amber"   },
  { id: "mk-rep-gan",     name: "Ganancias MP rider",  description: "Earnings del rider MP.",                                  href: "/marketplace/repartidor/ganancias",  icon: DollarSign,  category: "Repartidores",         tone: "amber"   },
  { id: "repartidores",   name: "Repartidores (info)", description: "Landing pública para riders.",                            href: "/repartidores",                icon: Truck,           category: "Repartidores",         tone: "amber"   },

  // ═══════ Proveedores ═════════════════════════════════════════════════
  { id: "supplier",       name: "Portal proveedores",  description: "Hub principal del proveedor.",                            href: "/supplier",                    icon: Warehouse,       category: "Proveedores",          tone: "slate"   },
  { id: "supplier-dash",  name: "Dashboard supplier",  description: "KPIs del proveedor.",                                     href: "/supplier/dashboard",          icon: LayoutDashboard, category: "Proveedores",          tone: "slate"   },
  { id: "supplier-cat",   name: "Catálogo supplier",   description: "Productos del proveedor.",                                href: "/supplier/catalogo",           icon: BookOpen,        category: "Proveedores",          tone: "slate"   },
  { id: "supplier-reg",   name: "Registrar supplier",  description: "Form de alta de proveedor.",                              href: "/supplier/registrar",          icon: FileCheck,       category: "Proveedores",          tone: "slate"   },

  // ═══════ Onboarding & Landing ════════════════════════════════════════
  { id: "onboarding",     name: "Onboarding",          description: "Wizard inicial.",                                         href: "/onboarding",                  icon: Rocket,          category: "Onboarding & Landing", tone: "emerald" },
  { id: "signup",         name: "Signup",              description: "Alta de tenant nuevo.",                                   href: "/signup",                      icon: LogIn,           category: "Onboarding & Landing", tone: "emerald" },
  { id: "setup",          name: "Setup",               description: "Configuración inicial del tenant.",                       href: "/setup",                       icon: Settings,        category: "Onboarding & Landing", tone: "emerald" },
  { id: "registro",       name: "Registro (marketing)",description: "Registro desde landing pricing.",                          href: "/registro",                    icon: LogIn,           category: "Onboarding & Landing", tone: "emerald" },
  { id: "planes",         name: "Planes",              description: "Comparador de planes SaaS.",                              href: "/planes",                      icon: Award,           category: "Onboarding & Landing", tone: "emerald" },
  { id: "plataforma",     name: "Plataforma",          description: "Landing tech B2B.",                                       href: "/plataforma",                  icon: Server,          category: "Onboarding & Landing", tone: "emerald" },
  { id: "demo",           name: "Demo",                description: "Pedir demo / sales.",                                     href: "/demo",                        icon: Eye,             category: "Onboarding & Landing", tone: "emerald" },
  { id: "saas",           name: "SaaS",                description: "Página de producto SaaS.",                                href: "/saas",                        icon: Building2,       category: "Onboarding & Landing", tone: "emerald" },

  // ═══════ Asistente IA ════════════════════════════════════════════════
  { id: "asistente",      name: "Asistente IA",        description: "Chat con contexto operativo.",                            href: "/asistente",                   icon: Brain,           category: "Asistente IA",         tone: "teal"    },

  // ═══════ Devs · Design System ════════════════════════════════════════
  { id: "ds-root",        name: "Design system",       description: "Showcase del DS interno.",                                href: "/design-system",               icon: Palette,         category: "Devs · Design System", tone: "slate"   },
  { id: "ds-a11y",        name: "DS · A11y",           description: "Pruebas de accesibilidad.",                              href: "/design-system/a11y",          icon: Eye,             category: "Devs · Design System", tone: "slate"   },
  { id: "ds-admin",       name: "DS · Admin",          description: "Primitivos del admin.",                                   href: "/design-system/admin",         icon: LayoutDashboard, category: "Devs · Design System", tone: "slate"   },
  { id: "ds-customer",    name: "DS · Customer",       description: "Primitivos del storefront.",                              href: "/design-system/customer",      icon: User,            category: "Devs · Design System", tone: "slate"   },
  { id: "ds-charts",      name: "DS · Charts v2",      description: "Componentes de gráficos.",                                href: "/design-system/charts-v2",     icon: BarChart3,       category: "Devs · Design System", tone: "slate"   },
  { id: "ds-illus",       name: "DS · Ilustraciones",  description: "Galería de SVG.",                                         href: "/design-system/illustrations", icon: ImageIcon,       category: "Devs · Design System", tone: "slate"   },
  { id: "ds-pucallpa",    name: "DS · Pucallpa",       description: "Theme local Pucallpa.",                                   href: "/design-system/pucallpa",      icon: MapPin,          category: "Devs · Design System", tone: "slate"   },
  { id: "api-docs",       name: "API Docs",            description: "OpenAPI generado.",                                       href: "/api-docs",                    icon: Code,            category: "Devs · Design System", tone: "slate"   },
  { id: "playground",     name: "Playground",          description: "Pruebas de UI.",                                          href: "/playground/ronda-4",          icon: Sparkles,        category: "Devs · Design System", tone: "slate"   },
  { id: "offline",        name: "Offline",             description: "Pantalla PWA sin conexión.",                              href: "/offline",                     icon: Globe,           category: "Devs · Design System", tone: "slate"   },
];

const CATEGORY_ORDER: readonly Category[] = [
  "SuperAdmin · Gestión",
  "SuperAdmin · Diseño",
  "SuperAdmin · Operaciones",
  "SuperAdmin · Sistema",
  "Admin del tenant",
  "Storefront público",
  "Marketplace público",
  "Marketplace · Vendor onboarding",
  "Cuenta del comprador",
  "Checkout & Pedidos",
  "Repartidores",
  "Proveedores",
  "Onboarding & Landing",
  "Asistente IA",
  "Devs · Design System",
];

// ── Credenciales del sistema ─────────────────────────────────────────────────

type CredGroup = "Autenticación" | "Base de datos" | "Pagos" | "Comunicación" | "Observabilidad" | "Cache & Rate-limit";

interface CredentialDef {
  /** Clave lógica usada para lookup en EnvStatus. */
  envKey: keyof EnvStatus;
  label: string;
  scope: string;
  /** Texto libre de última rotación (cuando configurada). */
  rotatedLabel: string;
  actionKind: "rotate" | "change" | "external" | "configure";
  actionLabel: string;
  /** Cuando está definido, la acción abre este URL en nueva pestaña. */
  actionHref?: string;
  /** Mensaje del alert stub cuando la acción es interna (ADR pendiente). */
  pendingAdr?: string;
  /** Grupo lógico para agrupar visualmente. */
  group: CredGroup;
}

const CREDENTIALS: readonly CredentialDef[] = [
  // Autenticación
  { envKey: "AUTH_SECRET",         label: "AUTH_SECRET",         scope: "JWT signing",         rotatedLabel: "hace 45d", actionKind: "rotate",   actionLabel: "Rotar",          pendingAdr: "rotación manual — ADR pendiente", group: "Autenticación" },
  { envKey: "CRON_SECRET",         label: "CRON_SECRET",         scope: "Cron jobs",           rotatedLabel: "hace 30d", actionKind: "rotate",   actionLabel: "Rotar",          pendingAdr: "rotación manual — ADR pendiente", group: "Autenticación" },
  { envKey: "SUPERADMIN_PASSWORD", label: "SUPERADMIN_PASSWORD", scope: "Platform login",      rotatedLabel: "hace 12d", actionKind: "change",   actionLabel: "Cambiar",        pendingAdr: "reset via UI — ADR pendiente",    group: "Autenticación" },
  // Base de datos
  { envKey: "DATABASE_URL",        label: "DATABASE_URL",        scope: "Supabase pgBouncer",  rotatedLabel: "activo",   actionKind: "external", actionLabel: "Ver en Vercel",  actionHref: "https://vercel.com/dashboard",     group: "Base de datos" },
  { envKey: "DIRECT_URL",          label: "DIRECT_URL",          scope: "Supabase direct (migrate)", rotatedLabel: "activo", actionKind: "external", actionLabel: "Ver en Vercel", actionHref: "https://vercel.com/dashboard", group: "Base de datos" },
  { envKey: "SUPABASE_URL",        label: "NEXT_PUBLIC_SUPABASE_URL", scope: "Cliente Supabase", rotatedLabel: "activo", actionKind: "external", actionLabel: "Ver en Supabase", actionHref: "https://supabase.com/dashboard",   group: "Base de datos" },
  { envKey: "SUPABASE_ANON_KEY",   label: "SUPABASE_ANON_KEY",   scope: "Auth público",        rotatedLabel: "activo",   actionKind: "external", actionLabel: "Ver en Supabase", actionHref: "https://supabase.com/dashboard",  group: "Base de datos" },
  // Pagos
  { envKey: "STRIPE_SECRET_KEY",   label: "STRIPE_SECRET_KEY",   scope: "Suscripciones SaaS",  rotatedLabel: "—",        actionKind: "external", actionLabel: "Configurar",     actionHref: "https://dashboard.stripe.com/apikeys", group: "Pagos" },
  { envKey: "MP_ACCESS_TOKEN",     label: "MP_ACCESS_TOKEN",     scope: "Mercado Pago checkout", rotatedLabel: "—",      actionKind: "external", actionLabel: "Configurar",     actionHref: "https://www.mercadopago.com.pe/developers", group: "Pagos" },
  // Comunicación
  { envKey: "RESEND_API_KEY",      label: "RESEND_API_KEY",      scope: "Emails transaccionales", rotatedLabel: "—",     actionKind: "external", actionLabel: "Configurar",     actionHref: "https://resend.com/api-keys",      group: "Comunicación" },
  { envKey: "TWILIO_WHATSAPP",     label: "TWILIO_AUTH_TOKEN",   scope: "Notificaciones WhatsApp", rotatedLabel: "—",    actionKind: "external", actionLabel: "Configurar",     actionHref: "https://console.twilio.com/",      group: "Comunicación" },
  { envKey: "VAPID_PUBLIC",        label: "VAPID_PUBLIC_KEY",    scope: "Web Push notifications", rotatedLabel: "—",     actionKind: "configure", actionLabel: "Generar",       pendingAdr: "generar par VAPID via UI",         group: "Comunicación" },
  // Observabilidad
  { envKey: "SENTRY_DSN",          label: "SENTRY_DSN",          scope: "Error tracking",      rotatedLabel: "—",        actionKind: "external", actionLabel: "Configurar",     actionHref: "https://sentry.io/settings/",      group: "Observabilidad" },
  { envKey: "POSTHOG_KEY",         label: "POSTHOG_KEY",         scope: "Product analytics",   rotatedLabel: "—",        actionKind: "external", actionLabel: "Configurar",     actionHref: "https://app.posthog.com/",         group: "Observabilidad" },
  // Cache / RL
  { envKey: "UPSTASH_REDIS",       label: "UPSTASH_REDIS_REST",  scope: "Redis cache + rate-limit", rotatedLabel: "—",   actionKind: "external", actionLabel: "Configurar",     actionHref: "https://console.upstash.com/",     group: "Cache & Rate-limit" },
];

const CRED_GROUP_ORDER: readonly CredGroup[] = [
  "Autenticación",
  "Base de datos",
  "Pagos",
  "Comunicación",
  "Observabilidad",
  "Cache & Rate-limit",
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ControlCenterClientProps {
  envStatus: EnvStatus;
  healthMap: PlatformHealthMap;
  systemInfo: {
    version: string;
    branch: string;
    nextVersion: string;
    nodeVersion: string;
    deployedAt: string;
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ControlCenterClient({
  envStatus,
  healthMap,
  systemInfo,
}: ControlCenterClientProps) {
  const handlePendingAction = (message: string) => {
    // Stubs mientras no haya ADR — mantener copia profesional.
    window.alert(`Acción pendiente: ${message}.`);
  };

  // Quick stats — overview del estado del Control Center
  const operationalCount = PLATFORMS.filter(
    (p) => (healthMap[p.id]?.status ?? "unknown") === "operational",
  ).length;
  const configuredCreds = CREDENTIALS.filter((c) => envStatus[c.envKey]).length;

  // Search filter — busca en name, description y href.
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPlatforms = useMemo(
    () =>
      normalizedQuery
        ? PLATFORMS.filter(
            (p) =>
              p.name.toLowerCase().includes(normalizedQuery) ||
              p.description.toLowerCase().includes(normalizedQuery) ||
              p.href.toLowerCase().includes(normalizedQuery) ||
              p.category.toLowerCase().includes(normalizedQuery),
          )
        : PLATFORMS,
    [normalizedQuery],
  );

  // Agrupa plataformas filtradas por categoría manteniendo el orden definido
  const platformsByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: filteredPlatforms.filter((p) => p.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <AdminPage>
      <AdminTabShell
        title="Centro de control"
        description="Acceso rápido a todas las plataformas + estado de credenciales + info del sistema."
        icon={Gauge}
        kicker="Plataforma Buleje"
      >
      {/* ── Quick stats — visión del estado en un golpe ─────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickStat
          icon={Activity}
          label="Plataformas activas"
          value={`${operationalCount}/${PLATFORMS.length}`}
          tone="teal"
          hint={
            operationalCount === PLATFORMS.length
              ? "Todas operativas"
              : `${PLATFORMS.length - operationalCount} con incidencias`
          }
        />
        <QuickStat
          icon={KeyRound}
          label="Credenciales OK"
          value={`${configuredCreds}/${CREDENTIALS.length}`}
          tone="emerald"
          hint={
            configuredCreds === CREDENTIALS.length
              ? "Sin pendientes"
              : `${CREDENTIALS.length - configuredCreds} por configurar`
          }
        />
        <QuickStat
          icon={Server}
          label="Next.js"
          value={systemInfo.nextVersion}
          tone="sky"
          hint={`Node ${systemInfo.nodeVersion}`}
        />
        <QuickStat
          icon={Sparkles}
          label="Versión"
          value={systemInfo.version}
          tone="violet"
          hint={`Branch ${systemInfo.branch}`}
        />
      </div>

      {/* ── A. Launchpad ────────────────────────────────────────────── */}
      <AdminSection
        title={`Plataformas · ${PLATFORMS.length} páginas`}
        description="Todas las rutas navegables del proyecto agrupadas. Click en una card para abrir en nueva pestaña."
      >
        {/* Search filter — input grande para buscar entre 110+ rutas */}
        <div className="mb-5 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plataforma — nombre, ruta o categoría…"
            className={cn(
              "w-full h-11 pl-10 pr-10 rounded-xl border-2",
              "border-[var(--rule-base)] bg-[var(--surface-raised)]",
              "text-sm font-medium text-[var(--text-primary)]",
              "placeholder:text-[var(--text-tertiary)] placeholder:font-normal",
              "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
              "transition-colors",
            )}
            aria-label="Filtrar plataformas"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs font-bold"
              aria-label="Limpiar búsqueda"
            >
              Limpiar ✕
            </button>
          )}
          {query && filteredPlatforms.length > 0 && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)] font-semibold">
              {filteredPlatforms.length} resultado{filteredPlatforms.length === 1 ? "" : "s"}
              {" para "}
              <span className="text-[var(--text-primary)]">&ldquo;{query}&rdquo;</span>
            </p>
          )}
        </div>

        {/* Empty state cuando no hay resultados */}
        {platformsByCategory.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--rule-base)] py-10 px-6 text-center">
            <Search className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Sin coincidencias
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              No encontramos plataformas con &ldquo;{query}&rdquo;. Intentá con otra palabra.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {platformsByCategory.map((group) => (
            <div key={group.category}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                {group.category}
                <span className="ml-2 text-[var(--text-tertiary)]/60 font-semibold">
                  · {group.items.length}
                </span>
              </p>
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                }}
              >
                {group.items.map((p) => {
                  const status: PlatformHealthStatus =
                    healthMap[p.id]?.status ?? "unknown";
                  return (
                    <PlatformCard
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      description={p.description}
                      href={p.href}
                      icon={p.icon}
                      status={status}
                      tone={p.tone}
                      category={p.category}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      {/* ── B. Credenciales — agrupadas por dominio ──────────────────── */}
      <AdminSection
        title="Credenciales del sistema"
        description="Los valores nunca se muestran; sólo se reporta existencia y se ofrecen accesos a los dashboards de cada proveedor."
      >
        <div className="space-y-5">
          {CRED_GROUP_ORDER.map((group) => {
            const inGroup = CREDENTIALS.filter((c) => c.group === group);
            if (inGroup.length === 0) return null;
            const okCount = inGroup.filter((c) => envStatus[c.envKey]).length;
            const allOk = okCount === inGroup.length;
            return (
              <div
                key={group}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-[var(--surface-raised)]",
                  "border-[var(--rule-base)]",
                )}
              >
                {/* Sub-header del grupo con counter de estado */}
                <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]/70">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        allOk ? "bg-[var(--data-success-500)]" : "bg-[var(--data-warning-500)]",
                      )}
                      aria-hidden
                    />
                    <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                      {group}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      allOk
                        ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                        : "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)]",
                    )}
                  >
                    {okCount}/{inGroup.length} OK
                  </span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-b border-[var(--rule-soft)]">
                      <tr>
                        <th className="px-4 py-2"><Kicker>Credencial</Kicker></th>
                        <th className="px-4 py-2"><Kicker>Estado</Kicker></th>
                        <th className="px-4 py-2"><Kicker>Última rotación</Kicker></th>
                        <th className="px-4 py-2 text-right"><Kicker>Acción</Kicker></th>
                      </tr>
                    </thead>
                    <tbody>
                      {inGroup.map((c) => {
                        const configured = envStatus[c.envKey];
                        const showRotated = configured ? c.rotatedLabel : "—";
                        const hasHref = Boolean(c.actionHref);
                        return (
                          <CredentialRow
                            key={c.envKey}
                            label={c.label}
                            scope={c.scope}
                            configured={configured}
                            rotatedLabel={showRotated}
                            actionKind={c.actionKind}
                            actionLabel={c.actionLabel}
                            actionHref={hasHref ? c.actionHref : undefined}
                            onAction={
                              hasHref
                                ? undefined
                                : () => handlePendingAction(c.pendingAdr ?? c.actionLabel)
                            }
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border border-[var(--rule-base)]",
              "bg-[var(--surface-sunken)]/50 px-4 py-2.5",
            )}
          >
            <Lock className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden />
            <BodyText className="text-[var(--text-tertiary)]">
              Ningún secreto se envía al cliente. Solo se reporta si la variable
              está presente en producción.
            </BodyText>
          </div>
        </div>
      </AdminSection>

      {/* ── C. Info del sistema (timestamp deploy detallado) ─────────── */}
      <SystemInfoCard
        items={[
          { label: "Versión", value: systemInfo.version },
          { label: "Branch", value: systemInfo.branch },
          { label: "Next.js", value: systemInfo.nextVersion },
          { label: "Node", value: systemInfo.nodeVersion },
        ]}
        deployedAt={systemInfo.deployedAt}
      />
      </AdminTabShell>
    </AdminPage>
  );
}

// ── Quick stat (chip stat ejecutivo) ─────────────────────────────────────
const QUICK_TONE: Record<Tone, { bg: string; text: string; border: string }> = {
  teal:    { bg: "bg-teal-500/10 dark:bg-teal-500/15",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-500/30" },
  violet:  { bg: "bg-violet-500/10 dark:bg-violet-500/15",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-500/30" },
  amber:   { bg: "bg-amber-500/10 dark:bg-amber-500/15",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-500/30" },
  sky:     { bg: "bg-sky-500/10 dark:bg-sky-500/15",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-500/30" },
  rose:    { bg: "bg-rose-500/10 dark:bg-rose-500/15",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-500/30" },
  emerald: { bg: "bg-emerald-500/10 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30" },
  slate:   { bg: "bg-slate-500/10 dark:bg-slate-500/15",     text: "text-slate-700 dark:text-slate-300",     border: "border-slate-500/30" },
};

function QuickStat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "teal",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  const t = QUICK_TONE[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border bg-[var(--surface-raised)] p-4 flex items-start gap-3",
        "border-[var(--rule-base)]",
      )}
    >
      <div
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0 border",
          t.bg,
          t.text,
          t.border,
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
        <p className="mt-0.5 text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-tight truncate">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)] truncate">{hint}</p>
        )}
      </div>
    </div>
  );
}
