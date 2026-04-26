import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/superadmin/stores/health
 *
 * Audita el estado de configuración / onboarding de cada tienda del marketplace
 * para que el platform-admin vea de un vistazo qué le falta a cada negocio:
 * logo, banner, dirección, Yape, RUC, etc.
 *
 * Salida: array por tienda con `checks[]` (id/label/status/help) + `scorePct`.
 */

type CheckStatus = "done" | "missing" | "warning";
interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  help: string;
  /** Si false, este check NO cuenta para el score (es opcional pero deseable) */
  required?: boolean;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Trae todos los tenants tipo "store" + 1 store + settings + counts
  const tenants = await prisma.tenant.findMany({
    where: { type: "store" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      active: true,
      logoUrl: true,
      ownerEmail: true,
      ownerPhone: true,
      emailVerified: true,
      createdAt: true,
      stores: {
        take: 1,
        select: {
          id: true,
          slug: true,
          name: true,
          logo: true,
          banner: true,
          description: true,
          isPublished: true,
          category: true,
          zone: true,
          lat: true,
          lng: true,
          rating: true,
          reviewCount: true,
        },
      },
    },
  });

  const tenantIds = tenants.map((t) => t.id);
  const tenantSlugs = tenants.map((t) => t.slug);

  const [settingsList, productCounts] = await Promise.all([
    prisma.settings.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        tenantId: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
        businessEmail: true,
        logoUrl: true,
        description: true,
        hours: true,
        deliveryZone: true,
        yapeEnabled: true,
        yapeName: true,
        yapePhone: true,
        cashEnabled: true,
        razonSocial: true,
        ruc: true,
        businessType: true,
        socialLinksJson: true,
        slogan: true,
        businessLat: true,
        businessLon: true,
      },
    }),
    prisma.product.groupBy({
      by: ["tenantId"],
      where: {
        deletedAt: null,
        active: true,
        tenantId: { in: [...tenantIds, ...tenantSlugs] },
      },
      _count: { id: true },
    }),
  ]);

  const settingsMap = new Map(settingsList.map((s) => [s.tenantId, s]));
  const productCountMap = new Map<string, number>();
  for (const row of productCounts) {
    productCountMap.set(row.tenantId, row._count.id);
  }

  const items = tenants.map((t) => {
    const store = t.stores[0] ?? null;
    const settings = settingsMap.get(t.id);
    const productCount =
      (productCountMap.get(t.id) ?? 0) + (productCountMap.get(t.slug) ?? 0);

    const checks: Check[] = [];

    // ── Identidad visual ────────────────────────────────────
    const hasLogo = Boolean(store?.logo) || Boolean(t.logoUrl) || Boolean(settings?.logoUrl);
    checks.push({
      id: "logo",
      label: "Logo del negocio",
      status: hasLogo ? "done" : "missing",
      help: "Subí un logo cuadrado (recomendado 512×512). Configurá en /admin/settings/branding.",
      required: true,
    });

    checks.push({
      id: "banner",
      label: "Banner del marketplace",
      status: store?.banner ? "done" : "missing",
      help: "Imagen panorámica para la portada de tu tienda. Configurá en /admin/settings/branding.",
      required: true,
    });

    // ── Marketplace publicado ───────────────────────────────
    checks.push({
      id: "published",
      label: "Publicado en marketplace",
      status: store?.isPublished
        ? "done"
        : store
        ? "missing"
        : "missing",
      help: store
        ? "La tienda existe pero no está publicada — actívala para que aparezca en el listado público."
        : "No hay registro de Store. Crea la tienda desde /admin/marketplace.",
      required: true,
    });

    // ── Métodos de pago ─────────────────────────────────────
    const hasYape = Boolean(settings?.yapeEnabled && settings.yapePhone);
    checks.push({
      id: "yape",
      label: "Yape configurado",
      status: hasYape ? "done" : "missing",
      help: "Activá Yape e ingresá el número en /admin/settings/payments.",
      required: true,
    });

    checks.push({
      id: "cash",
      label: "Pago contra entrega",
      status: settings?.cashEnabled !== false ? "done" : "warning",
      help: "Aceptar efectivo es lo más común en Pucallpa. Recomendado dejar activado.",
      required: false,
    });

    // ── Dirección / ubicación ───────────────────────────────
    const hasAddress = Boolean(settings?.businessAddress);
    const hasGeo =
      Boolean(settings?.businessLat && settings?.businessLon) ||
      Boolean(store?.lat && store?.lng);
    checks.push({
      id: "address",
      label: "Dirección física",
      status: hasAddress ? "done" : "missing",
      help: "Campo obligatorio para boletas y delivery. Configurá en /admin/settings/business.",
      required: true,
    });
    checks.push({
      id: "geo",
      label: "Coordenadas (mapa)",
      status: hasGeo ? "done" : "warning",
      help: "Sin lat/lng no aparecés en 'Cerca tuyo'. Marcá tu ubicación en el mapa del setup.",
      required: false,
    });

    // ── Datos comerciales ──────────────────────────────────
    checks.push({
      id: "razonSocial",
      label: "Razón social",
      status: settings?.razonSocial ? "done" : "missing",
      help: "Nombre legal del negocio (para boletas/facturas). /admin/settings/business.",
      required: true,
    });
    checks.push({
      id: "ruc",
      label: "RUC / DNI",
      status: settings?.ruc && settings.ruc.length >= 8 ? "done" : "warning",
      help: "Necesario para emitir comprobantes electrónicos. Opcional si solo emitís ticket.",
      required: false,
    });
    checks.push({
      id: "businessName",
      label: "Nombre comercial",
      status: settings?.businessName ? "done" : "missing",
      help: "Cómo se muestra a los clientes. /admin/settings/business.",
      required: true,
    });

    // ── Contacto ────────────────────────────────────────────
    checks.push({
      id: "ownerPhone",
      label: "Teléfono dueño",
      status: t.ownerPhone ? "done" : "missing",
      help: "Para soporte y notificaciones críticas (WhatsApp).",
      required: true,
    });
    checks.push({
      id: "emailVerified",
      label: "Email verificado",
      status: t.emailVerified ? "done" : "warning",
      help: t.ownerEmail
        ? "Email registrado pero no verificado. Reenvía verificación."
        : "Sin email registrado. Críticos para recuperación.",
      required: false,
    });
    checks.push({
      id: "businessPhone",
      label: "Teléfono del negocio",
      status: settings?.businessPhone ? "done" : "warning",
      help: "Número público que se muestra al cliente.",
      required: false,
    });

    // ── Operación ───────────────────────────────────────────
    checks.push({
      id: "hours",
      label: "Horarios de atención",
      status: settings?.hours ? "done" : "missing",
      help: "Define horario de apertura/cierre. /admin/settings/business.",
      required: true,
    });
    checks.push({
      id: "deliveryZone",
      label: "Zona de delivery",
      status: settings?.deliveryZone || store?.zone ? "done" : "warning",
      help: "Define a qué zonas hacés delivery. Sin esto, todos te ven pero pocos compran.",
      required: false,
    });
    checks.push({
      id: "description",
      label: "Descripción de la tienda",
      status: store?.description || settings?.description ? "done" : "warning",
      help: "Texto corto que invite a comprar. 1-2 líneas.",
      required: false,
    });

    // ── Catálogo ────────────────────────────────────────────
    checks.push({
      id: "products",
      label: "Productos publicados",
      status:
        productCount >= 5 ? "done" : productCount > 0 ? "warning" : "missing",
      help:
        productCount === 0
          ? "Sin productos. Sin catálogo no recibís pedidos."
          : `Solo ${productCount} productos. Recomendado: 20+ para conversión decente.`,
      required: true,
    });

    // ── Cálculo del score ───────────────────────────────────
    const required = checks.filter((c) => c.required !== false);
    const doneRequired = required.filter((c) => c.status === "done").length;
    const scorePct =
      required.length > 0 ? Math.round((doneRequired / required.length) * 100) : 100;

    const missingCount = checks.filter((c) => c.status === "missing").length;
    const warningCount = checks.filter((c) => c.status === "warning").length;

    return {
      tenantId: t.id,
      tenantSlug: t.slug,
      tenantName: t.name,
      plan: t.plan,
      active: t.active,
      ownerPhone: t.ownerPhone,
      ownerEmail: t.ownerEmail,
      createdAt: t.createdAt.toISOString(),
      store: store
        ? {
            id: store.id,
            slug: store.slug,
            name: store.name,
            isPublished: store.isPublished,
            rating: store.rating,
            reviewCount: store.reviewCount,
            category: store.category,
          }
        : null,
      checks,
      scorePct,
      missingCount,
      warningCount,
      productCount,
    };
  });

  // Ordena: peores scores primero (los que más atención requieren)
  items.sort((a, b) => a.scorePct - b.scorePct);

  const stats = {
    total: items.length,
    healthy: items.filter((i) => i.scorePct >= 80).length,
    warning: items.filter((i) => i.scorePct >= 50 && i.scorePct < 80).length,
    critical: items.filter((i) => i.scorePct < 50).length,
  };

  return NextResponse.json({ items, stats });
}
