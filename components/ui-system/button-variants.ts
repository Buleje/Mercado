/**
 * Clases del botón del DS como FUNCIÓN: `button({ variant, size, className })`.
 *
 * Vive sin "use client" para que también la pueda llamar un componente de
 * servidor; `Button.tsx` la reexporta. Es lo que reemplaza a las ~170
 * constantes `BTN_*`/`BOTON_*` del panel (codemod `scripts/codemods/btn-constantes.mjs`,
 * ola 5): `<button className={button({ variant: "secondary" })}>` o `<Link className={button()}>`.
 *
 * Contrato de diseño del panel: ADR-489.
 */
import { tv, type VariantProps } from "tailwind-variants";

/**
 * Altura por defecto de botones y filtros del panel, en UN solo lugar.
 * Brandon (2026-10-09) eligió 48 px (h-12) «en todo el panel»; si algún día
 * se vuelve a 40 px (h-10), se cambia acá y nada más. Los tamaños con nombre
 * (xs…xl, icon) no la usan: quedan como estaban.
 */
export const ALTURA_CONTROL = { px: 48, clase: "h-12" } as const;

export const button = tv({
  base: [
    "inline-flex items-center justify-center gap-2",
    "font-bold whitespace-nowrap rounded-full",
    "transition duration-[var(--dur-fast)] ease-[var(--ease-editorial)]",
    "active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:opacity-50 disabled:pointer-events-none",
  ],
  variants: {
    variant: {
      primary: [
        "bg-gray-900 dark:bg-white text-white dark:text-gray-900",
        "border border-gray-900 dark:border-white",
        "hover:bg-gray-800 dark:hover:bg-gray-100",
        "focus-visible:ring-gray-900/30 dark:focus-visible:ring-white/30",
      ],
      secondary: [
        "bg-[var(--surface-raised)] text-[var(--text-primary)]",
        "border border-[var(--rule-base)]",
        "hover:border-gray-900 dark:hover:border-gray-400",
        "focus-visible:ring-gray-900/20 dark:focus-visible:ring-white/20",
      ],
      ghost: [
        "bg-transparent text-[var(--text-secondary)]",
        "hover:bg-[var(--surface-sunken)]",
        "focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500",
      ],
      accent: [
        "bg-primary text-white border border-primary",
        "hover:bg-primary/90",
        "focus-visible:ring-primary/30",
      ],
      danger: [
        "bg-[var(--data-error-600)] text-white border border-[var(--data-error-600)]",
        "hover:bg-[var(--data-error-700)]",
        "focus-visible:ring-[var(--data-error-500)]/30",
      ],
      link: [
        "text-[var(--text-primary)] underline-offset-4 hover:underline",
        "px-0 py-0 rounded-none",
      ],
    },
    size: {
      /** El de siempre cuando no se pasa `size`: alto = ALTURA_CONTROL. */
      defecto: `text-sm ${ALTURA_CONTROL.clase} px-5`,
      xs: "text-[length:var(--ts-xs)] h-7 px-3",
      sm: "text-xs h-8 px-3.5",
      md: "text-sm h-10 px-5",
      lg: "text-sm h-11 px-6",
      xl: "text-base h-12 px-7",
      icon: "h-10 w-10 p-0",
    },
    fullWidth: {
      true: "w-full",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "defecto",
  },
});

export type ButtonVariants = VariantProps<typeof button>;
