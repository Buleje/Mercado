import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, Settings, ExternalLink, MapPin, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface TenantLandingProps {
  params: Promise<{ slug: string }>;
}

export default async function TenantLandingPage({ params }: TenantLandingProps) {
  const { slug } = await params;

  // Buscar tenant directamente (Server Component — acceso seguro a DB)
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      active: true,
      ownerPhone: true,
      customDomain: true,
    },
  }).catch(() => null);

  if (!tenant) notFound();

  // Leer branding del tenant desde settings
  const headersList = await headers();
  const tenantIdFromMiddleware = headersList.get("x-tenant-id") ?? slug;

  let storeName = tenant.name;
  let storeDescription = "";
  let primaryColor = "#00B4A6";
  let logoText = tenant.name.slice(0, 2).toUpperCase();

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const settingsRes = await fetch(`${baseUrl}/api/settings`, {
      headers: { "x-tenant-id": tenantIdFromMiddleware },
      next: { revalidate: 60 },
    });
    if (settingsRes.ok) {
      const settings = await settingsRes.json() as Record<string, unknown>;
      if (settings.storeName && typeof settings.storeName === "string") {
        storeName = settings.storeName;
      }
      if (settings.storeDescription && typeof settings.storeDescription === "string") {
        storeDescription = settings.storeDescription;
      }
      if (
        settings.storeTheme &&
        typeof settings.storeTheme === "object" &&
        settings.storeTheme !== null
      ) {
        const theme = settings.storeTheme as Record<string, unknown>;
        if (theme.primaryColor && typeof theme.primaryColor === "string") {
          primaryColor = theme.primaryColor;
        }
      }
      if (settings.logoText && typeof settings.logoText === "string") {
        logoText = settings.logoText.slice(0, 2).toUpperCase();
      }
    }
  } catch {
    // Usar valores por defecto
  }

  const planBadge: Record<string, { label: string; className: string }> = {
    free: { label: "Free", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    pro: { label: "Pro", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
    business: { label: "Business", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    enterprise: { label: "Enterprise", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  };
  const badge = planBadge[tenant.plan] ?? planBadge.free;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)`,
          minHeight: "320px",
        }}
      >
        {/* Dot pattern decorativo */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto px-4 py-16 sm:py-20 text-center">
          {/* Logo/avatar */}
          <div
            className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center text-2xl font-black shadow-xl"
            style={{ background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.3)", color: "#fff" }}
          >
            {logoText}
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">
            {storeName}
          </h1>

          {storeDescription && (
            <p className="text-white/75 text-lg max-w-md mx-auto mb-6">
              {storeDescription}
            </p>
          )}

          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.className}`}>
              {badge.label}
            </span>
            {!tenant.active && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Suspendida
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Acciones principales */}
      <section className="max-w-3xl mx-auto px-4 -mt-8 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Tienda online */}
          <Link
            href={`/t/${slug}/tienda`}
            className="group flex items-center gap-4 p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 border border-gray-100 dark:border-gray-800"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${primaryColor}18` }}
            >
              <ShoppingBag
                className="w-7 h-7"
                style={{ color: primaryColor }}
              />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">
                Ver Tienda
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Productos, precios y pedidos
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          </Link>

          {/* Panel admin */}
          <Link
            href={`/t/${slug}/admin`}
            className="group flex items-center gap-4 p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 border border-gray-100 dark:border-gray-800"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-orange-50 dark:bg-orange-900/20">
              <Settings className="w-7 h-7 text-[#f4a261]" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">
                Admin
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Ventas, inventario, fiados
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          </Link>
        </div>

        {/* Info de contacto */}
        {(tenant.ownerPhone || tenant.customDomain) && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Contacto
            </h2>
            {tenant.ownerPhone && (
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm">{tenant.ownerPhone}</span>
              </div>
            )}
            {tenant.customDomain && (
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm font-mono">{tenant.customDomain}</span>
              </div>
            )}
          </div>
        )}

        {/* Slug info */}
        <p className="text-center mt-6 text-xs text-gray-400 dark:text-gray-600 font-mono">
          /{slug}
        </p>
      </section>
    </main>
  );
}
