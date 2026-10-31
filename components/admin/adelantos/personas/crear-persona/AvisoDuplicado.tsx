"use client";

/**
 * «Ya existe → ábrela»: antes de crear a alguien por segunda vez (mismo DNI,
 * mismo celular o mismo nombre). No bloquea —en el mostrador puede haber un
 * caso raro—, pero ofrece el camino corto: editar a la que ya está.
 */
import { UserCheck } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { Aviso } from "./piezas";

export function AvisoDuplicado({ texto, onAbrir }: { texto: string; onAbrir: () => void }) {
  return (
    <Aviso
      accion={
        <button type="button" onClick={onAbrir} className={button({ variant: "secondary" })}>
          <UserCheck className="h-4 w-4" aria-hidden /> Abrir sus datos
        </button>
      }
    >
      {texto}
    </Aviso>
  );
}
