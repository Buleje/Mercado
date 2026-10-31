"use client";

/**
 * Registrar la producción de un lote, con la forma del SNIFFS (ADR-349).
 *
 * El formulario oficial no pregunta "¿cuántos m³ salieron?": declara **paquetes**
 * —código, producto, presentación, piezas y, si se dimensiona, espesor × ancho ×
 * largo— y el volumen sale de sumarlos.
 *
 * Tres pasos en la misma ventana (Brandon 28-10: 28 campos en una pantalla era
 * lo que más se escribe en Blas): **Origen** (la madera que entra y la corrida),
 * **Piezas** (los paquetes, con dictado) y **Revisar** (cifras, rendimiento,
 * avisos, reparto y cobro). Es un cambio de PANTALLA: el estado vive en
 * `useRegistrarProduccion` —el cuerpo del componente viejo, tal cual— y los
 * pasos escondidos siguen montados (`hidden`), así que ir y volver no pierde
 * nada. «Guardar» y Ctrl+Enter siguen en el pie desde cualquier paso, como en
 * el resto de los pasos del panel (`barra-de-pasos.tsx`): la barra ordena, no
 * encierra. Lo que se entrega a `onConfirmar` está congelado en
 * `__tests__/forestal-registrar-produccion-payload.test.tsx`.
 */
import { useRef, useState } from "react";
import { Boxes, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  AnteriorSiguiente,
  BarraDePasos,
  type PasoDeLaBarra,
} from "@/components/admin/shared/barra-de-pasos";
import { button } from "@/components/ui-system/button-variants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { esIsoValido, etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import FranjaDeProduccion from "./registrar-produccion/Franja";
import PasoOrigen from "./registrar-produccion/PasoOrigen";
import PasoPiezas from "./registrar-produccion/PasoPiezas";
import PasoRevisar from "./registrar-produccion/PasoRevisar";
import { useRegistrarProduccion } from "./registrar-produccion/use-registrar-produccion";
import type { RegistrarProduccionProps } from "./registrar-produccion/tipos";

export type {
  MaterialAConsumir,
  ProduccionRegistrada,
  RegistrarProduccionProps,
} from "./registrar-produccion/tipos";

type PasoId = "origen" | "piezas" | "revisar";

const ENLACE = button({
  variant: "link",
  className: "h-auto shrink-0 px-0 font-bold text-current underline underline-offset-2",
});

export default function CtpRegistrarProduccionModal(p: RegistrarProduccionProps) {
  const { lote, material, guardando, error, titulo, descripcion, ctaLabel, onClose } = p;
  const r = useRegistrarProduccion(p);
  const { previo, paquetes, motivos, totales, acumulado, rendimientoPct, veredicto, listo } = r;

  /* Ampliando, la corrida ya existe (su línea y su fecha no se tocan): se
     entra directo a las piezas, que es lo único que se viene a cargar. */
  const [paso, setPaso] = useState<PasoId>(() => (previo > 0 ? "piezas" : "origen"));
  /* El cobro se monta la primera vez que se mira «Revisar» (ver `PasoRevisar`). */
  const [cobroMontado, setCobroMontado] = useState(false);
  const piezasRef = useRef<HTMLDivElement>(null);
  const irA = (id: PasoId) => {
    setPaso(id);
    if (id === "revisar") setCobroMontado(true);
  };
  /* Enter en la corrida pasa a las piezas con el cursor en el primer campo
     (el dictado): seguir tipeando sin tocar el mouse. */
  const aLasPiezas = () => {
    irA("piezas");
    requestAnimationFrame(() =>
      piezasRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }),
    );
  };

  const hayAvisos =
    r.avisosDeCifras.length > 0 ||
    (paquetes.length > 0 &&
      rendimientoPct != null &&
      veredicto.tono !== "ok" &&
      veredicto.tono !== "neutro");
  const pasos: PasoDeLaBarra<PasoId>[] = [
    { id: "origen", corto: "Origen", estado: previo > 0 || esIsoValido(r.dia) ? "completo" : "falta" },
    { id: "piezas", corto: "Piezas", estado: motivos.length === 0 ? "completo" : "falta" },
    {
      id: "revisar",
      corto: "Revisar",
      estado: !r.aserrioValido
        ? "falta"
        : hayAvisos
          ? "pendiente"
          : paquetes.length > 0
            ? "completo"
            : "opcional",
    },
  ];
  /* Lo del paso 1 en una línea, a la vista desde los otros dos. */
  const origen = [
    lote ? `Lote ${lote.code}` : null,
    material.especie,
    `${fmtM3(material.volumenM3)} m³`,
    r.linea,
    esIsoValido(r.dia) ? etiquetaLarga(r.dia) : "sin fecha",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      size="planilla"
      icon={Boxes}
      title={titulo ?? `Producción del lote ${lote ? lote.code : "—"}`}
      description={
        descripcion ??
        `${material.especie} · ${material.piezas} troza${material.piezas === 1 ? "" : "s"} a consumir`
      }
      footer={
        <ModalFooter
          error={error ?? (motivos.length > 0 && paquetes.length > 0 ? motivos[0] : null)}
          nota={
            <span className="font-mono tabular-nums">
              {totales.paquetes} paquete{totales.paquetes === 1 ? "" : "s"} · {totales.piezas} pza ·{" "}
              {fmtM3(totales.volumen)} m³
              {/* Al ampliar, el pie dice las dos cifras: lo que se agrega ahora y
                  con cuánto queda la corrida. Una sola se lee como la otra. */}
              {previo > 0 && ` · total ${fmtM3(acumulado)} m³`}
              {rendimientoPct != null && ` · rendimiento ${rendimientoPct}%`}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Cerrar
          </Btn>
          <Btn variant="primary" disabled={!listo} onClick={r.confirmar} title="Ctrl+Enter">
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Boxes className="h-4 w-4" />
            )}
            {ctaLabel ?? "Guardar producción"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3 @container">
        {/* La barra se pega arriba sola. Cargando o revisando, debajo va lo ya
            resuelto y la franja de estado (qué entró, qué se declaró, cuánto
            queda), que al bajar se pega ENCIMA de la barra: es la cuenta que
            gobierna cada paquete y ocupa lo mismo que en la ventana de un solo
            paso (81 px en 1280, 109 en 400). Barra + franja juntas pegadas
            eran 188/216 px: un tercio del alto en el celular. */}
        <BarraDePasos
          etiqueta="Pasos de la producción"
          borde="modal"
          pasos={pasos}
          actual={paso}
          onIr={irA}
        />
        {paso !== "origen" && (
          <>
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" data-resumen-origen>
              <span className="min-w-0 flex-1 truncate">
                <b className="text-[var(--text-primary)]">Origen:</b> {origen}
              </span>
              <button type="button" onClick={() => irA("origen")} className={ENLACE}>
                Cambiar
              </button>
            </p>
            <div className="sticky top-0 z-20">
              <FranjaDeProduccion r={r} material={material} />
            </div>
          </>
        )}

        {/* Un borrador que vuelve SIN avisar es peor que perderlo: el operador
            guardaría paquetes que no recuerda haber cargado. Se dice, y se
            puede descartar de un click. */}
        {r.borradorRecuperado > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--data-info-500)]/12 px-3 py-2 text-sm text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
            <Boxes className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              Recuperé <b className="tabular-nums">{r.borradorRecuperado}</b> paquete
              {r.borradorRecuperado === 1 ? "" : "s"} que habías cargado y no llegaste a guardar.
            </span>
            <button type="button" onClick={r.descartarBorrador} className={ENLACE}>
              Descartar y empezar de cero
            </button>
          </p>
        )}

        <div data-paso="origen" hidden={paso !== "origen"} className="space-y-3">
          <PasoOrigen r={r} p={p} onSiguiente={aLasPiezas} />
          <AnteriorSiguiente pasos={pasos} actual="origen" onIr={irA} />
        </div>
        <div ref={piezasRef} data-paso="piezas" hidden={paso !== "piezas"} className="space-y-3">
          <PasoPiezas r={r} p={p} activo={paso === "piezas"} />
          <AnteriorSiguiente pasos={pasos} actual="piezas" onIr={irA} />
        </div>
        <div data-paso="revisar" hidden={paso !== "revisar"} className="space-y-3">
          <PasoRevisar r={r} p={p} montarCobro={cobroMontado} />
          <AnteriorSiguiente pasos={pasos} actual="revisar" onIr={irA} />
        </div>
      </ModalBody>
    </AdminModal>
  );
}
