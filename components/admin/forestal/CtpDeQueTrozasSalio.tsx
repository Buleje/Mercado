"use client";

/**
 * «¿De qué trozas salió?» — dentro de «Declarar producción» (27-09).
 *
 * Brandon: «al producir eliges el lote, y sus trozas se descuentan solas. El
 * fiscalizador pregunta por una tabla y le muestras su troza y su guía».
 *
 * Una lista por especie (una corrida cada una) con las trozas que propone el
 * sistema, YA marcadas: la persona desmarca las que no entraron. Sin trozas de
 * esa especie, una línea lo dice y se declara sin origen. El lote mixto
 * (ADR-441) queda como una opción más: si se elige, la lista se esconde y la
 * vinculación del mixto se abre al registrar, como antes.
 *
 * Esta pantalla no escribe nada: el modal declara primero y después descuenta
 * (`vincularLoDeclarado`). Si lo segundo falla, la declaración ya quedó.
 */
import { useId } from "react";
import { AlertTriangle, Boxes, Check, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { formatNumber } from "@/lib/format";
import { lineaDelMixto } from "@/lib/forestal/lote-mixto-vista";
import type { TrozaPropuesta } from "@/lib/forestal/vincular-trozas";
import type { PropuestaDeEspecie, TrozasDeLaDeclaracion } from "@/hooks/use-vincular-trozas";
import { CAMPO } from "./armar-lote-escaneo-partes";
import { puedeFirmarVinculo } from "./CtpVincularMixtoModal";
import { useLotesMixtos } from "./hooks/use-lotes-mixtos";
import { Btn, ModalBody, ModalFooter, Seccion } from "./ctp-shared";

const m3 = (n: number) => formatNumber(n, 3);
const LINK =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] underline underline-offset-2 hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]";

/** Las trozas con su casilla: código, m³ y guía. La usan este bloque y «Revisar y vincular». */
export function ListaDeTrozas({
  trozas,
  estaMarcada,
  onAlternar,
  etiqueta,
}: {
  trozas: readonly TrozaPropuesta[];
  estaMarcada: (trozaId: string) => boolean;
  onAlternar: (trozaId: string) => void;
  etiqueta: string;
}) {
  return (
    <ul aria-label={etiqueta} className="max-h-72 space-y-0.5 overflow-y-auto">
      {trozas.map((t) => (
        <li key={t.trozaId}>
          {/* A 400 px la guía baja a su renglón: el código es lo que se lee en
              la chapa y no se recorta (medido: «QA-C-…» con la guía al lado). */}
          <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-sunken)]">
            <input
              type="checkbox"
              checked={estaMarcada(t.trozaId)}
              onChange={() => onAlternar(t.trozaId)}
              aria-label={`Troza ${t.codigo}, ${m3(t.m3)} m³, guía ${t.gtfNumber}`}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0 break-all font-bold text-[var(--text-primary)]">{t.codigo}</span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
              {m3(t.m3)} m³
            </span>
            <span className="min-w-0 truncate text-sm text-[var(--text-tertiary)] max-sm:basis-full max-sm:pl-8 sm:ml-auto">
              Guía {t.gtfNumber}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** «Marcadas 5 de 6 · 3,204 m³»: lo que se va a descontar, antes de firmar. */
export function TotalMarcadas({ marcadas, de }: { marcadas: readonly TrozaPropuesta[]; de: number }) {
  const total = marcadas.reduce((a, t) => a + t.m3, 0);
  return (
    <span className="text-sm text-[var(--text-secondary)]">
      Marcadas <b className="text-[var(--text-primary)]">{marcadas.length}</b> de {de} ·{" "}
      <span className="font-mono tabular-nums">{m3(total)} m³</span>
    </span>
  );
}

function BloqueEspecie({ e, trozas }: { e: PropuestaDeEspecie; trozas: TrozasDeLaDeclaracion }) {
  const marcadas = trozas.marcadas(e.clave);
  const todas = marcadas.length === e.propuesta.length;
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold text-[var(--text-primary)]">{e.especie}</span>
        <span className="text-sm text-[var(--text-tertiary)]">
          <span className="font-mono tabular-nums">{m3(e.m3)}</span> m³ producidos
        </span>
        {e.propuesta.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-x-2">
            <TotalMarcadas marcadas={marcadas} de={e.propuesta.length} />
            <button type="button" onClick={() => trozas.marcarTodas(e.clave, !todas)} className={LINK}>
              {todas ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </span>
        )}
      </div>
      {e.cargando ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando trozas de {e.especie}…
        </p>
      ) : e.error ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          No se pudo buscar trozas. Se declara sin origen.
          <InfoTip title="Por qué" what={e.error} />
          <button type="button" onClick={trozas.reintentar} className={LINK}>
            Reintentar
          </button>
        </p>
      ) : e.propuesta.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {e.detalle || `No hay trozas de ${e.especie}. Se declara sin origen.`}
        </p>
      ) : (
        <>
          {e.detalle && <p className="mt-1 text-sm text-[var(--text-tertiary)]">{e.detalle}</p>}
          <div className="mt-2">
            <ListaDeTrozas
              trozas={e.propuesta}
              estaMarcada={trozas.estaMarcada}
              onAlternar={trozas.alternar}
              etiqueta={`Trozas propuestas de ${e.especie}`}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function CtpDeQueTrozasSalio({
  trozas,
  loteMixtoId,
  onLoteMixto,
  numero = 4,
}: {
  trozas: TrozasDeLaDeclaracion;
  loteMixtoId: string | null;
  onLoteMixto: (id: string | null) => void;
  numero?: number;
}) {
  const id = useId();
  /* Descontar trozas y el lote mixto son de quien firma la vinculación: el
     dueño o un administrador (ADR-441; el servidor lo exige igual). */
  const rol = useMiRol();
  const firma = puedeFirmarVinculo(rol);
  const sinPermiso = rol != null && !firma;
  const { abiertos, repartidos } = useLotesMixtos({ activo: firma });
  /* Un repartido sin lotes vivos (se deshicieron) no tiene madera que ofrecer. */
  const mixtos = firma ? [...abiertos, ...repartidos.filter((m) => m.lotes.length > 0).slice(0, 10)] : [];
  const mixto = mixtos.find((m) => m.id === loteMixtoId) ?? null;

  return (
    <Seccion numero={numero} title="¿De qué trozas salió?">
      <div className="space-y-3 sm:col-span-12">
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          Desmarca las trozas que no entraron.
          <InfoTip
            title="De qué trozas salió"
            what="Al declarar, las trozas marcadas se descuentan del patio."
            affects="Cada tabla queda atada a su troza y a su guía."
            example="El fiscalizador pregunta por una tabla: le muestras su troza y su guía."
          />
        </p>
        {sinPermiso ? (
          <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
            Se declara sin origen. Las trozas las vincula el dueño o un administrador.
          </p>
        ) : loteMixtoId ? (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
            <Check className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
            Al registrar se abre la vinculación con {mixto?.code ?? "el lote mixto"}.
          </p>
        ) : (
          trozas.especies.map((e) => <BloqueEspecie key={e.clave} e={e} trozas={trozas} />)
        )}
        {mixtos.length > 0 && (
          <label htmlFor={id} className="block text-sm">
            <span className="mb-1 block font-bold text-[var(--text-secondary)]">¿Salió de un lote mixto?</span>
            <select
              id={id}
              value={loteMixtoId ?? ""}
              onChange={(ev) => onLoteMixto(ev.target.value || null)}
              className={CAMPO}
            >
              <option value="">No, de las trozas de arriba</option>
              {mixtos.map((m) => (
                <option key={m.id} value={m.id}>
                  {lineaDelMixto({
                    code: m.code,
                    status: m.status,
                    piezas: m.status === "abierto" ? m.resumen.piezas : m.lotes.reduce((a, l) => a + l.piezas, 0),
                    especies: m.resumen.especies,
                  })}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Seccion>
  );
}

/**
 * Se declaró, pero no se descontaron las trozas. Reemplaza al formulario: la
 * producción YA está en el libro, y un botón «Registrar» a la vista invitaría
 * a declararla dos veces. Cerrar de cualquier forma es «Entendido».
 */
export function DeclaradaSinTrozasModal({
  fallas,
  onEntendido,
}: {
  fallas: readonly string[];
  onEntendido: () => void;
}) {
  return (
    <AdminModal
      open
      aboveModals
      onClose={onEntendido}
      title="Declarar producción"
      description="Declarada · faltan las trozas"
      icon={Boxes}
      variant="info"
      footer={
        <ModalFooter>
          <Btn variant="primary" onClick={onEntendido}>
            Entendido
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        <div role="alert" className="space-y-3">
          <p className="flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/10 px-3 py-2.5 font-bold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
            <Check className="h-5 w-5 shrink-0" aria-hidden /> La producción quedó declarada.
          </p>
          <div className="rounded-xl border border-[var(--data-warning-500)]/45 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
            <p className="flex items-center gap-2 font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> No se descontaron las trozas.
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-[var(--text-primary)]">
              {fallas.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Vincúlalas después en Producción, en «sin trozas».
            </p>
          </div>
        </div>
      </ModalBody>
    </AdminModal>
  );
}
