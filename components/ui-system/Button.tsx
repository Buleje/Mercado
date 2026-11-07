"use client";

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { button, type ButtonVariants } from "./button-variants";

/**
 * El botón del DS. Las clases salen de `button()`. Para lo que no es `<Button>`
 * (un `<Link>`, un `<button>` con lógica propia), `button` se importa de
 * `@/components/ui-system/button-variants` (o del barril `@/components/ui-system`):
 * `className={button({ variant: "ghost" })}`. NO desde este archivo: es "use
 * client", y una constante `BOTON = button({…})` en un archivo que corre en el
 * servidor llamaría a una referencia de cliente (error 500). Por eso acá no se
 * reexporta. Sin `size`, el alto es `ALTURA_CONTROL` (48 px, decisión de Brandon 09-10).
 */

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariants {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={button({ variant, size, fullWidth, className })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
