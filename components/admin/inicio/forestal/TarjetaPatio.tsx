"use client";

import { Clock, Truck } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { porcentaje } from "@/lib/admin/inicio/formato-tablero";
import { valorConDato } from "@/lib/admin/inicio/hay-datos";
import { formatNumber } from "@/lib/format";
import type { PatioInicio } from "@/lib/forestal/inicio-forestal";
import { DatosEnLinea, TarjetaTablero } from "../resumen/TarjetaTablero";
import { BarraCrece, CTP, m3, plural, PuntoLeyenda, RAMPA_PATIO, TINTA } from "./comun";

const AYUDA =
  "Volumen disponible del Libro CTP, hoy: trozas libres y las que ya están en un lote, sin las de guías que todavía no se recepcionan (van aparte). Es una foto de hoy: no depende del período. El reparto por especie es el de la misma pantalla.";

/**
 * El patio hoy (2026-10-31): cuánto hay, cómo se reparte (libre / en lote y por
 * especie) y lo que pide atención (troza añeja, guías por recepcionar). Todo
 * sale de `resumenDisponibles` + `porEspecieDisponible`, lo mismo que dibuja
 * «Volumen disponible» del Libro CTP.
 */
export function TarjetaPatio({ patio, className }: { patio: PatioInicio | null; className?: string }) {
  const pie = (
    <EnlacePanel href={`${CTP}&vista=disponibles`} className="inline-flex min-h-11 items-center">
      Ver el volumen disponible
    </EnlacePanel>
  );
  if (!patio) {
    return (
      <TarjetaTablero id="forestal-patio" titulo="El patio hoy" ayuda={AYUDA} cifra="Sin leer" cifraTono="aviso" pie={pie} className={className}>
        <p className="text-sm text-[var(--text-secondary)]">No se pudo leer el patio. Vuelve a intentarlo en un rato.</p>
      </TarjetaTablero>
    );
  }
  const conTrozas = valorConDato(patio.trozas) || valorConDato(patio.m3);
  const libres = patio.libres;
  const enLote = patio.enLote;
  const especies = (patio.porEspecie ?? []).filter((e) => e.m3 > 0);
  const masEspecies = Math.max(0, (patio.especies ?? 0) - especies.length);
  const anejas = patio.anejas;
  const sinRecibir = patio.sinRecepcionar;

  return (
    <TarjetaTablero
      id="forestal-patio"
      titulo="El patio hoy"
      ayuda={AYUDA}
      cifra={conTrozas ? m3(patio.m3) : "Vacío"}
      className={className}
      datos={
        conTrozas ? (
          <DatosEnLinea
            datos={[
              { label: "Trozas", valor: formatNumber(patio.trozas), extra: `≈ ${formatNumber(patio.pt)} pt` },
              { label: "Por troza", valor: patio.promedioM3 ? m3(patio.promedioM3) : null },
              {
                label: "La más vieja",
                valor: patio.masViejaDias != null ? plural(patio.masViejaDias, "día", "días") : null,
              },
            ]}
          />
        ) : undefined
      }
      pie={
        <>
          {pie}
          {patio.truncado && <span className="ml-2">· lectura parcial</span>}
        </>
      }
    >
      {!conTrozas && <p className="text-sm text-[var(--text-secondary)]">No queda troza por aserrar.</p>}

      {conTrozas && libres && enLote && patio.m3 > 0 && (
        <div className="space-y-1.5">
          {/* Libre / en lote: dos tajadas de una misma barra, en la escala del patio. */}
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-[var(--radius-xs)]" aria-hidden>
            {libres.m3 > 0 && <span style={{ flexGrow: libres.m3, background: TINTA.entra }} />}
            {enLote.m3 > 0 && <span style={{ flexGrow: enLote.m3, background: TINTA.sierra }} />}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <PuntoLeyenda color={TINTA.entra} texto="Libres" detalle={`${m3(libres.m3)} · ${plural(libres.trozas, "troza", "trozas")}`} />
            <PuntoLeyenda color={TINTA.sierra} texto="En lote" detalle={`${m3(enLote.m3)} · ${plural(enLote.trozas, "troza", "trozas")}`} />
          </ul>
        </div>
      )}

      {conTrozas && especies.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--text-tertiary)]">Por especie</p>
          <ul className="space-y-2">
            {especies.map((e, i) => (
              <li key={e.especie} className="space-y-1 text-sm">
                {/* La barra va debajo, a todo el ancho: al lado de las cifras quedaba de 60 px. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="max-w-full truncate font-semibold text-[var(--text-primary)]" title={e.especie}>
                    {e.especie}
                  </span>
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    <strong className="text-[var(--text-primary)]">{m3(e.m3)}</strong> · {porcentaje(e.pctM3)}
                  </span>
                </div>
                <BarraCrece pct={e.pctM3} color={RAMPA_PATIO[i] ?? RAMPA_PATIO[5]} alto="h-2" retraso={i * 0.05} />
              </li>
            ))}
          </ul>
          {masEspecies > 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">y {plural(masEspecies, "especie más", "especies más")}</p>
          )}
        </div>
      )}

      {(anejas?.trozas ?? 0) > 0 || (sinRecibir?.trozas ?? 0) > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-[var(--rule-soft)] pt-3 text-sm dark:border-[var(--rule-base)]">
          {anejas && anejas.trozas > 0 && (
            <li className="flex items-start gap-2 font-semibold text-[var(--data-warning-ink)]">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {plural(anejas.trozas, "troza lleva", "trozas llevan")} {patio.diasAneja ?? 15} días o más ({m3(anejas.m3)})
            </li>
          )}
          {sinRecibir && sinRecibir.trozas > 0 && (
            <li className="flex items-start gap-2 text-[var(--text-secondary)]">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span>
                Aparte: {plural(sinRecibir.trozas, "troza", "trozas")} ({m3(sinRecibir.m3)}) de{" "}
                {plural(sinRecibir.guias, "guía", "guías")} por recepcionar
              </span>
            </li>
          )}
        </ul>
      ) : null}
    </TarjetaTablero>
  );
}
