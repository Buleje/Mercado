"use client";

/**
 * CtpProduccionImportModal — cargar el parte de turno de una vez (ADR-323).
 *
 * Pega la planilla, la muestra interpretada y da de alta una corrida por fila.
 *
 * ## Por qué NO hay endpoint bulk
 *
 * Cada fila se manda por el **mismo** `POST /api/admin/forestal/ctp` que usa el
 * alta normal. Es más lento que un bulk, pero cada corrida pasa por los guards
 * que ya existen —período cerrado, correlativo `lineNo`, validación Zod— en vez
 * de por un camino paralelo que habría que mantener sincronizado. En un parte de
 * turno (decenas de filas, no miles) la diferencia no se nota; un guard que se
 * olvidó de replicar, sí.
 *
 * Si una fila falla, **las anteriores quedan**: se informa cuál falló y por qué,
 * y el operador corrige esa. Revertir lo ya cargado sería borrar producción real
 * que sí ocurrió.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { filasDesdeTexto, interpretarProduccion } from "@/lib/forestal/produccion-import";
import { Btn, Field, I, ModalBody, ModalFooter } from "./ctp-shared";

const hoy = () => new Date().toISOString().slice(0, 10);

export default function CtpProduccionImportModal({
  onListo,
  onClose,
}: {
  /** Se llama al terminar con al menos una corrida creada, para recargar. */
  onListo: (creadas: number) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [fechaTurno, setFechaTurno] = useState(hoy());
  const [especieTurno, setEspecieTurno] = useState("");
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [fallo, setFallo] = useState<{ fila: number; motivo: string } | null>(null);
  const [creadas, setCreadas] = useState(0);

  const resultado = useMemo(
    () =>
      interpretarProduccion(filasDesdeTexto(texto), {
        fechaPorDefecto: fechaTurno || null,
        especiePorDefecto: especieTurno.trim() || null,
      }),
    [texto, fechaTurno, especieTurno],
  );

  async function cargar() {
    setFallo(null);
    setCreadas(0);
    const total = resultado.corridas.length;
    setProgreso({ hechas: 0, total });
    let hechas = 0;
    for (const c of resultado.corridas) {
      const payload = {
        section: "produccion",
        entryDate: new Date(`${c.fecha}T12:00:00.000Z`).toISOString(),
        speciesCommon: c.especie,
        productType: c.productType ?? "MADERA ASERRADA",
        quantity: c.cantidad,
        unit: c.unit,
        lineaProduccion: c.lineaProduccion,
        presentacion: c.presentacion,
        observations: c.observaciones,
      };
      try {
        const r = await fetch("/api/admin/forestal/ctp", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
          throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
        }
        hechas += 1;
        setProgreso({ hechas, total });
      } catch (e) {
        // Lo ya cargado se queda: es producción que ocurrió de verdad.
        setFallo({ fila: c.fila, motivo: e instanceof Error ? e.message : String(e) });
        break;
      }
    }
    setCreadas(hechas);
    setProgreso(null);
    if (hechas > 0) onListo(hechas);
  }

  const cargando = progreso !== null;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Cargar el parte de turno"
      description="Cada fila entra como una corrida, sin origen atribuido"
      icon={ClipboardList}
      variant="info"
      footer={
        <ModalFooter
          error={fallo ? `Se cortó en la fila ${fallo.fila}: ${fallo.motivo}` : null}
          aviso={!fallo && creadas > 0 && !cargando ? `${creadas} corrida(s) cargadas. Falta atribuirles el origen.` : null}
          nota={
            cargando
              ? `Cargando ${progreso?.hechas ?? 0} de ${progreso?.total ?? 0}…`
              : texto.trim()
                ? `${resultado.corridas.length} corrida(s)${resultado.errores.length > 0 ? ` · ${resultado.errores.length} fila(s) rechazada(s)` : ""}`
                : undefined
          }
        >
          <Btn variant="ghost" onClick={onClose} disabled={cargando}>
            {creadas > 0 ? "Cerrar" : "Cancelar"}
          </Btn>
          <Btn variant="primary" disabled={resultado.corridas.length === 0 || cargando} onClick={() => void cargar()}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Cargar {resultado.corridas.length || ""} corrida{resultado.corridas.length === 1 ? "" : "s"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Pegá la planilla del turno. Cada fila entra como una corrida de producción —{" "}
          <strong>sin origen atribuido</strong>: hay que decir de qué ingresos salió antes de certificar.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha del turno" hint="Se usa en las filas que no traen fecha">
            <input type="date" className={I} value={fechaTurno} onChange={(e) => setFechaTurno(e.target.value)} />
          </Field>
          <Field label="Especie del turno" hint="Para las filas sin columna de especie">
            <input type="text" className={I} value={especieTurno} onChange={(e) => setEspecieTurno(e.target.value)} />
          </Field>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={7}
          spellCheck={false}
          disabled={cargando}
          placeholder={"Fecha\tProducto\tEspecie\tCantidad\tUnidad\tLinea\tCodigo\n20/07/2026\tMadera aserrada\tTornillo\t6.5\tm3\tprincipal\tPAQ-01"}
          className="w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 font-mono text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-60"
        />

        {/* El conteo va en el pie, donde se ve sin scrollear; acá queda el
            total producido, que es el número que se contrasta con el papel. */}
        {texto.trim() && (
          <div className="space-y-2">
            <p className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
              Total del parte: {Number(resultado.cantidadTotal).toFixed(4)}
            </p>

            {resultado.avisos.map((a) => (
              <p key={a} className="flex items-start gap-2 text-sm text-[var(--text-tertiary)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {a}
              </p>
            ))}

            {resultado.errores.length > 0 && (
              <ul className="max-h-24 space-y-0.5 overflow-y-auto text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                {resultado.errores.slice(0, 15).map((e) => (
                  <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>
                ))}
              </ul>
            )}

            {resultado.corridas.length > 0 && (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--rule-base)] p-2">
                {resultado.corridas.slice(0, 50).map((c) => (
                  <li key={c.fila} className="flex items-center gap-2 text-sm">
                    <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{c.fecha}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                      {[c.productType, c.especie, c.presentacion].filter(Boolean).join(" · ")}
                    </span>
                    <span className="shrink-0 rounded bg-[var(--surface-sunken)] px-1.5 text-xs font-bold text-[var(--text-tertiary)]">
                      {c.lineaProduccion}
                    </span>
                    <span className="w-24 shrink-0 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {c.cantidad} {c.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* El corte parcial deja madera A MEDIO cargar: el detalle de qué hacer
            con lo que YA entró no cabe en el pie, así que se queda acá. */}
        {fallo && creadas > 0 && (
          <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-2.5 text-sm font-medium text-[var(--text-secondary)]">
            Las {creadas} corrida(s) anteriores YA quedaron en el libro — corregí esa fila y volvé a pegar sólo lo que falta.
          </p>
        )}
      </ModalBody>
    </AdminModal>
  );
}
