"use client";

/**
 * «Imprimir en talonario» — la GTF y su lista de trozas en el talonario
 * PREIMPRESO de la matricial (Brandon 15-10: «ahí solo se pondrá e imprimirá
 * los valores de los campos… lo acomodaré para que cuadre con mi talonario»).
 *
 * A la izquierda la hoja a escala con cada valor donde cae; a la derecha el
 * campo elegido, la calibración de la impresora y la foto del talonario de
 * fondo. Imprime SÓLO los valores (Courier New negrita, negro, `@page` del
 * tamaño del talonario, margen 0) y en una sola pasada: las 3 copias salen del
 * papel autocopiativo. La disposición se guarda por tenant y por hoja.
 *
 * Los valores son los de «Imprimir hoja SERFOR» (`entradasDeLaGuia`): esto no
 * recalcula nada.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, Printer, RotateCcw, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATALOGO, type FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import { htmlPruebaTalonario, htmlTalonario, imprimirEnMarco } from "@/lib/forestal/gtf-matricial-print";
import { Btn, ModalBody, ModalFooter, PanelSkeleton, useCierreSeguro } from "./ctp-shared";
import type { Gtf } from "./gtf-tabla-columnas";
import { useGtfMatricial } from "./hooks/use-gtf-matricial";
import { useFondoTalonario } from "./hooks/use-gtf-matricial-fondo";
import { Opciones } from "./gtf-matricial-controles";
import HojaTalonario from "./gtf-matricial-hoja";
import PanelTalonario from "./gtf-matricial-panel";
import AjustesTalonario from "./gtf-matricial-ajustes";

const ZOOMS = [
  { value: "1", label: "Ajustar" },
  { value: "1.5", label: "150 %" },
  { value: "2", label: "200 %" },
] as const;

export default function GtfMatricialModal({ g, onClose }: { g: Gtf; onClose: () => void }) {
  const t = useGtfMatricial(g);
  const f = useFondoTalonario(t.formato);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]["value"]>("1");
  const [conValores, setConValores] = useState(true);
  const cerrar = useCierreSeguro(t.sucio, onClose);
  const hoja = t.hoja;
  const cat = CATALOGO[t.formato];
  const total = t.paginas.length;
  const nombre = `GTF ${g.gtfNumber} · ${cat.nombre}`;

  const imprimir = async () => {
    if (!hoja) return;
    /* Lo que se acomodó y se imprimió es lo que va a querer la próxima vez. */
    if (t.sucio && !(await t.guardar())) return;
    imprimirEnMarco(htmlTalonario(hoja, cat, t.paginas, nombre));
  };
  const prueba = () => {
    if (!hoja) return;
    imprimirEnMarco(htmlPruebaTalonario(hoja, cat, conValores ? (t.paginas[t.pagina] ?? null) : null, `Prueba · ${nombre}`));
  };

  const filas = t.entradas.filas.length;
  const formatos: ReadonlyArray<{ value: FormatoTalonario; label: string }> = [
    { value: "guia", label: "Guía" },
    { value: "lista", label: filas ? `Lista · ${filas} troza${filas === 1 ? "" : "s"}` : "Lista" },
  ];

  return (
    <AdminModal
      open
      onClose={() => void cerrar()}
      variant="fullscreen"
      icon={Printer}
      title="Imprimir en talonario"
      description={`GTF ${g.gtfNumber}${g.titularName ? ` · ${g.titularName}` : ""}`}
      ayuda={
        <InfoTip
          icono="ayuda"
          title="Cómo se usa"
          what="Arrastra cada valor hasta su casillero (o muévelo con las flechas), guarda, y pon el talonario en la matricial. Sólo se imprimen los valores: el talonario ya trae los rótulos."
          affects="La disposición queda guardada para todas las guías de esta empresa: se acomoda una vez."
          example="Una sola impresión: las 3 copias salen del papel autocopiativo."
        />
      }
      footer={
        <ModalFooter
          error={t.error}
          nota={
            hoja && (
              <span className="tabular-nums">
                {total} hoja{total === 1 ? "" : "s"} de {hoja.anchoMm} × {hoja.altoMm} mm
                {t.sucio ? " · cambios sin guardar" : ""}
              </span>
            )
          }
        >
          <Btn variant="ghost" onClick={t.restaurar} disabled={!hoja} title="Las posiciones de fábrica de esta hoja; la medida y el corrimiento quedan">
            <RotateCcw className="h-4 w-4" aria-hidden /> De fábrica
          </Btn>
          <Btn variant="secondary" onClick={() => void t.guardar()} disabled={!t.sucio || t.guardando}>
            <Save className="h-4 w-4" aria-hidden /> {t.guardando ? "Guardando…" : "Guardar"}
          </Btn>
          <Btn variant="primary" onClick={() => void imprimir()} disabled={!hoja || t.guardando}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir {cat.nombre.toLowerCase()}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="flex flex-col gap-3">
        {!hoja ? (
          t.error ? null : <PanelSkeleton />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1 sm:max-w-md">
                <Opciones label="Hoja del talonario" labelOculto value={t.formato} opciones={formatos} onChange={t.elegirFormato} />
              </div>
              {total > 1 && (
                <div className="flex items-center gap-1" aria-label="Hoja que se ve">
                  <Btn variant="ghost" aria-label="Hoja anterior" disabled={t.pagina === 0} onClick={() => t.setPagina(t.pagina - 1)}>
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Btn>
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                    Hoja {t.pagina + 1} de {total}
                  </span>
                  <Btn variant="ghost" aria-label="Hoja siguiente" disabled={t.pagina >= total - 1} onClick={() => t.setPagina(t.pagina + 1)}>
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Btn>
                </div>
              )}
              <div className="ml-auto w-64 max-sm:w-full">
                <Opciones label="Zoom" labelOculto value={zoom} opciones={ZOOMS} onChange={setZoom} />
              </div>
            </div>
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <HojaTalonario t={t} fondo={f.fondo} zoom={Number(zoom)} />
              <div className="flex min-w-0 flex-col gap-3">
                <PanelTalonario t={t} />
                <AjustesTalonario t={t} f={f} conValores={conValores} setConValores={setConValores} onPrueba={prueba} />
              </div>
            </div>
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
