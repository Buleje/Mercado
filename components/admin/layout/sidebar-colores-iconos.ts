import type { IconStyle } from "@/components/admin/shared/SidebarConfigurator";

/* Colores por categoría — le dan personalidad al sidebar sin saturar.
   Si iconStyle = "monochrome" → todos grises. Si "colored" → por categoría.
   Sacado de AdminSidebar.tsx tal cual (2026-10-20) para que el modo «enlaces
   a la vista» pinte cada enlace con el color de su categoría. */
export function coloresDeIconos(isDarkTheme: boolean, iconStyle: IconStyle): Record<string, string> {
  const monocromo = isDarkTheme ? "text-white/60" : "text-[var(--text-tertiary)]";
  const coloridos: Record<string, string> = isDarkTheme
    ? {
        dashboard: "text-primary/90",
        ventas: "text-sky-300/90",
        productos: "text-[var(--accent)]/90",
        inventario: "text-amber-300/90",
        compras: "text-orange-300/90",
        finanzas: "text-emerald-300/90",
        clientes: "text-[var(--data-error-500)]/90",
        "marketplace-ops": "text-[var(--accent)]/90",
        analytics: "text-cyan-300/90",
        comunicacion: "text-teal-300/90",
        documentos: "text-slate-300/90",
        "mi-tienda": "text-[var(--accent)]/90",
        metas: "text-yellow-300/90",
      }
    : {
        dashboard: "text-primary",
        // sky-600 y --data-info-600 son el mismo #0284c7: se usa el token.
        ventas: "text-[var(--data-info-600)]",
        productos: "text-[var(--accent)]",
        inventario: "text-[var(--data-warning-600)]",
        compras: "text-[var(--nav-cat-compras)]",
        finanzas: "text-[var(--data-success-600)]",
        clientes: "text-[var(--data-error-500)]",
        "marketplace-ops": "text-[var(--accent)]",
        analytics: "text-[var(--nav-cat-analytics)]",
        comunicacion: "text-[var(--accent-dark)] dark:text-[var(--accent)]",
        documentos: "text-[var(--text-secondary)]",
        "mi-tienda": "text-[var(--accent)]",
        metas: "text-[var(--nav-cat-metas)]",
      };
  return iconStyle === "colored"
    ? coloridos
    : Object.fromEntries(Object.keys(coloridos).map((k) => [k, monocromo]));
}
