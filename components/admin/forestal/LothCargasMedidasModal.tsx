"use client";

/**
 * «Cargas medidas» en el despacho con guía (16-10, F3): las cargas que el monte
 * midió por foto y guardó. «Usar en esta guía» pasa sus trozas a «Anotar a
 * mano» por el mismo camino que «Pasar a la guía» de «Medir por foto»
 * (`agregarVarias`) y la anota: el registro la manda y el servidor la marca
 * `usada` con el N° antes de escribir el libro (409 si ya va en otra guía).
 * Nada se escribe hasta registrar.
 *
 * Los N° son los del monte si cuadran con la guía; si no (la guía ya tenía
 * trozas a mano, o el libro avanzó desde que se midió), pasan con los de la
 * guía y se avisa: la foto anotada y la marca en la troza dicen otro N°.
 */
import { useMemo, useState } from "react";
import { RefreshCw } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TROZAS_POR_GUIA_MAX, piezasAMano } from "@/lib/forestal/loth-trozas-a-mano";
import { MAX_CARGAS_POR_GUIA, etiquetaPermiso, filasParaLaGuia, rangoDeCodigos, type CargaMedida } from "@/lib/forestal/medicion-carga";
import { Btn } from "./ctp-shared";
import type { CargasMedidas } from "./hooks/use-cargas-medidas";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import LothCargasMedidasTarjeta, { DescartarCarga } from "./LothCargasMedidasTarjeta";

const PILDORA = "rounded-full px-2.5 py-0.5 text-xs font-bold";

/** Los N° que llevarán en la guía las filas nuevas, numeradas como las numera el despacho. */
function numerosEnLaGuia(g: DespachoGuiaLoth, c: CargaMedida): { desde: number; codigos: string[] } {
  const filas = filasParaLaGuia(c);
  const nDelLibro = g.piezas.length - g.piezasManuales.length;
  const ocupados = g.piezas.slice(0, nDelLibro).map((p) => p.codigo);
  const correlativo = g.siguienteCorrelativo[g.planId ?? "sin_permiso"] ?? 1;
  /* Guía sin trozas a mano: arranca donde arrancó el monte (o donde va el libro, si avanzó). */
  const desde = g.aMano.filas.length === 0 && g.aMano.desde <= 1 ? Math.max(c.desde, correlativo) : g.aMano.desde;
  const todas = piezasAMano([...g.aMano.filas, ...filas], ocupados, g.arbolesAMano.porId, desde);
  return { desde, codigos: todas.slice(-filas.length).map((p) => p.codigo) };
}

export default function LothCargasMedidasModal({ g, cm, onClose }: { g: DespachoGuiaLoth; cm: CargasMedidas; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const cargas = cm.datos?.cargas ?? [];
  const enUso = useMemo(() => new Set(g.fotosCarga.cargas), [g.fotosCarga.cargas]);
  const planes = g.prep?.planes;
  const permisoDe = (id: string | null) => (id ? (etiquetaPermiso(planes?.find((p) => p.id === id)) ?? "otro permiso") : null);
  const restantes = TROZAS_POR_GUIA_MAX - g.piezas.length;

  function usar(c: CargaMedida) {
    setError(null);
    if (enUso.has(c.id)) return;
    if (enUso.size >= MAX_CARGAS_POR_GUIA) {
      setError(`Una guía lleva hasta ${MAX_CARGAS_POR_GUIA} cargas del monte.`);
      return;
    }
    if (c.trozas > restantes) {
      setError(`La guía lleva hasta ${TROZAS_POR_GUIA_MAX} trozas: quedan ${Math.max(0, restantes)} y la carga trae ${c.trozas}.`);
      return;
    }
    const { desde, codigos } = numerosEnLaGuia(g, c);
    if (desde !== g.aMano.desde) g.aMano.setDesde(desde);
    g.aMano.agregarVarias(filasParaLaGuia(c));
    g.fotosCarga.usarCarga(c.id);
    const iguales = codigos.every((cod, i) => cod === c.filas[i]?.codigo);
    if (iguales) toast.success(`${c.trozas} ${c.trozas === 1 ? "troza pasó" : "trozas pasaron"} a «Anotar a mano» (N° ${rangoDeCodigos(c.filas)}).`);
    else {
      toast.warning(
        `Las trozas pasaron con los N° ${codigos[0]} a ${codigos.at(-1)}, pero en la foto del monte son ${rangoDeCodigos(c.filas)}: corrige la marca en las trozas o el N° en «Anotar a mano».`,
        { duration: 15_000 },
      );
    }
    onClose();
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      aboveModals
      size="lg"
      title="Cargas medidas en el monte"
      ayuda={
        <InfoTip
          title="Cargas medidas en el monte"
          what="Las cargas que el celular del monte midió por foto y guardó. «Usar en esta guía» pone sus trozas en «Anotar a mano», con los N° del monte si la guía no tiene otras trozas a mano."
          affects="Al registrar la guía, la carga queda «usada» con el N° de la guía y sus fotos pasan a los papeles de la guía (casillero «Otros»). Si no registras, la carga sigue sin usar."
          example="N° 24 a 37 · 14 trozas · 3,412 m³ · Tornillo · 3,20 m"
          ariaLabel="Qué son las cargas medidas"
        />
      }
      footer={
        <ModalFooter error={error} nota={`${cargas.length} sin usar`}>
          <Btn variant="secondary" onClick={() => void cm.recargar()} disabled={cm.cargando} aria-label="Volver a leer las cargas">
            <RefreshCw className={cm.cargando ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden /> <span className="max-sm:sr-only">Actualizar</span>
          </Btn>
          <Btn onClick={onClose}>Cerrar</Btn>
        </ModalFooter>
      }
    >
      <div className="space-y-3" data-qa="lista-cargas-medidas">
        {cm.error && (
          <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {cm.error}
          </p>
        )}
        {cargas.length === 0 && !cm.cargando && <p className="py-6 text-center text-sm text-[var(--text-secondary)]">El monte no tiene cargas sin usar.</p>}
        {cargas.map((c) => {
          const usada = enUso.has(c.id);
          const otroPermiso = c.planId !== (g.planId ?? null);
          return (
            <LothCargasMedidasTarjeta
              key={c.id}
              c={c}
              permiso={permisoDe(c.planId)}
              aviso={
                otroPermiso && !usada ? (
                  <span className={`${PILDORA} inline-block bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]`}>
                    Se midió para {permisoDe(c.planId) ?? "sin permiso"}; esta guía es de {permisoDe(g.planId) ?? "sin permiso"}
                  </span>
                ) : null
              }
              acciones={
                usada ? (
                  <span className={`${PILDORA} bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]`}>
                    Ya está en esta guía
                  </span>
                ) : (
                  <>
                    <Btn variant="primary" size="sm" onClick={() => usar(c)} data-qa="usar-carga">
                      Usar en esta guía
                    </Btn>
                    <DescartarCarga onDescartar={(motivo) => cm.descartar(c.id, motivo)} />
                  </>
                )
              }
            />
          );
        })}
      </div>
    </AdminModal>
  );
}
