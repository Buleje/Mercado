"use client";

/**
 * El permiso al que se va a vincular una producción sin lote (ADR-409), y cómo
 * le queda el saldo si se registra — ahora POR ESPECIE (ADR-429: un asiento
 * por especie, todos con el mismo permiso declarado).
 *
 * Mudado tal cual desde «Producir sin lote»: el campo es libre con
 * sugerencias, porque un título habilitante puede no tener todavía ninguna
 * troza cargada y rechazarlo empujaría a anotar la jornada sin él —que es el
 * dato que después falta—. Va a `originCode` del asiento: no inventa
 * trazabilidad, la corrida sigue sin trozas atribuidas.
 *
 * La simulación no tiene aritmética propia: cada especie entra como una
 * corrida más en la MISMA cuenta que dibuja el apartado «Saldo por permiso».
 * Las especies se simulan por separado porque el saldo es por especie.
 */
import { useMemo } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { SIN_PERMISO, simularCorrida } from "@/lib/forestal/saldo-por-permiso";
import { permisoDesdeLosCodigos, type TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";
import { codigosDeLoCubicado } from "@/lib/forestal/propuesta-de-vinculacion";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { CorridaDeEspecie } from "@/lib/forestal/declarar-produccion";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { useSaldoPermisos } from "./hooks/use-saldo-permisos";
import { Field, I } from "./ctp-shared";

const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export default function CtpPermisoDelAsiento({
  permiso,
  onPermiso,
  corridas,
  fecha,
  piezas,
  trozas,
}: {
  permiso: string;
  onPermiso: (v: string) => void;
  /** Sólo las que tienen especie: las otras no se pueden declarar. */
  corridas: readonly CorridaDeEspecie[];
  fecha: string;
  piezas: readonly PiezaCubicada[];
  trozas: readonly TrozaParaCodigo[];
}) {
  /* La lectura más cara del libro: se pide al abrir «Declarar», no al cubicar. */
  const saldo = useSaldoPermisos(true);
  const claves = useMemo(
    () => corridas.map((c) => claveEspecie(c.especie)).filter(Boolean),
    [corridas],
  );

  /**
   * Se ofrecen los permisos con rolliza de ALGUNA de las especies que se
   * declaran (Brandon, 2026-09-10: ofrecer un permiso de copaiba mientras se
   * cubica tornillo es ofrecer un error). Si ninguno la tiene, se ofrecen
   * todos y se dice: recortar a cero dejaría sin elegir a quien sí sabe.
   */
  const permisos = useMemo(() => {
    const rolliza = saldo.datos?.rolliza ?? [];
    const todos = rolliza.map((r) => r.permiso).filter((p): p is string => Boolean(p));
    if (claves.length === 0) return { lista: todos, filtrados: false };
    const con = rolliza
      .filter((r) => r.permiso && r.especies.some((e) => claves.includes(e.clave)))
      .map((r) => r.permiso as string);
    return con.length > 0 ? { lista: con, filtrados: true } : { lista: todos, filtrados: false };
  }, [saldo.datos, claves]);

  /* Lo que dicen los códigos anotados al cubicar (ADR-417): se propone, no se escribe solo. */
  const sugerido = useMemo(
    () => permisoDesdeLosCodigos(codigosDeLoCubicado(piezas), trozas),
    [piezas, trozas],
  );

  const simulaciones = useMemo(() => {
    const codigo = permiso.trim();
    const datos = saldo.datos;
    if (!datos || !codigo) return [];
    return corridas.map((c) => {
      const clave = claveEspecie(c.especie);
      const { antes, despues } = simularCorrida(datos.rolliza, datos.corridas, {
        id: `borrador-${clave}`,
        lineNo: null,
        fecha,
        especie: c.especie,
        permiso: codigo,
        cantidad: r4(c.m3),
        unidad: "m3",
        referencia: null,
      });
      return {
        especie: c.especie,
        antes: antes?.especies.find((e) => e.clave === clave) ?? null,
        despues: despues?.especies.find((e) => e.clave === clave) ?? null,
      };
    });
  }, [saldo.datos, permiso, corridas, fecha]);
  const algunaEnRojo = simulaciones.some((s) => (s.despues?.sobranteM3 ?? 0) < -0.001);
  const nombres = corridas.map((c) => c.especie).join(", ");

  return (
    <>
      <div className="min-w-0 sm:col-span-6">
        <Field label="Permiso a vincular (título habilitante)">
          <input
            value={permiso}
            onChange={(e) => onPermiso(e.target.value)}
            list="ctp-permisos-declarar"
            placeholder={saldo.cargando ? "Buscando permisos…" : "Ej. CON-25-001 · o escríbelo"}
            className={`${I} font-mono`}
          />
        </Field>
        <datalist id="ctp-permisos-declarar">
          {permisos.lista.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {sugerido.estado === "uno" && permiso.trim() !== sugerido.permiso && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs leading-snug text-[var(--text-secondary)]">
            <span>
              {sugerido.codigos.length === 1
                ? `El código ${sugerido.codigos[0]} que cargaste es de`
                : `Los ${sugerido.codigos.length} códigos que cargaste son de`}{" "}
              <b className="font-mono text-[var(--text-primary)]">{sugerido.permiso}</b>
              {sugerido.guias.length === 1 ? ` (guía ${sugerido.guias[0]})` : ""}.
            </span>
            <button
              type="button"
              onClick={() => onPermiso(sugerido.permiso)}
              className="rounded-lg border border-[var(--rule-base)] px-2 py-0.5 font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
            >
              Usarlo
            </button>
          </span>
        )}
        {sugerido.estado === "varios" && (
          <span className="mt-1 block text-xs leading-snug text-[var(--text-secondary)]">
            Los códigos que cargaste vienen de {sugerido.permisos.length} permisos (
            <span className="font-mono">{sugerido.permisos.join(" · ")}</span>): elige cuál declara
            esta producción.
          </span>
        )}
        <span className="mt-1 block text-xs leading-snug text-[var(--text-tertiary)]">
          {permisos.filtrados
            ? `${permisos.lista.length === 1 ? "Se ofrece el único permiso" : `Se ofrecen los ${permisos.lista.length} permisos`} con rolliza de ${nombres} en el patio. `
            : nombres && permisos.lista.length > 0
              ? `Ningún permiso tiene rolliza de ${nombres} en el patio: se ofrecen todos. `
              : ""}
          Sin él, la producción queda bajo «{SIN_PERMISO}» en el saldo por permiso.
        </span>
      </div>

      <div className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 sm:col-span-6">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Simulación del permiso{permiso.trim() ? ` · ${permiso.trim()}` : ""}
        </p>
        {!permiso.trim() ? (
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Elige un permiso para ver cuánto le queda de cada especie después de declarar esto.
          </p>
        ) : saldo.cargando && !saldo.datos ? (
          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el patio…
          </p>
        ) : saldo.error && !saldo.datos ? (
          <p className={`mt-1 text-sm ${ROJO}`}>No se pudo leer el saldo: {saldo.error}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {simulaciones.map((s) => (
              <li key={s.especie} className="text-sm leading-snug text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">{s.especie}</b>{" "}
                {s.despues && s.despues.rollizaM3 > 0 ? (
                  <>
                    · sobrante{" "}
                    <span className="font-mono tabular-nums">
                      {fmtM3(s.antes?.sobranteM3 ?? 0)}
                    </span>{" "}
                    →{" "}
                    <b
                      className={`font-mono tabular-nums ${s.despues.sobranteM3 < -0.001 ? ROJO : "text-[var(--text-primary)]"}`}
                    >
                      {fmtM3(s.despues.sobranteM3)}
                    </b>{" "}
                    m³{" "}
                    <span className="text-xs text-[var(--text-tertiary)]">
                      ({fmtPt(s.despues.sobrantePt)} pt)
                    </span>
                  </>
                ) : (
                  <span className={ROJO}>
                    · este permiso no tiene rolliza de {s.especie} en el patio
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {algunaEnRojo && (
          <p className={`mt-1 text-xs leading-snug ${ROJO}`}>
            Con esto el permiso declara más producto del que su rolliza puede dar al 56 %. Se
            registra igual —el tope de verdad lo mide la corrida contra su materia prima— pero
            conviene revisar si es de otro permiso.
          </p>
        )}
      </div>
    </>
  );
}
