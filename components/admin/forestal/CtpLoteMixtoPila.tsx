"use client";

/**
 * La pila del lote mixto (ADR-441): el escáner y una tarjeta por especie +
 * permiso con el PT primero, después m³ y trozas.
 *
 * Cada lectura aparta la troza en el servidor (`useReservaDelMixto`): la
 * tarjeta la muestra al instante con «apartando» y queda firme al releer. Sin
 * señal se anota en el equipo y la chapa dice «por subir». Lo que el libro
 * rechaza se dice pieza por pieza, con su motivo.
 */

import { AlertTriangle, Clock, Loader2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { ResumenLoteMixto } from "@/lib/forestal/lote-mixto";
import { rotuloDelPt } from "@/lib/forestal/lote-mixto-vista";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { claveDeGrupo, motivoFueraDeLaPila, textoDelReparto } from "@/lib/forestal/lote-por-escaneo";
import EscanerTrozas, { nombreDeTroza } from "./EscanerTrozas";
import { codigoDeTroza, plural } from "./armar-lote-escaneo-partes";
import type { TarjetaDelMixto } from "./hooks/use-pila-del-mixto";
import type { ReservaDelMixto } from "./hooks/use-reserva-del-mixto";

const AVISO_OJO =
  "flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 py-1 pl-3 pr-1 text-base text-[var(--text-primary)]";

export default function CtpLoteMixtoPila({
  mixto,
  patio,
  tarjetas,
  resumen,
  reserva,
  lotesNuevos,
  reciente,
}: {
  mixto: { id: string; code: string };
  /** El patio entero (sin «Solo este permiso»): entre esas se busca lo escaneado. */
  patio: { trozas: readonly TrozaConsumible[]; cargando: boolean; error: string | null };
  tarjetas: TarjetaDelMixto[];
  resumen: ResumenLoteMixto;
  reserva: ReservaDelMixto;
  /** Cuántos lotes saldrían hoy al repartir. */
  lotesNuevos: number;
  /** La clave del grupo de la última troza escaneada: su tarjeta se resalta. */
  reciente: string | null;
}) {
  const enLaPila = new Set(tarjetas.flatMap((g) => g.grupo.trozaIds));
  const codigoDe = (id: string, codigo: string | null) => {
    if (codigo) return codigo;
    const t = patio.trozas.find((x) => x.id === id);
    return t ? codigoDeTroza(t) : id.slice(-6);
  };
  const rechazos = [
    ...reserva.rechazadas,
    ...reserva.rechazadasEnCola.filter((r) => !enLaPila.has(r.id)).map((r) => ({ ...r, codigo: null })),
  ];
  const grupos = tarjetas.map((g) => g.grupo);

  return (
    <div className="space-y-3">
      <EscanerTrozas
        trozas={patio.trozas}
        yaElegidas={enLaPila}
        bloqueo={(t) => motivoFueraDeLaPila(t, { loteMixtoId: mixto.id })}
        accion={`apartada en ${mixto.code}`}
        mostrarCuenta={false}
        onTroza={(t) => reserva.apartar(t.id)}
        onDesconocido={() =>
          patio.trozas.length === 0 && patio.error
            ? "No se pudo leer el patio (¿sin señal?): vuelve a escanear cuando cargue."
            : patio.cargando && patio.trozas.length === 0
              ? "Todavía se está leyendo el patio: vuelve a escanear en un momento."
              : undefined
        }
        /* La pieza que abre un grupo nuevo se dice: va a OTRO lote al repartir. */
        avisoAlTomar={(t) => {
          if (grupos.length === 0 || grupos.some((g) => g.clave === claveDeGrupo(t))) return null;
          const otroPermiso = grupos.some((g) => claveEspecie(g.especie) === claveEspecie(t.especieComun));
          return {
            tono: "ok",
            mensaje: `Troza ${nombreDeTroza(t)} apartada en ${mixto.code}: ${otroPermiso ? "es de otro permiso, " : ""}va en otro lote (${grupos.length + 1} lotes).`,
          };
        }}
      />

      {patio.cargando && patio.trozas.length === 0 && (
        <p className="flex items-center gap-2 text-base text-[var(--text-tertiary)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Leyendo el patio…
        </p>
      )}
      {reserva.error && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          No se guardó: {reserva.error}
        </p>
      )}
      {rechazos.length > 0 && (
        <div role="status" className={AVISO_OJO}>
          <AlertTriangle className="mt-2.5 h-5 w-5 shrink-0 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <p className="min-w-0 flex-1 py-2">
            <b>No entraron:</b>{" "}
            {rechazos
              .map((r) => `${codigoDe(r.id, r.codigo)} (${r.motivo.charAt(0).toLowerCase()}${r.motivo.slice(1)})`)
              .join(" · ")}
          </p>
          <button
            type="button"
            onClick={reserva.cerrarAvisos}
            aria-label="Cerrar el aviso"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}

      {tarjetas.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-5 text-center text-base text-[var(--text-secondary)]">
          Escanea la primera troza: queda apartada en {mixto.code}.
        </p>
      ) : (
        <section aria-label={`Trozas del ${mixto.code}`} className="space-y-3">
          <div className="flex items-start gap-1.5">
            <p className="text-base font-bold text-[var(--text-primary)]" aria-live="polite">
              <span className="tabular-nums">{fmtPt(resumen.pt)} PT</span> ·{" "}
              <span className="tabular-nums">{fmtM3(resumen.m3)} m³</span> · {plural(resumen.piezas, "troza", "trozas")} ·{" "}
              {plural(resumen.especies, "especie", "especies")}
              <span className="font-normal text-[var(--text-secondary)]">
                {" "}→ al repartir, {textoDelReparto(lotesNuevos, tarjetas.length - lotesNuevos)}
              </span>
            </p>
            <InfoTip
              title="El lote mixto"
              what="La pila escaneada queda apartada en el servidor: otra tablet o la oficina ven lo mismo y pueden seguir sumando."
              affects="Al terminar se reparte en un lote por especie y permiso (el libro no mezcla especies ni permisos en un lote). El PT es el Oxapampa si la troza se cubicó; si no, el ≈ aserrable (m³ × 56 % × 424)."
              example="8 Tornillo + 3 Copaiba de un permiso + 2 Copaiba de otro → 3 lotes al repartir."
              side="left"
            />
          </div>
          {tarjetas.map((t) => (
            <TarjetaDeEspecie
              key={t.grupo.clave}
              tarjeta={t}
              reserva={reserva}
              reciente={tarjetas.length > 1 && t.grupo.clave === reciente}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function TarjetaDeEspecie({
  tarjeta,
  reserva,
  reciente,
}: {
  tarjeta: TarjetaDelMixto;
  reserva: ReservaDelMixto;
  reciente: boolean;
}) {
  const { grupo, trozas } = tarjeta;
  return (
    <section
      aria-label={`${grupo.especie}${grupo.permiso ? `, permiso ${grupo.permiso}` : ", sin permiso"}`}
      className={`space-y-2 rounded-2xl border bg-[var(--surface-raised)] p-3 ${
        reciente ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--rule-base)]"
      }`}
    >
      <div>
        <p className="flex flex-wrap items-baseline gap-x-2 text-base font-bold text-[var(--text-primary)]">
          <span>{grupo.especie}</span>
          <span className="tabular-nums">
            {fmtPt(grupo.pt)}{" "}
            <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotuloDelPt(grupo)}</span>
          </span>
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="tabular-nums">{fmtM3(grupo.m3)} m³</span> · {plural(grupo.piezas, "troza", "trozas")} ·{" "}
          {grupo.permiso ? `Permiso ${grupo.permiso}` : "Sin permiso en sus guías"}
          {grupo.guias.length > 0 && ` · guía${grupo.guias.length === 1 ? "" : "s"} ${grupo.guias.join(", ")}`}
        </p>
      </div>
      {/* La última escaneada primero: es la que se acaba de tocar. */}
      <ul className="flex flex-wrap gap-2">
        {[...trozas].reverse().map((t) => {
          const apartando = reserva.apartando.has(t.id);
          const porSubir = reserva.porSubir.agregar.has(t.id);
          const codigo = codigoDeTroza(t);
          return (
            <li key={t.id} className="inline-flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-3">
              <span className="font-mono text-base font-bold text-[var(--text-primary)]">{codigo}</span>
              <span className="ml-2 text-sm tabular-nums text-[var(--text-secondary)]">
                {t.volumenM3 != null ? `${fmtM3(Number(t.volumenM3))} m³` : "—"}
              </span>
              {apartando ? (
                <span className="ml-2 inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> apartando
                </span>
              ) : porSubir ? (
                <span
                  className="ml-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
                  title="Anotada en este equipo sin señal: sube sola al volver la conexión"
                >
                  <Clock className="h-4 w-4" aria-hidden /> por subir
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => reserva.sacar(t.id)}
                disabled={apartando}
                aria-label={`Sacar ${codigo} del lote mixto`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
