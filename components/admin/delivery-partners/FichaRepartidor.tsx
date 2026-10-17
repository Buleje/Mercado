"use client";

/**
 * Ficha del repartidor (17-10, P24/P41/P42). Se abre desde su nombre en
 * Repartidores y desde su fila en Ranking (con el mismo período).
 *
 * - P24: entregas, incidencias, tarifas y retiros en un período; cada cifra
 *   lleva a sus filas.
 * - P41: «Ganado» (tarifas + propinas de lo entregado) y «Pagado en retiros»
 *   son cifras separadas: un retiro pagado no cambia las entregas ni lo ganado.
 * - P42: los pedidos que explican atrasos o fallos, y una tarea de revisión
 *   con responsable. Nada es automático: ni sanciona ni cambia permisos.
 */
import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ClipboardList, Loader2, User } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { BOTON, CLASE_CAMPO } from "@/components/admin/rrhh/rrhh-form";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fechaConDia } from "@/lib/admin/inicio/formato-tablero";
import type { PeriodoRanking } from "@/lib/delivery/ranking-reparto";
import { MINUTOS_ENTREGA_LENTA } from "@/lib/delivery/ficha-repartidor";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { vehicleLabel } from "./shared";
import { esIncidencia, TablaEntregasFicha, TablaRetirosFicha } from "./FichaRegistros";
import { useFichaRepartidor } from "./use-ficha-repartidor";

export const PERIODOS_FICHA: { id: PeriodoRanking; label: string; enTexto: string }[] = [
  { id: "week", label: "7 días", enTexto: "últimos 7 días" },
  { id: "month", label: "30 días", enTexto: "últimos 30 días" },
  { id: "all", label: "Todo", enTexto: "desde el inicio" },
];

type Vista = "todas" | "incidencias";

function Cifra({ rotulo, valor, detalle, tono, onClick, activa }: {
  rotulo: string;
  valor: string;
  detalle?: ReactNode;
  tono?: "ok" | "aviso";
  onClick?: () => void;
  activa?: boolean;
}) {
  const cuerpo = (
    <>
      <span className="block text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
      <span
        className={cn(
          "block text-xl font-extrabold tabular-nums text-[var(--text-primary)]",
          tono === "ok" && "text-[var(--data-success-700)]",
          tono === "aviso" && "text-[var(--data-warning-700)]",
        )}
      >
        {valor}
      </span>
      {detalle && <span className="block text-sm text-[var(--text-tertiary)]">{detalle}</span>}
    </>
  );
  const clase = cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left", activa && "border-[var(--accent)]");
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={activa} className={cn(clase, "min-h-12 hover:bg-[var(--surface-sunken)]")}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

export function FichaRepartidor({ id, nombre, periodoInicial = "month", onClose }: {
  id: string;
  nombre: string;
  periodoInicial?: PeriodoRanking;
  onClose: () => void;
}) {
  const [periodo, setPeriodo] = useState<PeriodoRanking>(periodoInicial);
  const [vista, setVista] = useState<Vista>("todas");
  const [tarea, setTarea] = useState<{ responsable: string; queRevisar: string } | null>(null);
  const { ficha, cargando, error, creandoTarea, crearTarea } = useFichaRepartidor(id, periodo);
  const p = PERIODOS_FICHA.find((x) => x.id === periodo) ?? PERIODOS_FICHA[1];
  const fechas = ficha?.desde ? `del ${fechaConDia(ficha.desde)} al ${fechaConDia(ficha.hasta)}` : "Toda su historia";
  const incidencias = ficha ? ficha.entregas.filter(esIncidencia) : [];
  const lentas = incidencias.filter((e) => e.status === "delivered").length;
  const filas = vista === "incidencias" ? incidencias : (ficha?.entregas ?? []);
  const s = ficha?.resumen;

  async function enviarTarea() {
    if (!tarea) return;
    const ok = await crearTarea(`${p.enTexto}, ${fechas}`, tarea.responsable, tarea.queRevisar);
    if (ok) setTarea(null);
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Ficha de ${ficha?.repartidor.name ?? nombre}`}
      icon={User}
      size="xl"
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cerrar
          </button>
          {tarea ? (
            <button type="button" onClick={() => void enviarTarea()} disabled={creandoTarea || !ficha} className={BOTON.primario} data-qa="ficha-crear-tarea">
              {creandoTarea && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Crear la tarea
            </button>
          ) : (
            <button type="button" onClick={() => setTarea({ responsable: "", queRevisar: "" })} disabled={!ficha} className={BOTON.secundario} data-qa="ficha-tarea">
              <ClipboardList className="h-4 w-4" aria-hidden /> Crear tarea de revisión
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")} data-qa="ficha-repartidor">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl<PeriodoRanking>
            value={periodo}
            onChange={setPeriodo}
            label="Período de la ficha"
            size="lg"
            options={PERIODOS_FICHA.map((x) => ({ value: x.id, label: x.label }))}
          />
          <span className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            {fechas}
            <InfoTip
              title="Qué cuenta la ficha"
              what="Los pedidos que se le ASIGNARON en esas fechas (como el ranking) y los retiros que pidió. «Pagado en retiros» cuenta los que se pagaron en esas fechas."
              affects="«Ganado» es lo que devengó por entregar (tarifa + propina). «Pagado» es la plata que salió en retiros. Son cifras aparte: un retiro pagado no cambia sus entregas."
              example="Juan entregó 12 pedidos (S/ 60 de tarifas + S/ 8 de propinas = S/ 68 ganados) y le pagaste S/ 50 en un retiro."
            />
          </span>
        </div>

        {ficha && (
          <p className="text-sm text-[var(--text-secondary)]">
            {ficha.repartidor.phone} · {vehicleLabel(ficha.repartidor.vehicleType)}
            {ficha.repartidor.zone ? ` · ${ficha.repartidor.zone}` : ""} · tarifa base {formatCurrency(ficha.repartidor.fee)}
            {!ficha.repartidor.isActive && <span className="font-bold text-[var(--data-warning-700)]"> · En pausa: no recibe pedidos nuevos</span>}
          </p>
        )}
        {ficha && ficha.abiertas > 0 && (
          <p className="rounded-xl bg-[var(--data-warning-100)] px-3 py-2 text-sm text-[var(--data-warning-700)]">
            Tiene {ficha.abiertas} {ficha.abiertas === 1 ? "pedido en curso" : "pedidos en curso"} ahora
            {!ficha.repartidor.isActive && ": entrégalos o reasígnalos en Asignaciones"}.
          </p>
        )}

        {cargando && !ficha ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo la ficha…
          </p>
        ) : s && ficha ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-qa="ficha-cifras">
              <Cifra
                rotulo="Entregas"
                valor={String(s.entregadas)}
                detalle={`de ${s.asignadas} asignadas${s.enCurso ? ` · ${s.enCurso} en curso` : ""}`}
                tono={s.entregadas > 0 ? "ok" : undefined}
                onClick={() => setVista("todas")}
                activa={vista === "todas"}
              />
              <Cifra
                rotulo="Incidencias"
                valor={String(incidencias.length)}
                detalle={`${s.noEntregadas} no entregadas · ${lentas} ${lentas === 1 ? "tardó" : "tardaron"} +${MINUTOS_ENTREGA_LENTA} min`}
                tono={incidencias.length > 0 ? "aviso" : undefined}
                onClick={() => setVista("incidencias")}
                activa={vista === "incidencias"}
              />
              <Cifra
                rotulo="Ganado"
                valor={formatCurrency(s.ganado)}
                detalle={`tarifas ${formatCurrency(s.ganadoTarifas)} + propinas ${formatCurrency(s.propinas)}`}
              />
              <Cifra
                rotulo="Pagado en retiros"
                valor={formatCurrency(ficha.pagado.monto)}
                detalle={`${ficha.pagado.cantidad} ${ficha.pagado.cantidad === 1 ? "retiro" : "retiros"} · ver abajo`}
                onClick={() => document.getElementById("ficha-retiros-lista")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              />
              <Cifra
                rotulo="Por pagar hoy"
                valor={formatCurrency(ficha.porPagar.monto)}
                detalle={ficha.porPagar.cantidad ? `${ficha.porPagar.cantidad} por resolver en Pagos` : "Nada pendiente"}
                tono={ficha.porPagar.cantidad ? "aviso" : undefined}
              />
            </div>

            {tarea && (
              <div className="grid gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-2" data-qa="ficha-form-tarea">
                <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
                  Responsable (opcional)
                  <input value={tarea.responsable} onChange={(e) => setTarea({ ...tarea, responsable: e.target.value })} maxLength={120} placeholder="Ej. Rosa (encargada)" className={CLASE_CAMPO} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
                  Qué revisar (opcional)
                  <input value={tarea.queRevisar} onChange={(e) => setTarea({ ...tarea, queRevisar: e.target.value })} maxLength={300} placeholder="Ej. Por qué tardó en los pedidos de la tarde" className={CLASE_CAMPO} />
                </label>
                <p className="text-sm text-[var(--text-tertiary)] sm:col-span-2">
                  La tarea lleva las cifras de este período. No cambia sus permisos ni su pago.
                </p>
              </div>
            )}

            <section className="space-y-2" aria-labelledby="ficha-entregas">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle id="ficha-entregas">{vista === "incidencias" ? "Incidencias" : "Entregas"}</CardTitle>
                <SegmentedControl<Vista>
                  value={vista}
                  onChange={setVista}
                  label="Qué entregas ver"
                  size="lg"
                  className="ml-auto"
                  options={[
                    { value: "todas", label: "Todas", badge: ficha.entregas.length },
                    { value: "incidencias", label: "Incidencias", badge: incidencias.length },
                  ]}
                />
              </div>
              <TablaEntregasFicha entregas={filas} total={vista === "todas" ? s.asignadas : filas.length} />
            </section>

            <TablaRetirosFicha retiros={ficha.retiros} />
          </>
        ) : null}
      </div>
    </AdminModal>
  );
}
