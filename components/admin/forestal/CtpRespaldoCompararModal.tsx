"use client";

/**
 * Comparar un respaldo con el libro de hoy y traer de vuelta lo borrado (ADR-530).
 * Solo vuelve lo borrado o dado de baja; lo de hoy no se toca. Lo que cambió o
 * es nuevo se cuenta pero no se pisa.
 */

import { useMemo, useState } from "react";
import { Loader2, RotateCcw } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Casilla } from "@/components/ui-system/Casilla";
import { formatNumber } from "@/lib/format";
import {
  ETIQUETA_TABLA_RESPALDO,
  TABLAS_RESPALDO,
  type GrupoDiffRespaldo,
  type ResultadoRecuperar,
} from "@/lib/forestal/ctp-respaldo-tipos";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { useCompararRespaldo } from "./hooks/use-ctp-respaldos";

const nf = (n: number) => formatNumber(n);
const FECHA = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
const fecha = (iso: string) => FECHA.format(new Date(`${iso}T00:00:00Z`));

/** «2 corridas, 5 trozas» de lo que traería el grupo (filas borradas o de baja). */
function filasDe(g: GrupoDiffRespaldo): string {
  return TABLAS_RESPALDO.flatMap((t) => {
    const c = g.filas[t];
    const n = c ? c.borradas + c.deBaja + c.cambiadas + c.nuevas : 0;
    return n > 0 ? [`${nf(n)} ${ETIQUETA_TABLA_RESPALDO[t].toLowerCase()}`] : [];
  }).join(" · ");
}

function cifrasDe(g: GrupoDiffRespaldo): string {
  const p: string[] = [];
  if (g.pt != null) p.push(`${nf(g.pt)} PT`);
  if (g.m3 != null) p.push(`${nf(g.m3)} m³`);
  if (g.piezas != null) p.push(`${nf(g.piezas)} piezas`);
  return p.join(" · ");
}

function Resultado({ r }: { r: ResultadoRecuperar }) {
  const lineas = TABLAS_RESPALDO.flatMap((t) => {
    const n = r.recuperadas[t];
    return n ? [`${ETIQUETA_TABLA_RESPALDO[t]}: ${nf(n)}`] : [];
  });
  return (
    <div className="space-y-3 text-sm" role="status">
      <p className="font-semibold text-[var(--text-primary)]">
        {r.total > 0 ? `Volvieron ${nf(r.total)} cosas al libro.` : "No volvió nada."}
      </p>
      {lineas.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-[var(--text-secondary)]">
          {lineas.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {r.saltadas.length > 0 && (
        <div>
          <p className="font-medium text-[var(--text-primary)]">No se pudieron traer:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[var(--text-secondary)]">
            {r.saltadas.map((s) => (
              <li key={s.clave}>
                {s.etiqueta}: {s.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.avisos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {r.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CtpRespaldoCompararModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { comparacion, cargando, error, recuperando, errorRecuperar, aviso, resultado, recuperar } =
    useCompararRespaldo(id);
  const [soloRecuperable, setSoloRecuperable] = useState(true);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);

  const grupos = useMemo(
    () => (comparacion?.grupos ?? []).filter((g) => !soloRecuperable || g.recuperable),
    [comparacion, soloRecuperable],
  );
  const recuperables = useMemo(
    () => (comparacion?.grupos ?? []).filter((g) => g.recuperable).map((g) => g.clave),
    [comparacion],
  );
  /* Solo cuentan las marcadas que siguen existiendo tras un "volver a comparar". */
  const elegidas = recuperables.filter((c) => marcadas.has(c));
  const t = comparacion?.totales;
  const igual = !!comparacion && comparacion.grupos.length === 0;

  function alternar(clave: string) {
    setMarcadas((prev) => {
      const sig = new Set(prev);
      if (sig.has(clave)) sig.delete(clave);
      else sig.add(clave);
      return sig;
    });
  }

  const pie = resultado ? (
    <ModalFooter>
      <Btn variant="primary" onClick={onClose}>
        Listo
      </Btn>
    </ModalFooter>
  ) : (
    <ModalFooter
      error={errorRecuperar}
      nota={
        confirmando
          ? `Vuelven ${nf(elegidas.length)} ${elegidas.length === 1 ? "cosa borrada" : "cosas borradas"}. No se cambia nada de lo que hay hoy.`
          : aviso
      }
    >
      {confirmando ? (
        <>
          <Btn onClick={() => setConfirmando(false)} disabled={recuperando}>
            Atrás
          </Btn>
          <Btn
            variant="primary"
            disabled={recuperando || elegidas.length === 0}
            onClick={() => {
              void recuperar(elegidas).finally(() => setConfirmando(false));
            }}
          >
            {recuperando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
            Sí, recuperar
          </Btn>
        </>
      ) : (
        <>
          <Btn onClick={onClose}>Cerrar</Btn>
          {/* Sin nada que traer (libro igual o todo bloqueado), «Recuperar 0» sólo confunde. */}
          {recuperables.length > 0 && (
            <Btn variant="primary" disabled={elegidas.length === 0} onClick={() => setConfirmando(true)}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Recuperar {nf(elegidas.length)}
            </Btn>
          )}
        </>
      )}
    </ModalFooter>
  );

  return (
    <AdminModal
      open
      onClose={recuperando ? () => undefined : onClose}
      aboveModals
      variant="wide"
      icon={RotateCcw}
      title="Comparar con el libro de hoy"
      description={comparacion ? `Foto del ${new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(comparacion.respaldo.createdAt))}` : undefined}
      footer={pie}
    >
      <ModalBody className="space-y-4">
        {cargando && !comparacion ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comparando…
          </p>
        ) : error && !comparacion ? (
          <p role="alert" className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        ) : resultado ? (
          <Resultado r={resultado} />
        ) : igual ? (
          <p className="text-sm text-[var(--text-secondary)]">El libro está igual que en esta foto.</p>
        ) : (
          comparacion && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                <b className="tabular-nums text-[var(--text-primary)]">{nf(t?.borrada ?? 0)}</b> borradas ·{" "}
                <b className="tabular-nums text-[var(--text-primary)]">{nf(t?.de_baja ?? 0)}</b> de baja ·{" "}
                <b className="tabular-nums text-[var(--text-primary)]">{nf(t?.cambiada ?? 0)}</b> cambiadas ·{" "}
                <b className="tabular-nums text-[var(--text-primary)]">{nf(t?.nueva ?? 0)}</b> nuevas. Solo vuelven las
                borradas o de baja; lo cambiado y lo nuevo se queda como está.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Casilla
                  checked={soloRecuperable}
                  onChange={(e) => setSoloRecuperable(e.target.checked)}
                  etiqueta="Solo lo que se puede recuperar"
                />
                <Btn size="sm" disabled={recuperables.length === 0} onClick={() => setMarcadas(new Set(recuperables))}>
                  Marcar todo
                </Btn>
              </div>
              <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-soft)]">
                {grupos.map((g) => (
                  <li key={g.clave} className="flex items-start gap-3 p-3">
                    {g.recuperable ? (
                      <Casilla
                        className="mt-1"
                        checked={marcadas.has(g.clave)}
                        onChange={() => alternar(g.clave)}
                        aria-label={`Recuperar ${g.etiqueta}`}
                      />
                    ) : (
                      <span className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-[var(--text-primary)]">{g.etiqueta}</p>
                      <p className="text-[var(--text-secondary)]">
                        {[g.fecha ? fecha(g.fecha) : null, cifrasDe(g), filasDe(g)].filter(Boolean).join(" · ")}
                      </p>
                      {!g.recuperable && g.motivo && (
                        <p className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{g.motivo}</p>
                      )}
                    </div>
                  </li>
                ))}
                {grupos.length === 0 && (
                  <li className="p-3 text-sm text-[var(--text-secondary)]">Nada para recuperar en esta foto.</li>
                )}
              </ul>
            </>
          )
        )}
      </ModalBody>
    </AdminModal>
  );
}
