"use client";

/** Los chips «Sin firma» y «Sin enviar», pegados a los de estado (se combinan con ellos y entre sí). */

import type { FiltroRecibos } from "@/lib/adelantos/filtro-recibos";
import type { CargaRecibos } from "./use-estado-recibos";

export default function FiltrosRecibo({
  filtro,
  onCambio,
  cuenta,
  carga,
  chipCls,
}: {
  filtro: FiltroRecibos;
  onCambio: (c: Partial<FiltroRecibos>) => void;
  cuenta: { sinFirma: number; sinEnviar: number };
  carga: CargaRecibos;
  chipCls: (activo: boolean) => string;
}) {
  /* Sin el estado de los recibos no se sabe quién mandó qué: los chips esperan (o avisan). */
  const listo = carga === "listo";
  const num = (n: number) => (listo ? n : carga === "error" ? "—" : "…");
  const titulo = listo ? undefined : carga === "error" ? "No se pudo leer el estado de los recibos: recarga la página." : "Leyendo el estado de los recibos…";
  const chip = (clave: keyof FiltroRecibos, texto: string, ayuda: string) => (
    <button
      type="button"
      aria-pressed={filtro[clave]}
      disabled={!listo && !filtro[clave]}
      title={titulo ?? ayuda}
      data-filtro-recibo={clave}
      className={`${chipCls(filtro[clave])} disabled:cursor-wait disabled:opacity-60`}
      onClick={() => onCambio({ [clave]: !filtro[clave] })}
    >
      {texto} {num(cuenta[clave])}
    </button>
  );
  return (
    <>
      {chip("sinFirma", "Sin firma", "Sin firma ni huella (no cuenta los anulados)")}
      {chip("sinEnviar", "Sin enviar", "Con el recibo sin mandar por WhatsApp (no cuenta los anulados)")}
    </>
  );
}
