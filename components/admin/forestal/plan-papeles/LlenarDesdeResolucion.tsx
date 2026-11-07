"use client";

/**
 * «Llenar desde la resolución»: lo que dice el papel contra lo que guarda el
 * plan, una fila marcable por dato. Viene marcado sólo lo que completa un dato
 * vacío; lo que cambia uno que ya está lo marca la persona, y un volumen que
 * pasa el tope sale en rojo y no se puede marcar. Arriba, quién subió el
 * archivo y cuándo. Nada pasa al plan hasta «Pasar al plan».
 */

import { AlertTriangle, CheckCircle2, Loader2, ScanText } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { Casilla } from "@/components/ui-system/Casilla";
import { diaYFecha } from "@/lib/compras/devoluciones-proveedor";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import { TOPE_M3_POR_ESPECIE, type EspeciePropuesta, type FilaPropuesta } from "@/lib/forestal/loth-resolucion-propuesta";
import { claveEspecie, type ArchivoLeido, type FuenteLectura, type LlenarResolucion } from "../hooks/use-llenar-resolucion";

const FUENTE: Record<FuenteLectura, string> = {
  texto: "Leído del texto del archivo",
  ia: "Leído con IA",
  "ia+texto": "Leído con IA y el texto del archivo",
};

const FECHAS = new Set(["resolucionDate", "vigenciaDesde", "vigenciaHasta"]);
const valor = (f: FilaPropuesta, v: string | null) => (v == null ? "—" : FECHAS.has(f.campo) ? formatDate(`${v}T00:00:00.000Z`, { soloFecha: true }) : v);
const m3 = (v: number | null) => (v == null ? "—" : `${formatNumber(v, { max: 3 })} m³`);
const arboles = (v: number | null) => (v == null ? "" : ` · ${formatNumber(v)} árboles`);
const SOBRE_TOPE = `Pasa de ${formatNumber(TOPE_M3_POR_ESPECIE)} m³ por especie: no parece un volumen autorizado. Si es real, escríbelo a mano en Especies.`;

/** «Lo subió qaadmin el viernes 24/10 a las 10:32.» */
function subido(a: ArchivoLeido | undefined): string | null {
  if (!a?.subidoPor && !a?.subidoEl) return null;
  const quien = a.subidoPor ? ` ${a.subidoPor}` : "";
  const cuando = a.subidoEl ? ` el ${diaYFecha(a.subidoEl)} a las ${formatTime(a.subidoEl)}` : "";
  return `Lo subió${quien}${cuando}.`;
}

function FilaMarcable({
  marcada,
  onCambio,
  deshabilitada,
  titulo,
  hoy,
  leido,
  igual,
  alerta,
}: {
  marcada: boolean;
  onCambio: (si: boolean) => void;
  deshabilitada?: boolean;
  titulo: string;
  hoy: string;
  leido: string;
  igual: boolean;
  /** En rojo, debajo: por qué no se puede pasar. */
  alerta?: string;
}) {
  const borde = alerta
    ? "border-[var(--data-error-500)]/60 bg-[var(--data-error-500)]/5"
    : marcada
      ? "border-[var(--accent)] bg-[var(--accent)]/5"
      : "border-[var(--rule-base)]";
  return (
    <li>
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${borde} ${
          deshabilitada ? `cursor-not-allowed ${alerta ? "" : "opacity-60"}` : ""
        }`}
      >
        <Casilla className="mt-0.5" checked={marcada} disabled={deshabilitada} onChange={(e) => onCambio(e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{titulo}</span>
          <span className="mt-0.5 grid gap-x-3 text-sm sm:grid-cols-2">
            <span className="min-w-0 text-[var(--text-secondary)]">
              <span className="text-xs text-[var(--text-tertiary)]">Hoy: </span>
              {hoy}
            </span>
            <span className="min-w-0 font-medium text-[var(--text-primary)]">
              <span className="text-xs font-normal text-[var(--text-tertiary)]">El papel dice: </span>
              {leido}
              {igual && <span className="text-xs font-normal text-[var(--text-tertiary)]"> (igual)</span>}
            </span>
          </span>
          {alerta && <span className="mt-1 block text-sm font-medium text-[var(--data-error-ink)]">{alerta}</span>}
        </span>
      </label>
    </li>
  );
}

export default function LlenarDesdeResolucion({
  llenar,
  nombreArchivo,
  onGuardar,
}: {
  llenar: LlenarResolucion;
  nombreArchivo: string;
  onGuardar: () => void;
}) {
  const { estado, marcadas, alternar, cerrar, guardando, errorGuardar } = llenar;
  if (!estado) return null;
  const listo = estado.fase === "listo" ? estado.r : null;
  const n = marcadas.size;
  const especieTitulo = (e: EspeciePropuesta) => (e.idEnPlan ? e.especie : `${e.especie} (no está en el plan: se agrega)`);

  return (
    <AdminModal
      open
      onClose={guardando ? () => undefined : cerrar}
      size="lg"
      icon={ScanText}
      title="Llenar desde la resolución"
      description={`Lo que dice «${nombreArchivo}» contra lo que guarda el plan.`}
      ayuda={
        <InfoTip
          title="Llenar desde la resolución"
          what="Lee el N°, la fecha, la vigencia, el titular, la autoridad y el volumen por especie del papel que subiste. Marca lo que quieras pasar al plan."
          affects="Sólo cambia lo que marques. Si pasas la vigencia, también queda como vencimiento del archivo y entra al aviso «Por vencer»."
          example="El certificado dice 32 árboles de Tornillo y el plan no tenía el número: marcas esa fila y se guarda."
        />
      }
      footer={
        <ModalFooter error={errorGuardar} nota={listo ? `${n} ${n === 1 ? "dato marcado" : "datos marcados"}` : undefined}>
          <button type="button" className={button({ variant: "secondary" })} onClick={cerrar} disabled={guardando}>
            {listo ? "Cancelar" : "Cerrar"}
          </button>
          {listo && (
            <button type="button" className={button()} onClick={onGuardar} disabled={guardando || n === 0}>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Pasar al plan
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {estado.fase === "leyendo" && (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo el papel…
          </p>
        )}
        {estado.fase === "error" && (
          <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
            {estado.mensaje}
          </p>
        )}
        {(estado.fase === "error" ? estado.avisos : (listo?.avisos ?? [])).map((a) => (
          <p
            key={a}
            role="status"
            className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden="true" />
            <span className="min-w-0">{a}</span>
          </p>
        ))}
        {listo && (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              {subido(listo.archivo) && <span className="font-medium text-[var(--text-primary)]">{subido(listo.archivo)} </span>}
              {FUENTE[listo.fuente]}. Revisa cada dato contra el papel antes de pasarlo.
            </p>
            {!listo.propuesta.sinCambios && (
              <p className="text-sm text-[var(--text-secondary)]">Marqué sólo lo que faltaba. Lo que cambia un dato que ya tienes lo marcas tú.</p>
            )}
            {listo.propuesta.sinCambios && (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-[var(--data-success-500)]/45 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden="true" />
                Todo lo que dice el papel ya está en el plan.
              </p>
            )}
            {listo.propuesta.filas.length > 0 && (
              <ul className="space-y-2" aria-label="Datos del plan">
                {listo.propuesta.filas.map((f) => (
                  <FilaMarcable
                    key={f.campo}
                    marcada={marcadas.has(f.campo)}
                    onCambio={(si) => alternar(f.campo, si)}
                    titulo={f.etiqueta}
                    hoy={valor(f, f.hoy)}
                    leido={valor(f, f.leido)}
                    igual={f.igual}
                  />
                ))}
              </ul>
            )}
            {listo.propuesta.especies.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Volumen autorizado por especie</p>
                <ul className="space-y-2" aria-label="Especies del papel">
                  {listo.propuesta.especies.map((e) => (
                    <FilaMarcable
                      key={e.especie}
                      marcada={marcadas.has(claveEspecie(e.especie))}
                      onCambio={(si) => alternar(claveEspecie(e.especie), si)}
                      deshabilitada={e.sinVolumen || e.sobreTope}
                      alerta={e.sobreTope ? SOBRE_TOPE : undefined}
                      titulo={e.sinVolumen ? `${especieTitulo(e)}: el papel no dice su volumen` : especieTitulo(e)}
                      hoy={e.idEnPlan ? `${m3(e.hoyM3)}${arboles(e.arbolesHoy)}` : "—"}
                      leido={`${m3(e.leidoM3)}${arboles(e.arbolesLeido)}`}
                      igual={e.igual}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </AdminModal>
  );
}
