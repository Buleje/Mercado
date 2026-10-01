"use client";

/**
 * Corregir la fecha de llegada de guías YA recibidas (ADR-434 §2).
 *
 * El caso que lo pide: «Recibir en bloque» fechaba todas con HOY, y en Blas
 * dejó 7 guías de 10-HUA recibidas el 23/09 cuando la sierra las usaba desde el
 * 07/09. T3 (ADR-433) no dejaba descontar su madera en 18 corridas.
 *
 * Se abre desde la fila de una guía (viene marcada) o desde el aviso de la vista
 * (ninguna marcada). Las demás recibidas en pantalla están en la lista para
 * corregirlas en la misma tanda, con las sospechosas —recibidas después de
 * corridas de su permiso— arriba. Un motivo para toda la tanda, obligatorio:
 * cambiar una fecha del libro deja rastro de por qué.
 *
 * La revisión de cada fila es la misma que hace el servidor dentro de la
 * transacción (`revisarLlegada`, modo «corregir»).
 */

import { useMemo, useState } from "react";
import { CalendarClock, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  confirmaVencida,
  ddmm,
  diaDelLibro,
  llegadaSospechosa,
  propuestaDeLlegada,
  recibidaDespuesDelVencimiento,
  revisarLlegada,
  revisarSinContexto,
  vencimientoDeGuia,
  type ContextoDeLlegada,
  type LineaConPapel,
  type RevisionDeLlegada,
  type VigenciaDeGuia,
} from "@/lib/forestal/fecha-de-llegada";
import { useContextoDeLlegada } from "@/hooks/use-contexto-de-llegada";
import { useCorregirRecepcion, type ResultadoCorreccion } from "@/hooks/use-corregir-recepcion";
import { Btn, I, ModalBody, ModalFooter } from "./ctp-shared";
import { AvisosDeLlegada, CampoFechaDeLlegada, ConfirmarVencida } from "./CtpFechaDeLlegada";

/** Lo mínimo de una guía recibida para corregirla. `GuiaIngreso` lo cumple. */
export interface GuiaParaCorregir {
  clave: string;
  gtfNumber: string;
  providerName: string;
  gtfDate: string | Date | null;
  entryDate: string | Date;
  /** Con su papel, si lo trae: de ahí salen la expedición y el vencimiento (ADR-434 §Vencimiento). */
  lineas: readonly ({ id: string; fechaRecepcion?: string | null } & LineaConPapel)[];
}

interface Marca {
  marcada: boolean;
  fecha: string;
  /** La fecha cae después del vencimiento y se confirma: «Confirmo…» y por qué. */
  aceptaVencida: boolean;
  motivoVencida: string;
}

const SIN_MARCA: Marca = { marcada: false, fecha: "", aceptaVencida: false, motivoVencida: "" };

const recepcionesDe = (g: GuiaParaCorregir): string[] =>
  g.lineas
    .map((l) => diaDelLibro(l.fechaRecepcion))
    .filter((d): d is string => Boolean(d))
    .sort();
const recepcionDe = (g: GuiaParaCorregir): string | null => recepcionesDe(g)[0] ?? null;

/**
 * La vigencia de la guía: la del papel de la fila o, si la fila no lo trae (la
 * ficha del permiso abre este modal con filas sin papel), la del servidor.
 */
function vigenciaCon(g: GuiaParaCorregir, ctx: ContextoDeLlegada | null): VigenciaDeGuia {
  const v = vencimientoDeGuia(g.lineas);
  if (v.vencimiento || !ctx?.vencimiento) return v;
  return { expedicion: ctx.expedicion ?? null, vencimiento: ctx.vencimiento };
}

/** Alguna madera de la guía figura recibida después de su vencimiento (la última recepción manda). */
const vencidaCon = (g: GuiaParaCorregir, ctx: ContextoDeLlegada | null): boolean =>
  recibidaDespuesDelVencimiento(
    ctx?.ultimaRecepcion ?? recepcionesDe(g).at(-1),
    vigenciaCon(g, ctx).vencimiento,
  );

export default function CtpCorregirRecepcionModal({
  guias,
  inicial,
  marcadas,
  onListo,
  onClose,
}: {
  /** Las guías recibidas en pantalla: candidatas de la tanda. */
  guias: readonly GuiaParaCorregir[];
  /** La guía desde cuya fila se abrió: viene marcada. */
  inicial?: string | null;
  /**
   * Varias guías marcadas desde el arranque, cada una con la fecha de su guía
   * (la bandeja «¿De qué trozas salió?», ADR-447: «Corregir la llegada de 8
   * guías» abre con las 8). El motivo y la revisión de cada una siguen igual.
   */
  marcadas?: readonly string[];
  onListo: (r: ResultadoCorreccion) => void;
  onClose: () => void;
}) {
  const { hoy, contextoDe, cargando, error } = useContextoDeLlegada(
    useMemo(() => guias.map((g) => g.gtfNumber), [guias]),
  );
  const { enviando, hechas, corregir } = useCorregirRecepcion();
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);

  const vigenciaDe = (g: GuiaParaCorregir) => vigenciaCon(g, contextoDe(g.gtfNumber));

  /* La propuesta al corregir es la de la guía, no la recepción que ya tiene:
     esa es justamente la que se corrige. Queda dentro de la vigencia del papel. */
  const propuestaDe = (g: GuiaParaCorregir) =>
    propuestaDeLlegada(
      { guia: g.gtfDate, asiento: g.entryDate, vigencia: vigenciaDe(g) },
      hoy,
      false,
    );

  const [marcas, setMarcas] = useState<Record<string, Marca>>(() => {
    const claves = new Set([...(inicial ? [inicial] : []), ...(marcadas ?? [])]);
    return Object.fromEntries(
      guias
        .filter((g) => claves.has(g.clave))
        .map((g) => [g.clave, { ...SIN_MARCA, marcada: true, fecha: propuestaDe(g)?.dia ?? "" }]),
    );
  });
  const marcaDe = (clave: string): Marca => marcas[clave] ?? SIN_MARCA;
  const tocar = (clave: string, parche: Partial<Marca>) =>
    setMarcas((prev) => ({ ...prev, [clave]: { ...(prev[clave] ?? SIN_MARCA), ...parche } }));

  /* La que se abrió primero; después las sospechosas o recibidas vencidas; después el resto. */
  const ordenadas = useMemo(() => {
    const peso = (g: GuiaParaCorregir) => {
      if (g.clave === inicial || marcadas?.includes(g.clave)) return 0;
      const ctx = contextoDe(g.gtfNumber);
      return (ctx && llegadaSospechosa(ctx)) || vencidaCon(g, ctx) ? 1 : 2;
    };
    return [...guias].sort((a, b) => peso(a) - peso(b) || a.gtfNumber.localeCompare(b.gtfNumber));
  }, [guias, inicial, marcadas, contextoDe]);

  const revisar = (g: GuiaParaCorregir, m: Marca): RevisionDeLlegada => {
    const ctx = contextoDe(g.gtfNumber);
    if (ctx) return revisarLlegada(m.fecha, ctx, hoy, "corregir", m);
    return revisarSinContexto(m.fecha, g.gtfDate, vigenciaDe(g), hoy, m);
  };

  const elegidas = ordenadas.filter((g) => marcaDe(g.clave).marcada);
  /* La vencida sin confirmar tiene su casilla en la fila y apaga el botón; no se repite acá. */
  const problemas = elegidas.flatMap((g) => {
    const b = revisar(g, marcaDe(g.clave)).bloqueo;
    return b && b.codigo !== "GUIA_VENCIDA" ? [`${g.gtfNumber} — ${b.mensaje}`] : [];
  });
  const sinConfirmar = elegidas.filter((g) => {
    const m = marcaDe(g.clave);
    return revisar(g, m).vencida != null && !confirmaVencida(m);
  });
  const faltaMotivo = motivo.trim().length < 3;
  const listo =
    elegidas.length > 0 &&
    problemas.length === 0 &&
    sinConfirmar.length === 0 &&
    !faltaMotivo &&
    !cargando;

  async function enviar() {
    setIntentado(true);
    if (!listo) return;
    onListo(
      await corregir(
        elegidas.map((g) => {
          const m = marcaDe(g.clave);
          return {
            gtfNumber: g.gtfNumber,
            fecha: m.fecha,
            ...(revisar(g, m).vencida ? { vencida: { motivo: m.motivoVencida } } : {}),
          };
        }),
        motivo.trim(),
      ),
    );
  }

  return (
    <AdminModal
      open
      onClose={enviando ? () => {} : onClose}
      variant="info"
      icon={CalendarClock}
      title="Corregir la recepción"
      description={`La fecha real en que llegó la madera · ${guias.length} guía${guias.length === 1 ? "" : "s"} recibida${guias.length === 1 ? "" : "s"} en pantalla`}
      footer={
        <ModalFooter
          error={
            intentado && faltaMotivo
              ? "Escribe el motivo de la corrección: queda en el rastro de cada asiento."
              : intentado && problemas.length > 0
                ? `Falta resolver ${problemas.length}: ${problemas.join(" · ")}`
                : sinConfirmar.length > 0
                  ? `${sinConfirmar.map((g) => g.gtfNumber).join(", ")}: la fecha cae después del vencimiento de su guía. Confírmalo con el motivo, o pon una fecha dentro de su vigencia.`
                  : null
          }
          nota={
            <span className="font-mono tabular-nums">
              {enviando
                ? `Corrigiendo ${hechas} de ${elegidas.length}…`
                : `${elegidas.length} guía${elegidas.length === 1 ? "" : "s"} a corregir`}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={enviando}>
            Cerrar
          </Btn>
          <Btn
            variant="primary"
            onClick={() => void enviar()}
            disabled={enviando || elegidas.length === 0 || sinConfirmar.length > 0}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}
            Corregir {elegidas.length > 0 ? elegidas.length : ""}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <div className="block text-sm">
          <span className="mb-1 flex items-center gap-1 font-bold text-[var(--text-secondary)]">
            <label htmlFor="corregir-recepcion-motivo">Motivo de la corrección</label>
            <InfoTip
              icono="ayuda"
              title="Por qué se pide"
              what="Cambiar una fecha del libro deja rastro: quién, cuándo, de qué fecha a cuál y por qué. Vale para todas las guías que marques."
              example="Se recibieron en bloque con la fecha de hoy; llegaron el día de su guía."
            />
          </span>
          <input
            id="corregir-recepcion-motivo"
            type="text"
            value={motivo}
            maxLength={300}
            disabled={enviando}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej: se recibieron en bloque con la fecha de hoy"
            aria-invalid={intentado && faltaMotivo}
            className={`${I} ${intentado && faltaMotivo ? "border-[var(--data-error-500)]" : ""}`}
          />
        </div>

        {error && (
          <p className="text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {error}
          </p>
        )}

        <ul className="space-y-2">
          {ordenadas.map((g) => {
            const m = marcaDe(g.clave);
            const ctx = contextoDe(g.gtfNumber);
            const actual = recepcionDe(g);
            const propuesta = propuestaDe(g);
            const diaGuia = diaDelLibro(g.gtfDate);
            const revision = m.marcada ? revisar(g, m) : null;
            const vence = vigenciaDe(g).vencimiento;
            return (
              <li
                key={g.clave}
                className={`rounded-xl border-2 p-3 transition-colors ${
                  m.marcada ? "border-[var(--accent)] bg-primary/5" : "border-[var(--rule-base)]"
                }`}
              >
                <label
                  className="flex cursor-pointer items-start gap-3"
                  aria-label={`Corregir la guía ${g.gtfNumber}`}
                >
                  <input
                    type="checkbox"
                    checked={m.marcada}
                    disabled={enviando}
                    onChange={(e) =>
                      tocar(g.clave, {
                        marcada: e.target.checked,
                        fecha: m.fecha || propuesta?.dia || "",
                      })
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-base font-bold text-[var(--text-primary)]">
                        {g.gtfNumber}
                      </span>
                      <span className="truncate text-sm text-[var(--text-secondary)]">
                        {g.providerName}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
                      <span>guía {diaGuia ? ddmm(diaGuia) : "sin fecha"}</span>
                      <span>· recibida {actual ? ddmm(actual) : "—"}</span>
                      {ctx && llegadaSospechosa(ctx) && (
                        <span className="rounded-full bg-[var(--data-warning-500)]/15 px-2 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                          después de corridas de su permiso
                        </span>
                      )}
                      {vence && vencidaCon(g, ctx) && (
                        <span className="rounded-full bg-[var(--data-error-500)]/12 px-2 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                          recibida después del vencimiento (vencía {ddmm(vence)})
                        </span>
                      )}
                    </span>
                  </span>
                </label>

                {m.marcada && (
                  <div className="mt-2 sm:max-w-[12rem]">
                    <CampoFechaDeLlegada
                      id={`corregir-${g.clave}`}
                      valor={m.fecha}
                      onCambio={(v) => tocar(g.clave, { marcada: true, fecha: v })}
                      propuesta={propuesta}
                      min={diaGuia}
                      max={hoy}
                      disabled={enviando}
                      invalido={Boolean(revision?.bloqueo)}
                      vencimiento={vence}
                    />
                  </div>
                )}
                {revision?.vencida && (
                  <ConfirmarVencida
                    id={`corregir-vencida-${g.clave}`}
                    vencida={revision.vencida}
                    acepta={m.aceptaVencida}
                    motivo={m.motivoVencida}
                    disabled={enviando}
                    onCambio={(parche) => tocar(g.clave, parche)}
                  />
                )}
                <AvisosDeLlegada revision={revision} />
              </li>
            );
          })}
        </ul>
      </ModalBody>
    </AdminModal>
  );
}
