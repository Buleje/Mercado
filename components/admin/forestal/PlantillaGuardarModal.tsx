"use client";

/**
 * «Guardar como plantilla»: qué bloques de la guía de ahora se guardan y con
 * qué nombre. Se marcan solos los que Brandon nombró (permiso, propietario,
 * partida, destino) si tienen datos; el nombre propuesto es «permiso → destino».
 * Nunca el N°, las fechas ni las trozas: eso es de cada guía.
 *
 * Con un nombre que ya existe, el botón pasa a «Reemplazar»: guarda los bloques
 * marcados encima de esa plantilla (igual que «Actualizar con lo de ahora»).
 */

import { useCallback, useState } from "react";
import { BookmarkPlus } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  BLOQUES_PLANTILLA,
  ROTULO_BLOQUE,
  bloqueConDatos,
  bloquesMarcados,
  lineaDelBloque,
  nombrePropuesto,
  type BloquePlantilla,
} from "@/lib/forestal/gtf-plantillas";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import type { PlantillasGuia } from "./hooks/use-plantillas-guia";

const clave = (n: string) => n.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");

export default function PlantillaGuardarModal({ g, pl, onCerrar }: { g: DespachoGuiaLoth; pl: PlantillasGuia; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(() => nombrePropuesto(g.datos, pl.permiso));
  const [marcados, setMarcados] = useState<Set<BloquePlantilla>>(() => new Set(bloquesMarcados(g.datos, pl.permiso)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* El nombre propuesto queda seleccionado: se acepta con Enter o se escribe encima. */
  const alMontarNombre = useCallback((el: HTMLInputElement | null) => el?.select(), []);

  const bloques = BLOQUES_PLANTILLA.filter((b) => marcados.has(b));
  const contenido = pl.contenidoDeAhora(BLOQUES_PLANTILLA);
  const repetida = (pl.plantillas ?? []).find((p) => clave(p.nombre) === clave(nombre)) ?? null;
  const listo = nombre.trim() !== "" && bloques.length > 0 && !guardando;

  const alternar = (b: BloquePlantilla) =>
    setMarcados((s) => {
      const r = new Set(s);
      if (r.has(b)) r.delete(b);
      else r.add(b);
      return r;
    });

  const guardar = async () => {
    if (!listo) return;
    setGuardando(true);
    setError(null);
    try {
      if (repetida) await pl.actualizarConAhora(repetida, bloques);
      else await pl.guardarNueva(nombre.trim(), bloques);
      pl.setAviso(`${repetida ? "Reemplacé" : "Guardé"} la plantilla «${repetida?.nombre ?? nombre.trim()}».`);
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Guardar como plantilla"
      icon={BookmarkPlus}
      ayuda={
        <InfoTip
          icono="ayuda"
          title="Plantilla de guía"
          what="Guarda los bloques que marques con un nombre. En otro despacho, «Plantillas › Usar» los escribe todos de una vez."
          affects="No guarda el N° de la guía, las fechas, las trozas ni los volúmenes: eso es de cada guía."
          example="«PO 12-2024 → Maderera San Juan»: el permiso, el propietario, la partida y el destino de siempre."
        />
      }
      size="lg"
      aboveModals
      claveVentana="gtf-plantilla-guardar"
      footer={
        <ModalFooter error={error} nota={`${bloques.length} de ${BLOQUES_PLANTILLA.length} bloques`}>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={!listo} className={button({ variant: "accent" })}>
            {guardando ? "Guardando…" : repetida ? "Reemplazar la plantilla" : "Guardar plantilla"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} grid gap-4`}>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Nombre</span>
          <input
            type="text"
            value={nombre}
            maxLength={80}
            ref={alMontarNombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardar();
            }}
            placeholder="Permiso → destino"
            className="h-12 w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          {repetida && (
            <span role="status" className="text-xs font-semibold text-[var(--data-warning-ink)]">
              Ya tienes «{repetida.nombre}»: se reemplaza con lo que marques acá.
            </span>
          )}
        </label>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-[var(--text-primary)]">Qué se guarda</legend>
          {BLOQUES_PLANTILLA.map((b) => {
            const hay = bloqueConDatos(g.datos, b, pl.permiso);
            const linea = hay ? lineaDelBloque(contenido, b) : "";
            return (
              <label
                key={b}
                data-qa={`plantilla-bloque-${b}`}
                className={`flex min-h-12 items-start gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2.5 ${
                  hay ? "cursor-pointer bg-[var(--surface-raised)] hover:border-[var(--accent)]" : "bg-[var(--surface-sunken)] opacity-70"
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcados.has(b)}
                  disabled={!hay}
                  onChange={() => alternar(b)}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{ROTULO_BLOQUE[b]}</span>
                  <span className="break-words text-xs text-[var(--text-secondary)]">{hay ? linea || "Con datos" : "Vacío en esta guía"}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
    </AdminModal>
  );
}
