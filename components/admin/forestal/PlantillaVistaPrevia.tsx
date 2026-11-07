/**
 * Lo que hace una plantilla antes de rellenar: qué pasa con el permiso, qué
 * casilleros PISA (tenían algo escrito) y cuáles llena (estaban vacíos). Nada
 * se pisa sin verlo antes (16-10-2026).
 */

import { BlockTitle } from "@buleje/design-system";
import { TriangleAlert } from "@buleje/design-system/icons";
import { ROTULO_BLOQUE, type CambioPlantilla, type PlantillaGuia } from "@/lib/forestal/gtf-plantillas";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { VistaPreviaPlantilla } from "./hooks/use-plantillas-guia";

const CAJA_AVISO =
  "flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] px-3 py-2.5 text-sm text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10";

function AvisoPermiso({ v }: { v: VistaPreviaPlantilla }) {
  const e = v.estado;
  let texto: string | null = null;
  if (e.tipo === "cambia") {
    texto = `Esta guía cambia al permiso ${e.etiqueta}: el título y el propietario salen de ese permiso, lo demás que escribiste se queda y se desmarcan las trozas elegidas.`;
    if (v.numeroQueSePierde) texto += ` El N° ${v.numeroQueSePierde} es de otro talonario: se reemplaza por el que sigue.`;
    texto += " El recuento de abajo puede variar al cambiar de permiso.";
  } else if (e.tipo === "sin_trozas") {
    texto = `El permiso ${e.etiqueta} no tiene trozas para despachar: la guía se queda con el suyo y el título no se toca; lo demás, sí.`;
  } else if (e.tipo === "sin_permiso" && v.saltados.includes("titulo")) {
    texto = "La plantilla no trae permiso y esta guía ya tiene el suyo: el título sale de ese permiso y no se toca; lo demás, sí.";
  } else if (e.tipo === "vencido") {
    texto = `El permiso ${e.etiqueta} venció el ${etiquetaLarga(e.vencio)}: el título no se toca; lo demás, sí.`;
  } else if (e.tipo === "no_existe") {
    texto = `El permiso ${e.etiqueta} ya no está en el libro: el título no se toca; lo demás, sí.`;
  }
  if (!texto) return null;
  return (
    <p role="status" data-qa="plantilla-aviso-permiso" className={CAJA_AVISO}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{texto}</span>
    </p>
  );
}

function Lista({ titulo, cambios, pisa }: { titulo: string; cambios: CambioPlantilla[]; pisa?: boolean }) {
  if (cambios.length === 0) return null;
  return (
    <section className="grid gap-1.5">
      <BlockTitle as="h4" className={pisa ? "text-[var(--data-warning-ink)]" : undefined}>
        {titulo} ({cambios.length})
      </BlockTitle>
      <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)]">
        {cambios.map((c) => (
          <li key={`${c.bloque}-${c.campo}`} className="grid gap-0.5 px-3 py-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-3">
            <span className="text-xs text-[var(--text-secondary)]">
              {c.campo}
              <span className="text-[var(--text-tertiary)]"> · {ROTULO_BLOQUE[c.bloque]}</span>
            </span>
            <span className="min-w-0 break-words">
              {pisa && <s className="mr-1.5 text-[var(--text-tertiary)]">{c.antes}</s>}
              <b className="font-semibold text-[var(--text-primary)]">{c.despues || "(vacío)"}</b>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PlantillaVistaPrevia({ p, v }: { p: PlantillaGuia; v: VistaPreviaPlantilla }) {
  const nada = v.llena.length === 0 && v.pisa.length === 0 && v.estado.tipo !== "cambia";
  return (
    <div className="grid gap-3" data-qa="plantilla-vista-previa">
      <p className="text-sm text-[var(--text-secondary)]">
        <b className="text-[var(--text-primary)]">{p.nombre}</b>
      </p>
      <AvisoPermiso v={v} />
      <Lista titulo="Cambia lo que ya tenías" cambios={v.pisa} pisa />
      <Lista titulo="Llena lo vacío" cambios={v.llena} />
      {nada && <p className="text-sm text-[var(--text-secondary)]">Esta guía ya tiene esos mismos datos: no cambia nada.</p>}
    </div>
  );
}
