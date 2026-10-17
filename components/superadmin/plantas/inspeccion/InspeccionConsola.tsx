"use client";

/**
 * /superadmin/plantas/[tenantId]/inspeccion/[id] — la inspección en la planta,
 * pensada para el celular del inspector: secciones (`?sub=`) para contar las
 * trozas, la aserrada, anotar hallazgos y cerrar; arriba, si lo anotado ya
 * está guardado (y, si no se guardó y ya bajaste, el aviso flota abajo).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ErrorAlert, InfoAlert, LoadingState, WarningAlert } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { BarraDeSecciones, idPestanaDeSeccion, type SeccionDeBarra } from "@/components/admin/shared/BarraDeSecciones";
import { resumirConteo } from "@/lib/forestal/conteo-patio";
import { diaCorto } from "../formato";
import { IndicadorGuardado } from "./IndicadorGuardado";
import { InspeccionAserrada } from "./InspeccionAserrada";
import { InspeccionCabecera } from "./InspeccionCabecera";
import { InspeccionCierre } from "./InspeccionCierre";
import { InspeccionHallazgos } from "./InspeccionHallazgos";
import { InspeccionTrozas } from "./InspeccionTrozas";
import { imprimirActa } from "./imprimir-acta";
import { filasConDiferencia } from "./inspeccion-datos";
import { useInspeccion } from "./use-inspeccion";

type Seccion = "trozas" | "aserrada" | "hallazgos" | "cierre";
const SECCIONES: Seccion[] = ["trozas", "aserrada", "hallazgos", "cierre"];
const ID_PANEL = "inspeccion-planta-panel";

function useSeccion(): [Seccion, (s: Seccion) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const crudo = params.get("sub") as Seccion | null;
  const activa: Seccion = crudo && SECCIONES.includes(crudo) ? crudo : "trozas";
  const cambiar = useCallback(
    (s: Seccion) => {
      const q = new URLSearchParams(params.toString());
      if (s === "trozas") q.delete("sub");
      else q.set("sub", s);
      const t = q.toString();
      router.replace(t ? `${pathname}?${t}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return [activa, cambiar];
}

/**
 * ¿La franja de arriba salió de la pantalla? El <main> del superadmin es
 * `overflow-auto` pero no se desplaza (se desplaza la página): un `sticky`
 * adentro nunca se pega, así que el aviso de «no se guardó» flota aparte.
 */
function useFueraDeVista(el: Element | null): boolean {
  const [fuera, setFuera] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setFuera(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return fuera;
}

export function InspeccionConsola({ tenantId, id }: { tenantId: string; id: string }) {
  const s = useInspeccion(tenantId, id);
  const [seccion, irA] = useSeccion();
  const [franja, setFranja] = useState<HTMLDivElement | null>(null);
  const franjaFuera = useFueraDeVista(franja);
  /* Tras un fallo, el aviso flotante se queda mientras reintenta y hasta que se ve «Guardado». */
  const fallo = s.estado === "error" || s.estado === "sin-conexion";
  const [flota, setFlota] = useState(false);
  if (fallo && !flota) setFlota(true);
  useEffect(() => {
    if (!flota || (s.estado !== "guardado" && s.estado !== "bloqueada")) return;
    const t = setTimeout(() => setFlota(false), 2500);
    return () => clearTimeout(t);
  }, [flota, s.estado]);
  const faltan = useMemo(
    () => (s.conteo ? resumirConteo(s.conteo).faltan.length : (s.insp?.trozas?.faltantes ?? null)),
    [s.conteo, s.insp],
  );

  if (!s.insp || !s.borrador) {
    if (s.errorCarga) {
      return (
        <ErrorAlert
          title="No se pudo abrir la inspección"
          description={s.errorCarga}
          action={<Button variant="secondary" onClick={() => void s.recargar()}>Reintentar</Button>}
        />
      );
    }
    return <LoadingState message="Abriendo la inspección…" />;
  }

  const insp = s.insp;
  const imprimir = () => imprimirActa(insp, s.borrador, s.conteo);
  const secciones: SeccionDeBarra<Seccion>[] = [
    { clave: "trozas", rotulo: "Trozas", cuenta: faltan ?? undefined },
    { clave: "aserrada", rotulo: "Aserrada", cuenta: filasConDiferencia(s.borrador.aserrada) },
    { clave: "hallazgos", rotulo: "Hallazgos", cuenta: s.borrador.hallazgos.length },
    { clave: "cierre", rotulo: "Cierre" },
  ];

  return (
    <div className={flota ? "space-y-4 pb-16" : "space-y-4"} data-inspeccion={insp.id}>
      <InspeccionCabecera insp={insp} onImprimir={imprimir} />

      {insp.estado === "anulada" && (
        <WarningAlert title="Inspección anulada" description={insp.motivoAnulacion ? `Motivo: ${insp.motivoAnulacion}` : "No cuenta para la planta."} />
      )}
      {insp.estado === "cerrada" && (
        <InfoAlert title={`Cerrada el ${diaCorto(insp.cerradaAt)}`} description="El acta quedó como está: sólo se puede ver e imprimir." />
      )}
      {s.estado === "bloqueada" && insp.estado === "abierta" && s.mensaje && <WarningAlert title="Ya no se puede editar" description={s.mensaje} />}

      {/* En el celular las 4 pestañas no entran al lado del indicador: van solas, hasta el borde
          del <main> (-mx-4 = el relleno del contenido), y el indicador debajo. */}
      <div ref={setFranja} className="-mx-4 flex flex-col items-start gap-1.5 sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={irA} etiqueta="Partes de la inspección" idPanel={ID_PANEL} />
        </div>
        {insp.estado === "abierta" && <IndicadorGuardado estado={s.estado} guardadoEn={s.guardadoEn} onReintentar={() => void s.guardarYa()} />}
      </div>
      {/* Mientras reintenta, el aviso se queda: si se fuera, la página saltaría hacia arriba. */}
      {(fallo || (flota && s.estado === "guardando")) && s.mensaje && (
        <ErrorAlert
          title="Lo último no se guardó"
          description={s.mensaje}
          action={<Button variant="secondary" onClick={() => void s.guardarYa()}>Reintentar</Button>}
        />
      )}

      {insp.estado === "abierta" && franjaFuera && flota && (
        <div className="fixed bottom-4 right-4 z-30 rounded-full shadow-[var(--shadow-lg)]" data-guardado-flotante>
          <IndicadorGuardado estado={s.estado} guardadoEn={s.guardadoEn} onReintentar={() => void s.guardarYa()} />
        </div>
      )}

      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
        {seccion === "trozas" && <InspeccionTrozas s={s} />}
        {seccion === "aserrada" && <InspeccionAserrada s={s} />}
        {seccion === "hallazgos" && <InspeccionHallazgos s={s} />}
        {seccion === "cierre" && <InspeccionCierre s={s} faltan={faltan} onImprimir={imprimir} />}
      </div>
    </div>
  );
}
