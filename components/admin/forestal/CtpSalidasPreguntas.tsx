"use client";

/**
 * Las preguntas de la revisión de «Guías sin registrar» (ADR-446, 26-10): lo
 * que el sistema NO decide solo y le pregunta al dueño antes de registrar.
 *  · dos Anexos 04 distintos en una guía, o el mismo papel en dos guías;
 *  · números del talonario que faltan entre las guías (decisión 9);
 *  · la producción que le falta a la tanda (decisión 8: anotarla, o confirmar
 *    en cada guía que sale sin origen).
 * Cada respuesta es un PATCH que no escribe en el libro, queda con el nombre de
 * quien contestó y se puede cambiar mientras la guía no esté registrada.
 */
import { CardTitle } from "@buleje/design-system";
import { Calculator, CircleHelp, Loader2 } from "@buleje/design-system/icons";
import type { RespuestaPendientes } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import type { DudaDeAnexo, HuecoDelTalonario } from "@/lib/forestal/anexo-dudas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { RevisionDeSalidas } from "@/hooks/use-revision-de-salidas";
import { button } from "@/components/ui-system/button-variants";
import { fechaDeGuia, fmtEntero } from "./guias-sin-registrar-pantalla";

export const RESPUESTA_DE_HUECO: Record<string, string> = {
  no_salio: "No salió (saltada o anulada en el papel)",
  falta_anexo: "Salió: falta cargar su Anexo 04",
};

const SECUNDARIO = button({ variant: "secondary", className: "rounded-xl" });
const CAJA = "space-y-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2.5 py-2";

function Reloj({ visible }: { visible: boolean }) {
  return visible ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null;
}

function ErrorDe({ clave, revision }: { clave: string; revision: RevisionDeSalidas }) {
  if (revision.error?.clave !== clave) return null;
  return (
    <p role="alert" className="text-sm text-[var(--data-error-ink)]">
      {revision.error.mensaje}
    </p>
  );
}

function Duda({ d, revision, bloqueado }: { d: DudaDeAnexo; revision: RevisionDeSalidas; bloqueado: boolean }) {
  const enviando = revision.enviando === d.clave;
  return (
    <li className={CAJA}>
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{d.pregunta}</span>
        <InfoTip
          title={d.tipo === "dos_papeles" ? "Dos Anexos 04 en una guía" : "El mismo Anexo 04 en dos guías"}
          what={
            d.tipo === "dos_papeles"
              ? "Una guía viaja con UN Anexo 04. Si hay dos distintos, el sistema no elige: dinos cuál viajó y el otro queda «reemplazado» (no se borra)."
              : "Dos guías tienen el mismo papel: mismas piezas, m³ y especies. Puede ser un papel guardado dos veces o dos camiones iguales."
          }
          affects={d.porQue ?? "Hasta que contestes, estas guías no se registran."}
        />
      </div>
      <ul className="space-y-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
        {d.anexos.map((a) => (
          <li key={a.anexoId}>
            <span className="font-semibold text-[var(--text-primary)]">{a.gtf}</span> · Anexo {a.numero || "s/n"} del{" "}
            {fechaDeGuia(a.fecha)} · {fmtEntero(a.piezas)} pzas · {fmtM3(a.totalM3)} m³ · {a.especies}
            {a.tambienEn.length > 0 && <span className="text-[var(--data-warning-ink)]"> · también en la {a.tambienEn.join(", ")}</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {d.opciones.map((o) => (
          <button
            key={o.clave}
            type="button"
            disabled={bloqueado || revision.enviando != null}
            onClick={() => void revision.enviar(d.clave, { accion: "resolver", duda: d.clave, opcion: o.clave })}
            className={SECUNDARIO}
          >
            {o.etiqueta}
            {o.sugerida && (
              <span className="rounded-full bg-[var(--accent)]/15 px-1.5 text-xs font-semibold text-[var(--accent-ink)]">sugerida</span>
            )}
          </button>
        ))}
        <Reloj visible={enviando} />
      </div>
      <ErrorDe clave={d.clave} revision={revision} />
    </li>
  );
}

function Hueco({ h, revision, bloqueado }: { h: HuecoDelTalonario; revision: RevisionDeSalidas; bloqueado: boolean }) {
  const enviando = revision.enviando === h.clave;
  const responder = (valor: string | null) => void revision.enviar(h.clave, { accion: "responder", clave: h.clave, valor });
  return (
    <li className={CAJA}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm tabular-nums text-[var(--text-primary)]">
          <span className="font-semibold">Guía {h.numero}</span>{" "}
          <span className="text-xs text-[var(--text-secondary)]">(entre la {h.entre[0]} y la {h.entre[1]})</span>
          {h.respuesta && <span className="font-medium text-[var(--data-success-ink)]"> · {RESPUESTA_DE_HUECO[h.respuesta] ?? h.respuesta}</span>}
        </span>
        {h.respuesta ? (
          <button type="button" disabled={bloqueado || revision.enviando != null} onClick={() => responder(null)} className={SECUNDARIO}>
            Cambiar
          </button>
        ) : (
          Object.entries(RESPUESTA_DE_HUECO).map(([valor, etiqueta]) => (
            <button key={valor} type="button" disabled={bloqueado || revision.enviando != null} onClick={() => responder(valor)} className={SECUNDARIO}>
              {etiqueta}
            </button>
          ))
        )}
        <Reloj visible={enviando} />
      </div>
      <ErrorDe clave={h.clave} revision={revision} />
    </li>
  );
}

export default function CtpSalidasPreguntas({
  datos,
  revision,
  bloqueado,
  onAnotarProduccion,
}: {
  datos: RespuestaPendientes;
  revision: RevisionDeSalidas;
  bloqueado: boolean;
  onAnotarProduccion?: (especie: string) => void;
}) {
  const { dudas, huecos } = datos;
  const falta = datos.tanda.faltaProduccion ?? [];
  const sinContestar = dudas.length + huecos.filter((h) => !h.respuesta).length;
  if (dudas.length === 0 && huecos.length === 0 && falta.length === 0) return null;

  return (
    <section
      aria-label="Antes de registrar"
      className="space-y-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/5 px-3 py-2.5"
    >
      <div className="flex items-center gap-1.5">
        <CircleHelp aria-hidden className="h-4 w-4 text-[var(--data-warning-ink)]" />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          {sinContestar > 0 ? `Antes de registrar: ${sinContestar} ${sinContestar === 1 ? "pregunta" : "preguntas"}` : "Antes de registrar"}
        </CardTitle>
        <InfoTip
          title="Lo que el sistema no decide solo"
          what="Papeles en duda, números del talonario que faltan y producción que no alcanza. Cada respuesta es tuya: nada se marca solo."
          affects="Contestar no escribe en el libro: sólo deja la guía lista (o bloqueada) para registrarla abajo. Queda con tu nombre y se puede cambiar mientras la guía no esté registrada."
        />
      </div>

      {dudas.length > 0 && (
        <ul aria-label="Papeles en duda" className="space-y-1.5">
          {dudas.map((d) => (
            <Duda key={d.clave} d={d} revision={revision} bloqueado={bloqueado} />
          ))}
        </ul>
      )}

      {falta.length > 0 && (
        <ul aria-label="Producción que falta" className="space-y-1.5">
          {falta.map((f) => (
            <li key={f.especie} className={`${CAJA} flex flex-wrap items-center gap-2`}>
              <span className="min-w-0 flex-1 text-sm tabular-nums text-[var(--text-primary)]">
                <span className="font-semibold">Falta producción de {f.especie}:</span> {fmtM3(f.faltaM3)} m³{" "}
                <span className="text-xs text-[var(--text-secondary)]">
                  ({f.guias.length} {f.guias.length === 1 ? "guía lleva" : "guías llevan"} {fmtM3(f.pedidoM3)} m³; el libro tiene {fmtM3(f.stockM3)} m³)
                </span>
              </span>
              <InfoTip
                title="Producción que falta"
                what={`Guías: ${f.guias.join(", ")}. La producción tiene que estar anotada con fecha hasta el ${fechaDeGuia(f.fechaTope)} (la guía más vieja que la lleva).`}
                affects="Si la anotas, esas guías salen con su origen. Si no la hay, cada guía te pide confirmar que se registra con esos m³ sin origen."
              />
              {onAnotarProduccion && (
                <button type="button" disabled={bloqueado} onClick={() => onAnotarProduccion(f.especie)} className={SECUNDARIO}>
                  <Calculator aria-hidden className="h-4 w-4" /> Anotar la producción
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {huecos.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            Números del talonario sin guía ni Anexo 04
            <InfoTip
              title="Huecos del talonario"
              what="Entre dos guías que salieron falta un número: no está en el libro ni tiene Anexo 04."
              affects="Si no salió (se saltó o se anuló en el papel), dilo. Si salió, carga su Anexo 04 desde el Cubicador con ese N° de guía y aparece en esta lista."
            />
          </div>
          <ul aria-label="Huecos del talonario" className="space-y-1.5">
            {huecos.map((h) => (
              <Hueco key={h.clave} h={h} revision={revision} bloqueado={bloqueado} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
