"use client";

/**
 * «Atar lo suelto» en la vista Plan (24-10, Brandon: «cada guía y troza atada a
 * su plan»). Lo despachado sin plan cuenta en el saldo de CADA plan hasta que
 * se ate (ADR-459): le resta a todos y T6 lo frena contra cada uno.
 *
 *   · Un renglón: «60 trozas y 1 guía sin plan · 18.131 m³ · Atar».
 *   · La ventana: cada guía sin plan con el plan sugerido (por su título o, si
 *     no cruza, por el titular) → «Atar» (`LothGtfAsignarPermiso`, mide T7/T6 y
 *     el servidor vuelve a medir) o, si el título no está en el libro, «Crear el
 *     plan desde la guía» (`LothPlanDesdeGuia`). Las líneas que no son de una
 *     guía, por sus talas (`AtarModal`, «Atar líneas sin permiso»).
 *
 * Sólo admin/dueño ata (el servidor lo exige igual); el resto ve el renglón.
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Link2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { GuiaSuelta, SueltosDelLibro } from "@/lib/forestal/loth-saldo-plan-tipos";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import { useSueltosDelLibro } from "./hooks/use-loth-saldo-plan";
import LothGtfAsignarPermiso from "./LothGtfAsignarPermiso";
import LothPlanDesdeGuia from "./LothPlanDesdeGuia";
import { AtarModal } from "./LothAtarSinPlan";
import { Btn } from "./ctp-shared";
import FilaGuia from "./LothPlanSinPlanFila";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «60 trozas y 1 guía sin plan · 18.131 m³». */
export function resumenSinPlan(s: Pick<SueltosDelLibro, "guias" | "trozas">): string {
  const partes = [
    s.trozas.total > 0 ? plural(s.trozas.total, "troza", "trozas") : "",
    s.guias.length > 0 ? plural(s.guias.length, "guía", "guías") : "",
  ].filter(Boolean);
  const m3 = s.trozas.total > 0 ? s.trozas.m3 : s.guias.reduce((a, g) => a + g.m3, 0);
  return `${partes.join(" y ")} sin plan · ${fmtM3(m3)} m³`;
}

export default function LothPlanSinPlan({
  version,
  onCambio,
  onVerGuia,
}: {
  version: number;
  /** Se ató algo o se creó un plan: la vista relee planes, detalle y saldo. */
  onCambio: () => void;
  onVerGuia?: (gtfNumber: string) => void;
}) {
  const rol = useMiRol();
  /* Los mismos roles que exigen `/loth/guia-permiso` y `/loth/saldo-plan`. */
  const puedeAtar = rol === "admin" || rol === "owner" || rol === "superadmin";
  const delLibro = useLothPermiso();
  /* Lo atado dentro de la ventana se relee acá (`propio`); la vista entera (planes,
     detalle, saldo) recién al cerrarla: releer los planes desmonta este panel y la
     ventana se cerraba sin dejar leer el «Listo» (QA 25-10). */
  const [propio, setPropio] = useState(0);
  const [pendiente, setPendiente] = useState(false);
  const { dato } = useSueltosDelLibro(version * 1000 + propio);
  const [abierto, setAbierto] = useState(false);
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [atando, setAtando] = useState<{ guia: GuiaSuelta; planId: string } | null>(null);
  const [creando, setCreando] = useState<GuiaSuelta | null>(null);
  const [porTalas, setPorTalas] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);

  if (!dato) return null;
  /* Atar la última no cierra la ventana de golpe: queda el «Listo» hasta cerrarla. */
  const vacio = dato.guias.length === 0 && dato.trozas.total === 0;
  if (vacio && !abierto) return null;
  const planDe = (g: GuiaSuelta) => elegidos[g.gtfId] ?? g.sugerido?.planId ?? "";
  const nombreDe = (id: string) => dato.planes.find((p) => p.id === id)?.nombre ?? "el plan";
  const listo = (texto: string) => {
    setHecho(texto);
    setPropio((n) => n + 1);
    setPendiente(true);
  };
  const cerrar = () => {
    setAbierto(false);
    setHecho(null);
    if (pendiente) {
      setPendiente(false);
      onCambio();
    }
  };

  return (
    <>
      {!vacio && (
        <div
          data-testid="sin-plan-renglon"
          data-aviso-nivel="ambar"
          data-aviso-resumen={resumenSinPlan(dato)}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
        >
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{resumenSinPlan(dato)}</span>
            <InfoTip
              title="Lo que no tiene plan"
              what="Lo despachado sin plan cuenta en el saldo de cada plan hasta que lo ates: le resta a todos, y el freno de cada despacho lo mide contra cada uno."
              affects="Atarlo a su plan devuelve ese saldo a los demás. Si su permiso no está en el libro, se crea desde la guía."
              example="60 trozas despachadas con la GTF 19-000004 sin plan restan 18.131 m³ al saldo del 096 aunque no salieron de él."
            />
          </span>
          {puedeAtar && dato.guias.length + dato.lineas.total > 0 && (
            <Btn size="sm" variant="secondary" onClick={() => setAbierto(true)}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Atar
            </Btn>
          )}
        </div>
      )}

      {abierto && !porTalas && (
        <AdminModal
          size="xl"
          open
          onClose={cerrar}
          title="Atar lo que no tiene plan"
          description="Elige el plan de cada guía. Sus trozas y despachos van con ella."
          icon={Link2}
        >
          <div className={`space-y-3 ${MODAL_BODY}`}>
            {hecho && (
              <p className="text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                {hecho}
              </p>
            )}
            {dato.guias.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No quedan guías sin plan.</p>
            ) : (
              /* En el celular, cada guía es una tarjeta (`.admin-mobile-cards`): la tabla de 4 columnas cortaba «Acción». */
              <div className="admin-mobile-cards">
                <DataTable>
                  <caption className="sr-only">Guías sin plan y a qué plan van</caption>
                  <thead>
                    <tr>
                      <th scope="col">Guía</th>
                      <th scope="col" className="text-right">
                        Trozas · m³
                      </th>
                      <th scope="col">Plan</th>
                      <th scope="col" className="text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dato.guias.map((g) => (
                      <FilaGuia
                        key={g.gtfId}
                        g={g}
                        planes={dato.planes}
                        planId={planDe(g)}
                        onPlan={(id) => setElegidos((e) => ({ ...e, [g.gtfId]: id }))}
                        onAtar={() => setAtando({ guia: g, planId: planDe(g) })}
                        onCrear={() => setCreando(g)}
                        onVerGuia={onVerGuia}
                      />
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}
            {dato.lineas.total > 0 && delLibro && delLibro.planes.length > 0 && (
              <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
                <span>
                  {plural(dato.lineas.total, "línea sin plan", "líneas sin plan")} en el libro
                  (talas y lo que sigue de ellas).
                </span>
                <Btn size="sm" variant="ghost" onClick={() => setPorTalas(true)}>
                  Atarlas por sus talas
                </Btn>
              </p>
            )}
          </div>
        </AdminModal>
      )}

      {atando && (
        <LothGtfAsignarPermiso
          aboveModals
          gtf={{
            id: atando.guia.gtfId,
            gtfNumber: atando.guia.gtfNumber,
            piezasTotal: atando.guia.piezas,
          }}
          planInicial={atando.planId}
          onClose={() => setAtando(null)}
          onHecho={() => {
            setAtando(null);
            listo(
              `Listo: la GTF ${atando.guia.gtfNumber} quedó atada a ${nombreDe(atando.planId)}.`,
            );
          }}
        />
      )}

      {creando && (
        <LothPlanDesdeGuia
          guia={creando}
          onClose={() => setCreando(null)}
          onCreado={(p) => {
            setCreando(null);
            listo(
              `Listo: se creó el plan ${p.nombre} y la GTF ${creando.gtfNumber} quedó atada a él.`,
            );
          }}
          onAtarAExistente={(planId) => {
            setCreando(null);
            setAtando({ guia: creando, planId });
          }}
        />
      )}

      {porTalas && delLibro && (
        <AtarModal
          planes={delLibro.planes}
          planInicial={delLibro.plan?.id ?? null}
          onClose={() => setPorTalas(false)}
          onAtado={() => {
            setPorTalas(false);
            listo("Listo: las líneas sin plan quedaron atadas por sus talas.");
          }}
        />
      )}
    </>
  );
}
