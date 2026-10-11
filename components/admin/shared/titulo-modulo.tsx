/**
 * Título de módulo del panel — UNO solo para todas las pestañas.
 *
 * Brandon 2026-10-08: «los formatos de títulos en general de mi página tienen
 * que ser todos iguales … como referencia toda la de esta pestaña» (Libro TH ›
 * GTF). La referencia es la identidad de LibroChrome, medida en navegador:
 *   - cuadro de 40 px con degradado del acento y el ícono en blanco;
 *   - rótulo 12 px / 700 en mayúsculas, color secundario (`.libro-kicker`);
 *   - título 20 px / 700, interlineado 1,12, −0,02em (`.libro-title`), que sube
 *     a 26 px cuando la banda mide 88rem o más.
 * Antes eso vivía sólo dentro de LibroChrome; AdminTabBar y AdminModuleHeader
 * (56 de 62 pestañas) dibujaban 30 px con un ícono gris suelto.
 *
 * Devuelve un FRAGMENTO (cuadro + bloque de texto) para que LibroChrome lo
 * use sin cambiar su HTML: el que lo llama pone la fila (`FILA_TITULO_MODULO`)
 * y la banda con `@container/banda`, que es la que decide 20 ↔ 26 px.
 */
import type { ComponentType, ReactNode } from "react";
import { Kicker, PageTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

/** Banda de la referencia: tarjeta con borde, fondo elevado y sombra chica. */
export const BANDA_MODULO =
  "@container/banda rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

/** Fila del cuadro + texto, con el mismo espacio que la banda del libro. */
export const FILA_TITULO_MODULO = "flex min-w-0 items-center gap-x-3 lg:gap-x-2";

/** Cuadro del ícono: degradado del acento, ícono en blanco (claro y oscuro). */
export const ICONO_MODULO =
  "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white shadow-[var(--shadow-sm)]";

/**
 * Tamaño, peso e interlineado los pone `.libro-title` (globals.css, bloque
 * «PANEL ADMIN — Tipografía»); acá sólo se baja a 20 px si la banda es angosta.
 */
export const TITULO_MODULO =
  "libro-title font-display text-[length:var(--ts-xl)] font-normal sm:text-[length:var(--ts-2xl)] @max-[88rem]/banda:[--ts-libro-title:1.25rem]";

export const ROTULO_MODULO = "libro-kicker block leading-none";

/**
 * Bloque de texto con rótulo Y ⓘ: grilla en vez del flex que envuelve. Un
 * flex-wrap mide de ancho natural rótulo + título + ⓘ EN UNA FILA aunque se
 * dibujen en dos, y la banda reservaba ~130-170 px vacíos (10-10: «Ventas y
 * caja» ocupaba 328 px para 162 visibles). En la grilla el rótulo cruza las
 * dos columnas y el ⓘ queda pegado al título.
 */
const TEXTO_CON_ROTULO_Y_AYUDA = "grid grid-cols-[auto_1fr] items-center justify-items-start gap-x-2 [&>:first-child]:col-span-2";

export interface TituloModuloProps {
  icon?: ComponentType<{ className?: string }>;
  /** Rótulo chico de arriba («Forestal · LO-TH SERFOR»). */
  eyebrow?: ReactNode;
  title: ReactNode;
  as?: "h1" | "h2" | "h3";
  /** Va pegado a la derecha del título: el ⓘ con la descripción, un chip. */
  ayuda?: ReactNode;
  /** Clases del bloque de texto (no del título). */
  className?: string;
}

export function TituloModulo({ icon: Icon, eyebrow, title, as, ayuda, className }: TituloModuloProps) {
  return (
    <>
      {Icon && (
        <span aria-hidden="true" className={ICONO_MODULO}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      {/* Con ⓘ y sin rótulo, flex en una fila; con rótulo, grilla (arriba): el ⓘ
          queda pegado al título, sin otra caja en el medio (rótulo y título
          siguen siendo hermanos, como en el libro). */}
      <div
        className={cn(
          "min-w-0",
          ayuda && (eyebrow ? TEXTO_CON_ROTULO_Y_AYUDA : "flex flex-wrap items-center gap-x-2"),
          className,
        )}
      >
        {eyebrow ? <Kicker className={ROTULO_MODULO}>{eyebrow}</Kicker> : null}
        <PageTitle as={as} className={TITULO_MODULO}>
          {title}
        </PageTitle>
        {ayuda}
      </div>
    </>
  );
}
