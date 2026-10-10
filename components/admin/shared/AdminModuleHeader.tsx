"use client";

/**
 * AdminModuleHeader — Encabezado editorial estándar para TODOS los módulos admin.
 *
 * Actualizado 2026-04-18: pasa de header horizontal simple a layout editorial
 * coherente con "Editorial Amazónico" (eyebrow + title Fraunces italic +
 * subtitle + border-bottom).
 *
 * Jerarquía tipográfica fija:
 *   eyebrow  → Kicker uppercase tracking wide
 *   title    → PageTitle font-display italic (variable, se adapta al largo)
 *   subtitle → BodyText text-secondary, max 2 líneas
 *   icon     → opcional, 5x5 grayscale sutil (decorativo)
 *
 * Slot `children` reservado para acciones:
 *   - 1-2 botones primarios (inline)
 *   - Muchas acciones → envolver en <ModuleActionMenu items={...} />
 *
 * Uso mínimo:
 *   <AdminModuleHeader title="Productos" icon={Package}
 *     description="Catálogo de productos y stock." />
 *
 * Uso avanzado:
 *   <AdminModuleHeader
 *     eyebrow="Inventario · Catálogo"
 *     title="Productos"
 *     description="Gestioná tus ítems, precios y stock base."
 *     icon={Package}
 *   >
 *     <button className="...">Nuevo producto</button>
 *     <ModuleActionMenu items={[...]} />
 *   </AdminModuleHeader>
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BANDA_MODULO, FILA_TITULO_MODULO, TituloModulo } from "./titulo-modulo";
import { cn } from "@/lib/utils";
import { useModuleDepth } from "@/components/admin/shared/module-depth";
import type { LucideIcon } from "@buleje/design-system/icons";

interface AdminModuleHeaderProps {
  /**
   * Nivel semántico del título. Un módulo montado DENTRO de un hub que ya
   * puso su propio h1 (ej. Mi Plata → Activos) debe pasar `as="h2"`: dos h1
   * en la misma página rompen la jerarquía para lectores de pantalla y SEO.
   * El aspecto visual no cambia — PageTitle se ve igual en ambos niveles.
   */
  as?: "h1" | "h2" | "h3";
  /** Línea pequeña arriba del título (ej: "Inventario · Catálogo"). */
  eyebrow?: string;
  /** Título principal — se renderiza con font-display italic. */
  title: string;
  /** Descripción breve (1-2 líneas, lenguaje simple). Acepta JSX para deep-links inline. */
  description?: React.ReactNode;
  /** Icono decorativo opcional. */
  icon?: LucideIcon;
  /** @deprecated — ignored, kept for backward compat */
  iconColor?: string;
  /** @deprecated — ignored, kept for backward compat */
  bgTint?: string;
  /** @deprecated — ignored, kept for backward compat */
  iconColorClass?: string;
  /** Slot para acciones: botones, dropdowns, date pickers, etc. */
  children?: React.ReactNode;
  /**
   * `"auto"` (default) — anidado bajo otro módulo que ya puso su título (lo
   * detecta `useModuleDepth`), el header NO se dibuja: la pestaña marcada
   * arriba ya dice dónde estás. Sobreviven sólo sus `children` (acciones).
   * `"full"` — fuerza el editorial completo. Escape hatch para una superficie
   * que arranca pantalla nueva pero cuelga del panel de un tab en el árbol.
   */
  variant?: "auto" | "full";
  className?: string;
}

export default function AdminModuleHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
  as,
  variant = "auto",
  className,
}: AdminModuleHeaderProps) {
  // Cuántos títulos de módulo hay arriba. >0 ⇒ este es un sub-módulo dentro
  // de un hub: la pestaña marcada ya lo nombra.
  const profundidad = useModuleDepth();
  const anidado = variant === "auto" && profundidad > 0;
  const nivel: "h1" | "h2" | "h3" = as ?? "h1";

  if (anidado) {
    // Brandon 2026-09-07: «segundo nivel sin línea compacta, exactamente como
    // Analytics Pro». Antes acá iba una línea `▎Título · descripción`; decía
    // en prosa lo que la pestaña de arriba dice en un botón. Quedan sólo las
    // acciones, a la derecha, para que cada botón siga donde el usuario lo
    // conoce. Sin acciones no se dibuja nada — ni un contenedor vacío que
    // gaste su margen.
    if (!children) return null;
    return (
      <div
        data-admin-module-header=""
        data-admin-module-actions=""
        className={cn("mb-3 flex flex-wrap items-center justify-end gap-2", className)}
      >
        {children}
      </div>
    );
  }

  return (
    // `@container`: el header se mide contra SU ancho real, no contra el
    // viewport. Con el sidebar abierto, una ventana de 991px deja ~700px de
    // contenido — un `sm:flex-row` (viewport ≥640) ponía título y acciones en
    // fila igual, y como las acciones no cedían ancho el título quedaba con
    // 15px: la descripción se partía en 12 líneas de una palabra.
    //
    // Los breakpoints van en REM EXPLÍCITOS (`@min-[48rem]`) y no en `@sm/@md`:
    // este proyecto redefine `--container-*` en @theme (sm=720px, md=960px) y
    // ni siquiera existen `--container-2xl/3xl`, así que las variantes con
    // nombre valdrían otra cosa —o nada— sin avisar.
    <header
      /* `data-admin-module-header`: lo lee globals.css para comprimir el aire
         del encabezado en pantallas de poca altura. Ver «Densidad por ALTURA». */
      data-admin-module-header=""
      className={cn(
        "mb-4",
        // Con la barra de pestañas justo abajo, un poco menos de aire.
        // `:has(+ …)` mira al hermano SIGUIENTE.
        "has-[+_[data-admin-tabbar]]:mb-3",
        className,
      )}
    >
      {/* La misma banda e identidad que el Libro TH (titulo-modulo.tsx,
          Brandon 08-10: «todos los títulos iguales, como esta pestaña»). La
          descripción va al ⓘ junto al título (regla «explicar con ⓘ»). El
          relleno va en esta caja y no en el <header>: la densidad por altura
          de globals.css le pisa el `padding-bottom` al header. */}
      <div className={BANDA_MODULO}>
        {/* La consulta de contenedor mide la BANDA: va en una caja de adentro
            (un contenedor no se consulta a sí mismo). */}
        <div className="flex flex-col gap-3 px-3 py-2.5 sm:px-4 @min-[48rem]/banda:flex-row @min-[48rem]/banda:items-center @min-[48rem]/banda:justify-between">
        <div className={FILA_TITULO_MODULO}>
          <TituloModulo
            icon={Icon}
            eyebrow={eyebrow}
            title={title}
            as={nivel}
            ayuda={description ? <InfoTip side="bottom" title={title} what={description} /> : undefined}
          />
        </div>
        {children && (
          // Sin `shrink-0`: cuando entran en la misma fila no deben aplastar al
          // título; cuando no entran, bajan y se envuelven entre ellas.
          <div className="flex flex-wrap items-center gap-2 @min-[48rem]/banda:justify-end">
            {children}
          </div>
        )}
        </div>
      </div>
    </header>
  );
}
