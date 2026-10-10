"use client";

/**
 * «Volumen» en la ficha de un permiso (ADR-432) — Brandon, 25-09: «el volumen
 * ingresado por permiso; ahí estará el resumen por tipo y especie del permiso
 * elegido, lo consumido y toda la trazabilidad».
 *
 * Orden por pregunta: arriba las seis cifras del recorrido (entró → se
 * consumió → queda → se produjo → queda por producir → salió), después lo que
 * no cuadra en una línea por aviso, y abajo el detalle por especie y por tipo.
 *
 * Nada se suma acá: todo llega de `armarVolumenDelPermiso` en el servidor. Lo
 * único que se calcula es el % consumido, que es una proporción de dos cifras
 * del servidor para leerlas juntas.
 */

import { useState } from "react";
import { Boxes, PackageOpen, Scale, TreePine, Truck, Layers } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPct, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";
import { TOLERANCIA_EXCESO_PT } from "@/lib/forestal/semaforo-permiso";
import CtpDescontarMaderaModal from "./CtpDescontarMaderaModal";
import CtpPermisoAvisos from "./CtpPermisoAvisos";
import CtpPermisoPuestaAlDia from "./CtpPermisoPuestaAlDia";
import { CtpKpisPlegables } from "./kpis-plegables";
import { TablaPorEspecie, TablaPorTipo } from "./CtpPermisoTablas";
import { Cifra, esNegativo, m3, plural } from "./permiso-volumen-ui";

const SIN = (texto: string) => (
  <span className="text-base font-bold text-[var(--text-secondary)]">{texto}</span>
);

export default function CtpPermisoVolumen({
  volumen,
  onRecargar,
}: {
  volumen: VolumenDelPermiso;
  /** Vuelve a sumar la ficha después de vincular: el saldo baja a la vista. */
  onRecargar?: () => void;
}) {
  const t = volumen.totales;
  const [descontar, setDescontar] = useState(false);
  const hayIngreso = t.guias > 0;
  const pctConsumido =
    hayIngreso && t.ingresadoM3 > 0 ? (t.consumidoM3 / t.ingresadoM3) * 100 : null;
  const saldoRollizaNeg = esNegativo(t.saldoRollizaM3);
  /* Sin ingreso no hay techo que medir: el «saldo» sería 0 − lo producido y
     saldría en rojo como exceso (3 permisos REG-PLT de Blas, 25-09). Rojo
     sólo cuando HAY madera ingresada contra la cual comparar. */
  const saldoPtNeg = hayIngreso && esNegativo(t.saldoPt, TOLERANCIA_EXCESO_PT);

  return (
    <div className="space-y-4">
      {/* Lo que falta para que el saldo cuadre, arriba de todo (orden por pregunta). */}
      <CtpPermisoPuestaAlDia volumen={volumen} onRecargar={onRecargar} />

      {/* Las seis cifras del permiso, plegables (Brandon 05-10): cerrado queda
          lo que entró, lo que salió y lo que queda, en el botón. ABIERTAS de
          entrada: en la ficha del permiso estas cifras SON el contenido. Y el
          exceso no se pliega nunca: con el panel cerrado viaja como chip rojo
          en el botón (un rojo escondido tras un clic no lo ve nadie). */}
      <CtpKpisPlegables
        claveMemoria="ctp-permiso-volumen"
        abiertoPorDefecto
        resumenExtra={
          saldoPtNeg || saldoRollizaNeg ? (
            <span className="rounded-full bg-[var(--data-error-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {saldoPtNeg ? "se produjo de más" : "se consumió de más"}
            </span>
          ) : undefined
        }
        antes={<span className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Volumen del permiso</span>}
        resumen={
          hayIngreso
            ? `${m3(t.ingresadoM3)} m³ ingresado · ${m3(t.consumidoM3)} consumido · ${m3(t.producidoM3)} producido · ${m3(t.despachadoM3)} despachado`
            : "Sin guías de ingreso bajo este permiso"
        }
        tarjetas={[
          <StatCard
              key="ing"
            density="compact"
            label="Ingresado"
            icon={TreePine}
            value={hayIngreso ? <Cifra valor={m3(t.ingresadoM3)} unidad="m³" /> : SIN("Sin guías")}
            subValue={
              hayIngreso
                ? `${plural(t.guias, "guía", "guías")} · ${plural(t.trozas, "troza", "trozas")}`
                : "Ninguna guía de ingreso bajo este permiso"
            }
          />,
          <StatCard
              key="cons"
            density="compact"
            label="Consumido registrado"
            icon={Layers}
            value={<Cifra valor={m3(t.consumidoM3)} unidad="m³" />}
            subValue={
              pctConsumido == null
                ? "Sin ingreso para comparar"
                : `${fmtPct(pctConsumido)} % de lo ingresado`
            }
          />,
          <StatCard
              key="saldoroll"
            density="compact"
            label="Saldo rolliza del libro"
            icon={Scale}
            emphasis={saldoRollizaNeg ? "error" : "neutral"}
            value={hayIngreso ? <Cifra valor={m3(t.saldoRollizaM3)} unidad="m³" /> : SIN("—")}
            subValue={
              saldoRollizaNeg
                ? "Se consumió más de lo que entró"
                : t.despachadoRollizaM3 > 0
                  ? `Ya descuenta ${m3(t.despachadoRollizaM3)} m³ salidos en troza`
                  : "Ingresado − consumido (no es el patio físico)"
            }
          />,
          <StatCard
              key="prod"
            density="compact"
            label="Producido"
            icon={Boxes}
            value={
              t.corridas > 0 ? <Cifra valor={m3(t.producidoM3)} unidad="m³" /> : SIN("Sin producción")
            }
            subValue={
              t.corridas > 0
                ? `${fmtPt(t.producidoPt)} pt · ${plural(t.corridas, "corrida", "corridas")}${
                    t.rendimientoPct == null ? "" : ` · rinde ${fmtPct(t.rendimientoPct)} %`
                  }`
                : "Ninguna corrida bajo este permiso todavía"
            }
          />,
          <StatCard
              key="saldoaser"
            density="compact"
            label="Saldo aserrable"
            icon={PackageOpen}
            emphasis={saldoPtNeg ? "error" : "neutral"}
            value={
              hayIngreso ? <Cifra valor={`≈ ${fmtPt(t.saldoPt)}`} unidad="pt aserr." /> : SIN("—")
            }
            subValue={
              saldoPtNeg ? (
                "Se produjo más que el techo del 56 %"
              ) : hayIngreso ? (
                `De ≈ ${fmtPt(t.aserrablePt)} pt aserr. que da lo ingresado`
              ) : (
                <span className="inline-flex items-center gap-1">
                  Sin techo que medir
                  <InfoTip
                    title="Saldo aserrable"
                    what="Sin madera ingresada por este permiso: no hay rolliza contra la cual medir lo producido."
                    affects="El techo es el 56 % de la rolliza que entró por las guías del permiso."
                  />
                </span>
              )
            }
          />,
          <StatCard
              key="desp"
            density="compact"
            label="Despachado"
            icon={Truck}
            value={
              t.despachos > 0 ? (
                <Cifra valor={m3(t.despachadoM3)} unidad="m³" />
              ) : (
                SIN("Sin despachos todavía")
              )
            }
            subValue={
              t.despachos > 0
                ? `${plural(t.despachos, "despacho", "despachos")}${
                    t.despachadoRollizaM3 > 0 ? ` · ${m3(t.despachadoRollizaM3)} m³ en troza` : ""
                  }`
                : "Ninguna GTF de salida con esta madera"
            }
          />,
        ]}
      />

      <CtpPermisoAvisos avisos={volumen.avisos} onVincular={() => setDescontar(true)} />
      {descontar && (
        <CtpDescontarMaderaModal
          volumen={volumen}
          ids={volumen.avisos.corridasSinMateriaPrima.ids}
          onCerrar={() => setDescontar(false)}
          onRecargar={onRecargar}
        />
      )}

      {volumen.especies.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-3 text-sm text-[var(--text-secondary)]">
          Este permiso todavía no tiene guías de ingreso ni producción.
        </p>
      ) : (
        <>
          <TablaPorEspecie filas={volumen.especies} totales={t} />
          <TablaPorTipo filas={volumen.porTipo} totales={t} />
        </>
      )}
    </div>
  );
}
