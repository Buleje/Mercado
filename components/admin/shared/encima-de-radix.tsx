"use client";

/**
 * Pone un modal HECHO A MANO (con `useModalAccesible`) por encima de un modal
 * de Radix que siga abierto abajo.
 *
 * Medido el 23-09 (revisión del «modal del día»): «Registrar producción» es un
 * `AdminModal` (Radix) y monta la tira de días; desde ahí, «Editar corrida» y
 * el «Anexo 04» se abrían en un portal al `body`, FUERA de la capa de Radix.
 * Radix deja la página sin clics (`body { pointer-events: none }`) y su
 * `FocusScope` se trae de vuelta el foco: el modal de arriba se veía pero no se
 * podía escribir ni tocar. Desde «Producir sin lote» (hecho a mano) andaba.
 *
 * Acá el modal va dentro de un `Dialog` de Radix SIN estilo (`display:
 * contents`): Radix lo apila como capa nueva —le devuelve los clics y le deja
 * el foco— y el modal de adentro sigue dibujándose y manejando su teclado como
 * siempre. El `role` de la capa es `none`: el diálogo de verdad es el de
 * adentro, que ya tiene su nombre.
 */

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export default function EncimaDeRadix({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Content
          asChild
          aria-describedby={undefined}
          /* El foco y el Escape los maneja el modal de adentro (useModalAccesible). */
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div role="none" className="contents">
            <Dialog.Title className="sr-only">{titulo}</Dialog.Title>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
