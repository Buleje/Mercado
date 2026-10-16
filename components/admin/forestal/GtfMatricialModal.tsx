"use client";

/**
 * «Imprimir en talonario» — la GTF y su lista de trozas en el talonario
 * PREIMPRESO de la matricial (Brandon 15-10: «ahí solo se pondrá e imprimirá
 * los valores de los campos… lo acomodaré para que cuadre con mi talonario»).
 *
 * Tres bloques, con la hoja en el medio y lo más grande posible (Brandon
 * 15-10: «que el contenido de lo impreso se vea en el medio… compacto»):
 * a la izquierda los campos (buscar, si se imprime, elegir); al centro la
 * barra y la hoja a escala; a la derecha de quién es el talonario, el campo
 * elegido y, plegados, calibrar / medida / foto. Los costados se pliegan y se
 * recuerdan; a 400 px la hoja va arriba y los bloques en pestañas debajo.
 *
 * Imprime SÓLO los valores (Courier New negrita, negro, `@page` del tamaño
 * del talonario, margen 0) y en una sola pasada: las 3 copias salen del papel
 * autocopiativo. Los nombres de los campos sobre la hoja son de la pantalla:
 * el papel sale de `gtf-matricial-print.ts`, que no los conoce. La
 * disposición se guarda POR TITULAR (el de la guía) y por hoja.
 *
 * Los valores son los de «Imprimir hoja SERFOR» (`entradasDeLaGuia`): esto no
 * recalcula nada.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, PanelLeftOpen, PanelRightClose, PanelRightOpen, Printer, RotateCcw, Save } from "@buleje/design-system/icons";
import AdminModal, { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import { htmlPruebaTalonario, htmlTalonario, imprimirEnMarco } from "@/lib/forestal/gtf-matricial-print";
import { Btn, ModalFooter, PanelSkeleton, useCierreSeguro } from "./ctp-shared";
import type { Gtf } from "./gtf-tabla-columnas";
import { useGtfMatricial } from "./hooks/use-gtf-matricial";
import { useFondoTalonario } from "./hooks/use-gtf-matricial-fondo";
import { usePanelesTalonario, type PanelesTalonario, type PestanaTalonario } from "./hooks/use-gtf-matricial-paneles";
import { useSeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";
import { useZoomTalonario } from "./hooks/use-gtf-matricial-zoom";
import { BotonIcono, Opciones } from "./gtf-matricial-controles";
import BarraTalonario from "./gtf-matricial-barra";
import HojaTalonario from "./gtf-matricial-hoja";
import CamposTalonario from "./gtf-matricial-campos";
import TitularTalonario from "./gtf-matricial-titular";
import PanelTalonario from "./gtf-matricial-panel";
import AjustesTalonario from "./gtf-matricial-ajustes";

/** Clases enteras (Tailwind no ve las armadas): costado abierto 13/15 rem a la izq., 15/17 a la der.; plegado, la barrita de 3 rem. */
const COLUMNAS: Record<string, string> = {
  "1-1": "lg:grid-cols-[13rem_minmax(0,1fr)_15rem] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]",
  "0-1": "lg:grid-cols-[3rem_minmax(0,1fr)_15rem] xl:grid-cols-[3rem_minmax(0,1fr)_17rem]",
  "1-0": "lg:grid-cols-[13rem_minmax(0,1fr)_3rem] xl:grid-cols-[15rem_minmax(0,1fr)_3rem]",
  "0-0": "lg:grid-cols-[3rem_minmax(0,1fr)_3rem]",
};

const PESTANAS: ReadonlyArray<{ value: PestanaTalonario; label: string }> = [
  { value: "campos", label: "Campos" },
  { value: "elegido", label: "Elegido" },
  { value: "talonario", label: "Talonario" },
];

/** Lo que se ve en el celular según la pestaña; en escritorio, todo. */
const enPestana = (p: PanelesTalonario, cual: PestanaTalonario): string => (p.pestana === cual ? "" : "max-lg:hidden");

export default function GtfMatricialModal({ g, onClose }: { g: Gtf; onClose: () => void }) {
  const t = useGtfMatricial(g);
  const f = useFondoTalonario(t.formato);
  const s = useSeleccionTalonario(t);
  const z = useZoomTalonario(t.hoja, s.centroElegido);
  const p = usePanelesTalonario();
  const [conValores, setConValores] = useState(true);
  const cerrar = useCierreSeguro(t.sucio, onClose);
  const hoja = t.hoja;
  const cat = CATALOGO[t.formato];
  const total = t.paginas.length;
  const nombre = `GTF ${g.gtfNumber} · ${cat.nombre}`;
  const deQuien = t.info ? (t.info.titular?.nombre ?? "la empresa") : g.titularName;

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

  return (
    <AdminModal
      open
      onClose={() => void cerrar()}
      variant="fullscreen"
      icon={Printer}
      title="Imprimir en talonario"
      description={`${deQuien ? `Talonario de ${deQuien} · ` : ""}GTF ${g.gtfNumber}`}
      ayuda={
        <InfoTip
          icono="ayuda"
          title="Cómo se usa"
          what="Arrastra cada valor hasta su casillero (o muévelo con las flechas), guarda, y pon el talonario en la matricial. Sólo se imprimen los valores: el talonario ya trae los rótulos, y los nombres chicos sobre la hoja son sólo de la pantalla."
          affects="Cada titular tiene su talonario: lo que guardas vale para todas las guías de ese titular. Uno sin el suyo arranca con el de la empresa."
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
          {total > 1 && (
            <span className="flex items-center gap-1" aria-label="Hoja que se ve">
              <Btn variant="ghost" aria-label="Hoja anterior" disabled={t.pagina === 0} onClick={() => t.setPagina(t.pagina - 1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Btn>
              <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                Hoja {t.pagina + 1} de {total}
              </span>
              <Btn variant="ghost" aria-label="Hoja siguiente" disabled={t.pagina >= total - 1} onClick={() => t.setPagina(t.pagina + 1)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Btn>
            </span>
          )}
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
      {!hoja ? (
        <div className={`${MODAL_GUTTER} py-5`}>{t.error ? null : <PanelSkeleton />}</div>
      ) : (
        <div
          data-qa="talonario-bloques"
          className={`${MODAL_GUTTER} flex flex-col gap-2 py-3 lg:absolute lg:inset-0 lg:grid lg:grid-rows-[minmax(0,1fr)] lg:gap-3 ${COLUMNAS[`${+p.izq}-${+p.der}`]}`}
        >
          {/* Centro: la barra y la hoja. Primero en el DOM: a 400 px va arriba. */}
          <div className="flex min-w-0 flex-col gap-2 lg:col-start-2 lg:row-start-1 lg:min-h-0">
            <BarraTalonario t={t} s={s} z={z} p={p} />
            <HojaTalonario t={t} s={s} z={z} fondo={f.fondo} nombres={p.nombres} />
          </div>

          <div className="lg:hidden">
            <Opciones label="Qué ver debajo de la hoja" labelOculto value={p.pestana} opciones={PESTANAS} onChange={p.setPestana} />
          </div>

          {/* Izquierda: los campos. */}
          <div className={`min-w-0 lg:col-start-1 lg:row-start-1 lg:min-h-0 ${enPestana(p, "campos")}`}>
            <div className={p.izq ? "lg:h-full" : "lg:hidden"}>
              <CamposTalonario t={t} s={s} onPlegar={p.alternarIzq} />
            </div>
            {!p.izq && (
              <div className="flex justify-center max-lg:hidden">
                <BotonIcono icon={PanelLeftOpen} label="Abrir los campos" onClick={p.alternarIzq} />
              </div>
            )}
          </div>

          {/* Derecha: de quién es, el campo elegido y los ajustes del papel. Plegada, la barrita (sólo en escritorio). */}
          <div className={`flex min-w-0 flex-col gap-2 lg:col-start-3 lg:row-start-1 lg:min-h-0 ${p.pestana === "campos" ? "max-lg:hidden" : ""}`}>
            {!p.der && (
              <div className="flex justify-center max-lg:hidden">
                <BotonIcono icon={PanelRightOpen} label="Abrir el campo elegido y los ajustes" onClick={p.alternarDer} />
              </div>
            )}
            <div className={`flex min-w-0 flex-col gap-2 ${p.der ? "lg:-mr-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1" : "lg:hidden"}`}>
              <div className={enPestana(p, "talonario")}>
                <TitularTalonario
                  t={t}
                  accion={
                    <span className="max-lg:hidden">
                      <BotonIcono icon={PanelRightClose} label="Plegar este bloque" ayuda="La hoja gana ancho; se abre con la barrita de la derecha." onClick={p.alternarDer} />
                    </span>
                  }
                />
              </div>
              <div className={enPestana(p, "elegido")}>
                <PanelTalonario t={t} s={s} />
              </div>
              <div className={enPestana(p, "talonario")}>
                <AjustesTalonario t={t} f={f} conValores={conValores} setConValores={setConValores} onPrueba={prueba} />
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminModal>
  );
}
