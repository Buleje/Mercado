"use client";

/**
 * «Posición de cada campo» (Brandon 16-10: «un modal donde estará el campo,
 * tipo (2) Autoridad Regional, y pondrá ahí la distancia alto y ancho o x, y»):
 * todos los valores de la hoja del talonario en una tabla, cada uno con su X
 * (desde el borde izquierdo), Y (desde el de arriba), ancho, letra y si se
 * imprime. Arriba, el corrimiento de toda la hoja (el mismo del panel de la
 * impresora, `useCorrimientoTalonario`); abajo, la tabla de trozas (Y de la
 * 1.ª fila, alto de fila y cada columna). Todo lo tipeado se ve al instante en
 * la hoja de atrás y entra en deshacer; Guardar es el del talonario. Cerrar
 * esta ventana NO descarta nada: los cambios siguen en el diseñador.
 */

import { useMemo, useState } from "react";
import { LayoutList, Redo2, Save, Search, Undo2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATALOGO, type FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import { revisarEncaje } from "@/lib/forestal/gtf-matricial-pantalla";
import { columnasDePosiciones, coincide, filasDePosiciones } from "@/lib/forestal/gtf-matricial-posiciones";
import { Btn, I, ModalFooter } from "./ctp-shared";
import { Casilla, NumeroMm, Opciones } from "./gtf-matricial-controles";
import ColumnasPosiciones from "./gtf-matricial-posiciones-columnas";
import { BotonesExcel, PegarDesdeExcel } from "./gtf-matricial-posiciones-excel";
import TablaPosiciones, { type RenglonPosicion } from "./gtf-matricial-posiciones-tabla";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import { CORRIMIENTO_MAX_MM, CORRIMIENTO_MIN_MM, useCorrimientoTalonario } from "./hooks/use-gtf-matricial-corrimiento";
import type { EstadoPerfilesTalonario } from "./hooks/use-gtf-matricial-perfiles";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";

const HOJAS: ReadonlyArray<{ value: FormatoTalonario; label: string }> = [
  { value: "guia", label: "Guía" },
  { value: "lista", label: "Lista" },
];

export default function PosicionesTalonario({
  t,
  s,
  imp,
  onClose,
}: {
  t: EstadoGtfMatricial;
  s: SeleccionTalonario;
  imp: EstadoPerfilesTalonario;
  onClose: () => void;
}) {
  const corr = useCorrimientoTalonario(t, imp);
  const [q, setQ] = useState("");
  const [soloNoEntran, setSoloNoEntran] = useState(false);
  const [pegando, setPegando] = useState(false);
  const { hoja, formato } = t;
  const pagina = t.paginas[t.pagina];

  const noEntran = useMemo<ReadonlySet<string>>(
    () => new Set(hoja ? revisarEncaje(hoja, CATALOGO[formato], pagina).noEntran.map((n) => n.clave) : []),
    [hoja, formato, pagina],
  );
  const pasa = (r: RenglonPosicion) => coincide(formato, r, q) && (!soloNoEntran || noEntran.has(r.clave));
  const campos: RenglonPosicion[] = hoja ? filasDePosiciones(formato, hoja, pagina).filter(pasa) : [];
  const columnas: RenglonPosicion[] = hoja
    ? columnasDePosiciones(formato, hoja, pagina)
        .map((c): RenglonPosicion => ({ ...c, tipo: "columna", y: null, letraPt: null }))
        .filter(pasa)
    : [];
  const filtrando = q.trim() !== "" || soloNoEntran;

  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      aboveModals
      icon={LayoutList}
      title="Posición de cada campo"
      description={`${CATALOGO[formato].nombre} · en milímetros desde el borde de la hoja`}
      ayuda={
        <InfoTip
          icono="ayuda"
          title="Cómo se usa"
          what="X es la distancia desde el borde izquierdo de la hoja hasta donde empieza el valor; Y, desde el borde de arriba. Tipea con coma o punto; las flechas suben o bajan 0,5 mm (con Shift, 5 mm) y Tab pasa a la siguiente cifra. La hoja de atrás se mueve al instante."
          affects="Para ver la hoja mientras corriges, arrastra esta ventana de su título o fíjala con el alfiler. Cerrarla no borra nada: los cambios quedan en el diseñador hasta que guardes."
          example="«Copiar tabla», ajusta las cifras en Excel con la regla en la mano, y «Pegar desde Excel»: cada renglón vuelve a su campo por el nombre o el N°."
        />
      }
      footer={
        <ModalFooter error={t.error} nota={t.sucio ? <span role="status">Cambios sin guardar</span> : undefined}>
          <Btn variant="ghost" aria-label="Deshacer" title="Deshacer (Ctrl + Z)" onClick={t.deshacer} disabled={!t.puedeDeshacer}>
            <Undo2 className="h-4 w-4" aria-hidden />
          </Btn>
          <Btn variant="ghost" aria-label="Rehacer" title="Rehacer (Ctrl + Y)" onClick={t.rehacer} disabled={!t.puedeRehacer}>
            <Redo2 className="h-4 w-4" aria-hidden />
          </Btn>
          <Btn variant="secondary" onClick={onClose}>
            Volver a la hoja
          </Btn>
          <Btn variant="primary" onClick={() => void t.guardar()} disabled={!t.sucio || t.guardando} data-qa="pos-guardar">
            <Save className="h-4 w-4" aria-hidden /> {t.guardando ? "Guardando…" : "Guardar"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <Opciones label="Hoja" value={formato} opciones={HOJAS} onChange={t.elegirFormato} />
          <div className="flex items-end gap-2" title={corr.oficina ? "Se guarda con el talonario" : `Es de la impresora «${corr.impresora}»`}>
            <div className="w-36">
              <NumeroMm label="Toda la hoja · X" value={corr.x} min={CORRIMIENTO_MIN_MM} max={CORRIMIENTO_MAX_MM} onChange={corr.fijarX} qa="pos-corr-x" />
            </div>
            <div className="w-36">
              <NumeroMm label="Toda la hoja · Y" value={corr.y} min={CORRIMIENTO_MIN_MM} max={CORRIMIENTO_MAX_MM} onChange={corr.fijarY} qa="pos-corr-y" />
            </div>
            <span className="pb-3 text-sm text-[var(--text-tertiary)] max-sm:hidden">{corr.impresora}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Buscar por nombre o valor</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar: (2), autoridad, 0000771…"
              data-qa="pos-buscar"
              className={I.replace("px-3.5", "pl-10 pr-3")}
            />
          </label>
          <Casilla label={`Sólo los que no entran (${noEntran.size})`} checked={soloNoEntran} onChange={setSoloNoEntran} disabled={noEntran.size === 0 && !soloNoEntran} />
          <BotonesExcel t={t} pegando={pegando} alternarPegar={() => setPegando((v) => !v)} />
        </div>

        {pegando && <PegarDesdeExcel t={t} onCerrar={() => setPegando(false)} />}

        {!hoja ? null : (
          <>
            <section aria-labelledby="pos-campos-titulo" className="flex flex-col gap-2">
              <CardTitle id="pos-campos-titulo">Campos de la {formato === "lista" ? "lista" : "guía"}</CardTitle>
              {campos.length > 0 ? (
                <TablaPosiciones t={t} s={s} renglones={campos} noEntran={noEntran} titulo="Campos de la hoja" />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{filtrando ? "Ningún campo con ese filtro." : "Esta hoja no tiene campos sueltos."}</p>
              )}
            </section>
            {(!filtrando || columnas.length > 0) && <ColumnasPosiciones t={t} s={s} renglones={columnas} noEntran={noEntran} />}
          </>
        )}
      </div>
    </AdminModal>
  );
}
