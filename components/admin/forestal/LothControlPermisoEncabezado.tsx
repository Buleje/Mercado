"use client";

/**
 * Lo que va arriba de las trozas en «Control del permiso», en UNA tarjeta y en
 * el orden en que se pregunta (compactado 17-10, Brandon: «compactar el Libro
 * TH»; antes eran cuatro bloques y la lista arrancaba a 3 pantallas):
 *
 *   1. Ficha del permiso en una línea — ¿con qué papel trabajo y cuánto le
 *      queda? «Ver ficha» despliega la ficha entera y los planes vivos (el plan
 *      vigente que `?active=1` deja fuera).
 *   2. Saldo en la misma línea — por talar, en patio, excedido; la tabla por
 *      especie vive UNA vez, en Control › Extracción («Por especie →»).
 *   3. Cuadre por guía (plegable, cerrado) — ¿lo que declara cada GTF es lo que salió?
 *
 * No lee nada por su cuenta: la carátula, el plan del libro, el censo y las
 * especies autorizadas los trae el libro; las trozas cruzadas, TODAS las GTF
 * (anuladas incluidas) y los planes los trae el tablero (`useTableroContexto`).
 * Acá sólo se calcula con las funciones puras y se pinta.
 *
 * El «Informe del permiso» (PDF) ya no es un botón en una fila propia encima
 * de la ficha (04-10, ley de la vista: sin botones huérfanos): es una opción
 * del menú «⋯» de la cabecera del Control (`accionInformeDelControl`).
 *
 * De qué plan habla (04-10): del permiso del chip del libro si es uno puntual
 * — ficha, planes vivos, saldo, cuadre e informe, igual que la tabla —; con
 * «Todos» o «Líneas sin permiso», del plan activo del libro, y lo dice en una
 * línea (`planDelControl`).
 */

import { useId, useMemo } from "react";
import { toast } from "sonner";
import { FileText } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import type { CaratulaFicha, PlanFicha } from "@/lib/forestal/loth-ficha-permiso";
import { cuadreDelControl, planDelControl, trozasDelControl } from "@/lib/forestal/loth-control-del-plan";
import { nombreDelPlan } from "@/lib/forestal/loth-ficha-permiso";
import {
  VEREDICTOS_META,
  VEREDICTOS_ROJOS,
  contarVeredictos,
  cuadrarGuias,
  type VeredictoGuia,
} from "@/lib/forestal/loth-cuadre-guias";
import { saldoPorEspecie, type EntradaSaldo } from "@/lib/forestal/loth-saldo-especie";
import { imprimirInformePermiso } from "@/lib/forestal/loth-informe-permiso-print";
import type { DatosEncabezadoTablero } from "./LothTableroTrozas";
import LothFichaPermiso from "./LothFichaPermiso";
import LothFichaPermisoLinea from "./LothFichaPermisoLinea";
import { useIrASeccionControl } from "./LothControlPestanas";
import LothPlanesVivos from "./LothPlanesVivos";
import LothSaldoEspecies from "./LothSaldoEspecies";
import LothControlSaldoLinea from "./LothControlSaldoLinea";
import { LothCuadreGuias } from "./LothCuadreGuias";
import { SeccionPlegable } from "./loth-seccion-plegable";

/** Claves de localStorage de lo que se despliega (una por bloque). */
export const CLAVE_PLEGABLE_SALDO = "loth-control-saldo-abierto-v1";
export const CLAVE_PLEGABLE_CUADRE = "loth-control-cuadre-abierto-v1";
export const CLAVE_FICHA_ABIERTA = "loth-control-ficha-abierta-v1";



export interface LothControlPermisoEncabezadoProps {
  datos: DatosEncabezadoTablero;
  caratula: CaratulaFicha | null;
  /** El plan de `?active=1`: contra él se miden la ficha grande, el saldo y el cupo. */
  planActivo: (PlanFicha & { id: string }) | null;
  /** Censo + libro + autorizadas del plan del libro (lo mismo que alimenta el cupo). */
  saldo: Omit<EntradaSaldo, "planId">;
  onCompletarCaratula?: () => void;
  onCompletarPlan?: () => void;
  onVerGtf?: (gtf: string) => void;
}

const AYUDA_CUADRE = {
  what: "Una fila por guía: los m³ y las piezas que declara la GTF contra la suma de las trozas que la citan en «Despacho de trozas».",
  affects:
    "Es el cruce que hace el inspector. «No cuadra» = salió madera sin respaldo o falta asentar una troza. Una guía citada que no está registrada, o que está anulada, deja la troza sin origen legal.",
  example: "GTF 019-0000002 declara 4,951 m³ y 1 pieza; en el libro la cita la troza 111-A con 4,951 m³ → cuadra.",
} as const;

/** Orden de lectura del resumen: lo que pide atención primero. */
const ORDEN_VEREDICTOS = (Object.keys(VEREDICTOS_META) as VeredictoGuia[]).sort(
  (a, b) => VEREDICTOS_META[a].orden - VEREDICTOS_META[b].orden,
);

/** Lo que lleva el «Informe del permiso»: lo mismo que pinta este encabezado. */
export type EntradaInformeControl = Pick<LothControlPermisoEncabezadoProps, "datos" | "caratula" | "planActivo" | "saldo">;

/**
 * Arma e imprime el informe con las MISMAS funciones puras que la pantalla
 * (ficha del plan del libro, planes vivos, saldo, cuadre, trozas). Síncrono y
 * dentro del clic: la ventana de impresión no cae en el bloqueador de pop-ups.
 */
export function imprimirInformeDelControl({ datos, caratula, planActivo, saldo }: EntradaInformeControl): void {
  const pc = planDelControl(datos.planSel, datos.planes, planActivo);
  if (pc.puntual && !pc.plan) throw new Error("Todavía se está leyendo el plan elegido. Vuelve a intentarlo en un momento.");
  imprimirInformePermiso({
    caratula,
    plan: pc.plan,
    planes: pc.vivos,
    saldo: saldoPorEspecie({ ...saldo, planId: pc.id }),
    // Sin la lista de guías no se cuadra (cruzar contra [] acusaría a todas).
    cuadre: cuadreDelControl(datos.gtfs ? cuadrarGuias(datos.filas, datos.gtfs) : null, datos.filas, pc.puntual),
    trozas: trozasDelControl(datos.filas, pc.puntual),
  });
}

/** La opción del menú «⋯» de la cabecera del Control: va junto al reporte impreso. */
export function accionInformeDelControl(entrada: EntradaInformeControl): MenuAccion {
  return {
    id: "informe-permiso",
    label: "Informe del permiso (PDF)",
    hint: "Ficha, saldo por especie, cuadre por guía y trozas: para la ARFFS u OSINFOR",
    icon: FileText,
    tone: "dark",
    disabled: entrada.datos.cargando,
    onSelect: () => {
      try {
        imprimirInformeDelControl(entrada);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo abrir el informe.");
      }
    },
  };
}

export default function LothControlPermisoEncabezado({
  datos,
  caratula,
  planActivo,
  saldo,
  onCompletarCaratula,
  onCompletarPlan,
  onVerGtf,
}: LothControlPermisoEncabezadoProps) {
  // El plan del chip del libro si es uno puntual; si no, el activo (o el primero vivo).
  const pc = useMemo(() => planDelControl(datos.planSel, datos.planes, planActivo), [datos.planSel, datos.planes, planActivo]);
  const { puntual, vivos } = pc;
  const planId = pc.id;
  const medido = vivos.find((p) => p.id === planId) ?? null;

  const saldoPlan = useMemo(
    () => saldoPorEspecie({ ...saldo, planId }),
    [saldo, planId],
  );
  const saldoRojo = saldoPlan.filas.some((f) => f.veredicto === "excedido");

  // Sin la lista de guías no se cuadra: cruzar contra [] acusaría a todas de «citada, sin registrar».
  const cuadre = useMemo(
    () => cuadreDelControl(datos.gtfs ? cuadrarGuias(datos.filas, datos.gtfs) : null, datos.filas, puntual),
    [datos.filas, datos.gtfs, puntual],
  );
  const conteo = useMemo(() => (cuadre ? contarVeredictos(cuadre) : null), [cuadre]);
  const cuadreRojo = conteo != null && VEREDICTOS_ROJOS.some((v) => conteo[v] > 0);

  const irASeccion = useIrASeccionControl();
  const [verFicha, setVerFicha] = useLocalStorage<boolean>(CLAVE_FICHA_ABIERTA, false);
  // Fuera de las pestañas del Control no hay Extracción a la que ir: la tabla se abre acá.
  const [verSaldo, setVerSaldo] = useLocalStorage<boolean>(CLAVE_PLEGABLE_SALDO, false);
  const idFicha = useId();
  const idSaldo = useId();
  // Con «Todos» no hay UN papel que mostrar: se dice cuál se mide (sólo si hay más de uno vivo).
  const notaPlan =
    !puntual && vivos.length > 1 && medido
      ? `Con ${datos.planSel ? "«Líneas sin permiso»" : "«Todos los permisos»"}, la ficha y el saldo son del plan activo del libro. Elige otro arriba para verlo.`
      : null;

  return (
    <section
      aria-label="Resumen del permiso"
      data-control-resumen=""
      className={`rounded-2xl border bg-[var(--surface-raised)] ${
        saldoRojo || cuadreRojo ? "border-[var(--data-error-500)]/50" : "border-[var(--rule-base)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-5 px-3 sm:px-4">
        {puntual && !pc.plan ? (
          <p role={datos.cargando ? "status" : "alert"} className="py-3 text-sm text-[var(--text-secondary)]">
            {datos.cargando ? "Leyendo el plan elegido…" : "No se pudo leer el plan elegido. Vuelve a cargar la vista."}
          </p>
        ) : (
          <LothFichaPermisoLinea
            caratula={caratula}
            plan={pc.plan}
            nombrePlan={medido ? nombreDelPlan(medido) : null}
            notaPlan={notaPlan}
            planesVivos={vivos.length}
            abierta={verFicha}
            panelId={idFicha}
            onAlternar={() => setVerFicha(!verFicha)}
            onCompletarCaratula={onCompletarCaratula}
            onCompletarPlan={onCompletarPlan}
          />
        )}
        <LothControlSaldoLinea
          saldo={saldoPlan}
          dondeVacio={puntual ? "el plan elegido" : "el plan del libro"}
          verTabla={verSaldo}
          tablaId={idSaldo}
          onAlternarTabla={() => setVerSaldo(!verSaldo)}
        />
      </div>

      <div id={idFicha} hidden={!verFicha} className="space-y-3 border-t border-[var(--rule-soft)] px-3 py-3 sm:px-4">
        {verFicha && !(puntual && !pc.plan) && (
          <LothFichaPermiso
            caratula={caratula}
            plan={pc.plan}
            onCompletarCaratula={onCompletarCaratula}
            onCompletarPlan={onCompletarPlan}
          />
        )}
        {verFicha && (
          <LothPlanesVivos
            planes={vivos}
            activoId={planId}
            etiquetaActivo={puntual ? "el elegido" : undefined}
            onCompletarPlan={onCompletarPlan}
          />
        )}
      </div>
      {!irASeccion && (
        <div id={idSaldo} hidden={!verSaldo} className="border-t border-[var(--rule-soft)] px-3 py-3 sm:px-4">
          {verSaldo && <LothSaldoEspecies saldo={saldoPlan} sinCabecera />}
        </div>
      )}

      {/* Cerrado aunque traiga rojo (17-10): el resumen ya lo pinta en rojo y
          la tabla abierta empujaba las trozas 1.400 px hacia abajo. */}
      <SeccionPlegable
        plano
        abrirSiRojo={false}
        clave={CLAVE_PLEGABLE_CUADRE}
        titulo="Cuadre por guía"
        ayuda={AYUDA_CUADRE}
        rojo={cuadreRojo}
        resumen={
          !conteo ? (
            <span>{datos.cargando ? "Leyendo las guías…" : "No se pudieron leer las guías"}</span>
          ) : cuadre && cuadre.length === 0 ? (
            <span>Sin guías todavía</span>
          ) : (
            <span className="tabular-nums">
              {cuadre?.length} {cuadre?.length === 1 ? "guía" : "guías"}
              {ORDEN_VEREDICTOS.filter((v) => conteo[v] > 0).map((v) => (
                <span
                  key={v}
                  className={VEREDICTOS_ROJOS.includes(v) ? "font-bold text-[var(--data-error-ink)]" : undefined}
                >
                  {" · "}
                  {VEREDICTOS_META[v].label} {conteo[v]}
                </span>
              ))}
            </span>
          )
        }
      >
        {cuadre ? (
          <LothCuadreGuias filas={cuadre} onVerGtf={onVerGtf} />
        ) : (
          <p role={datos.cargando ? undefined : "alert"} className="text-sm text-[var(--text-secondary)]">
            {datos.cargando
              ? "Leyendo las guías emitidas…"
              : "No se pudieron leer las guías emitidas: sin ellas no se puede cuadrar. Vuelve a cargar la vista."}
          </p>
        )}
      </SeccionPlegable>
    </section>
  );
}
