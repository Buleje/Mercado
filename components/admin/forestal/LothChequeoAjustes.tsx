"use client";

/**
 * «Ajustes del chequeo» del Libro TH (26-10): lo que cada negocio decide y la
 * norma no fija. Se recuerdan en este equipo (localStorage), sin schema.
 *
 *  · Desde qué día avisar una GTF preliminar que no pasa al libro (de los 15
 *    de la RDE 264-2019; de fábrica, el mismo aviso de los plazos: 10).
 *  · Si pedir la licencia del conductor en cada guía (la GTF la trae en su
 *    casillero; quien no la llena, puede apagarlo y el aviso deja de pedirla).
 */

import { useState } from "react";
import { SlidersHorizontal } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { AJUSTES_CHEQUEO_DEFECTO, type AjustesChequeo } from "@/lib/forestal/loth-chequeo-tipos";
import { PLAZO_REGISTRO_DIAS } from "@/lib/forestal/loth-constants";
import { cn } from "@/lib/utils";
import { CLASE_ENCENDIDO_RIEL } from "./ctp-riel-piezas";
import { DIAS_PRELIMINAR_MAX, ajustesSanos } from "./hooks/use-loth-cumplimiento-avanzado";

const iguales = (a: AjustesChequeo, b: AjustesChequeo) => a.diasPreliminar === b.diasPreliminar && a.pedirLicencia === b.pedirLicencia;

/** El botón del riel (encendido si hay algo distinto a lo de fábrica) y su ventana. */
export default function LothChequeoAjustes({ ajustes, onGuardar }: { ajustes: AjustesChequeo; onGuardar: (a: AjustesChequeo) => void }) {
  const [abierto, setAbierto] = useState(false);
  const cambiado = !iguales(ajustes, AJUSTES_CHEQUEO_DEFECTO);
  const etiqueta = cambiado ? "Ajustes del chequeo (cambiados)" : "Ajustes del chequeo";
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={etiqueta}
        aria-label={etiqueta}
        className={button({ variant: "secondary", size: "icon", className: cn("shrink-0 rounded-xl", cambiado && CLASE_ENCENDIDO_RIEL) })}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {abierto && <VentanaAjustes ajustes={ajustes} onGuardar={onGuardar} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function VentanaAjustes({ ajustes, onGuardar, onCerrar }: { ajustes: AjustesChequeo; onGuardar: (a: AjustesChequeo) => void; onCerrar: () => void }) {
  /* El número se escribe como texto: vacío mientras se borra, se sanea al guardar. */
  const [dias, setDias] = useState(String(ajustes.diasPreliminar));
  const [pedirLicencia, setPedirLicencia] = useState(ajustes.pedirLicencia);
  const n = Number(dias);
  const valido = Number.isInteger(n) && n >= 1 && n <= DIAS_PRELIMINAR_MAX;

  function guardar() {
    if (!valido) return;
    onGuardar(ajustesSanos({ diasPreliminar: n, pedirLicencia }));
    onCerrar();
  }

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Ajustes del chequeo"
      size="md"
      ayuda={
        <InfoTip
          icono="ayuda"
          title="Ajustes del chequeo"
          what="Lo que tu negocio decide y la norma no fija. Se guardan en este equipo."
          example="Si tus guías nunca llevan la licencia del conductor, apágala y el aviso deja de pedirla."
        />
      }
      footer={
        <ModalFooter error={valido ? null : `Escribe un número de 1 a ${DIAS_PRELIMINAR_MAX}.`}>
          <button
            type="button"
            onClick={() => {
              setDias(String(AJUSTES_CHEQUEO_DEFECTO.diasPreliminar));
              setPedirLicencia(AJUSTES_CHEQUEO_DEFECTO.pedirLicencia);
            }}
            className={button({ variant: "secondary" })}
          >
            Lo de fábrica
          </button>
          <button type="button" onClick={guardar} disabled={!valido} className={button({ variant: "accent" })}>
            Guardar
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-5")}>
        <div className="space-y-2">
          <span className="flex items-center gap-1.5">
            <label htmlFor="loth-chequeo-dias" className="text-sm font-semibold text-[var(--text-primary)]">
              Avisar las GTF preliminares desde el día
            </label>
            <InfoTip
              title="Preliminares que no pasan al libro"
              what={`La guía se asienta en el libro en ${PLAZO_REGISTRO_DIAS} días (RDE 264-2019). Desde este día te avisa la que sigue preliminar; después del ${PLAZO_REGISTRO_DIAS}, sale como multa.`}
              example="Con 10: la guía del lunes 12/10 avisa desde el jueves 22/10 y es multa desde el miércoles 28/10."
            />
          </span>
          <span className="flex items-center gap-3">
            <input
              id="loth-chequeo-dias"
              type="number"
              inputMode="numeric"
              min={1}
              max={DIAS_PRELIMINAR_MAX}
              step={1}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              className={cn(CAMPO_INPUT, "h-12 w-28 text-base tabular-nums")}
            />
            <span className="text-sm text-[var(--text-secondary)]">de {PLAZO_REGISTRO_DIAS}</span>
          </span>
        </div>
        <Interruptor
          enabled={pedirLicencia}
          onChange={setPedirLicencia}
          label="Pedir la licencia del conductor en cada guía"
          desc="Apagado, el aviso de transporte sólo pide la placa y el conductor."
        />
      </div>
    </AdminModal>
  );
}
