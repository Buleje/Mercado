"use client";

/**
 * «Agregar cubicación» a un día de producción (ADR-445, 27-09).
 *
 * Brandon: *«a esos sin pieza por pieza quiero que se les pueda agregar la
 * cubicación para complementar o vincular a los m³ aserrados»*. Un día
 * declarado por tipo (m³ por especie y clasificación, sin escuadrías) recibe
 * la pieza por pieza de una cubicación:
 *
 *  · una YA GUARDADA — en Blas hay cubicaciones sin corrida esperando esto —
 *    se ata acá, después de ver el cuadre por especie y tipo; «Vincular» no se
 *    prende si alguna especie no llega a lo declarado (10 litros o 2 %);
 *  · o «Cubicar ahora», que abre el cubicador contra el libro que ya existe
 *    (`CtpCubicarProductoModal`), con estas corridas: no hay un segundo
 *    cubicador.
 *
 * Completar ≠ corregir (ADR-401): no cambia la cantidad ni los paquetes del
 * asiento. Si lo cubicado dice otra cosa que lo declarado, lo que corresponde
 * es corregir la corrida, no atarle una medición que no la explica.
 */

import { useState } from "react";
import { Calculator, CheckCircle2, Link2, Loader2, Ruler } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { etiquetaCorta, etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { Btn, I, ModalBody, ModalFooter } from "./ctp-shared";
import CtpCubicarProductoModal from "./CtpCubicarProductoModal";
import {
  CorridasAElegir,
  TablaDelCuadre,
  VeredictoDelCuadre,
  YaAtadaA,
} from "./ctp-vincular-cubicacion-partes";
import { cuadrarVinculo } from "./vincular-cubicacion-cuadre";
import { corridasDeLaCubicacion, useVincularCubicacion } from "./hooks/use-vincular-cubicacion";
import { useVinculoDeCubicacion } from "./hooks/use-vinculo-de-cubicacion";

export default function CtpVincularCubicacionModal({
  dia,
  corridaInicial,
  onClose,
  onVinculada,
  aboveModals = false,
}: {
  /** `YYYY-MM-DD`. */
  dia: string;
  /** Desde una corrida del modal del día: arranca tildada sólo ésa. */
  corridaInicial?: string;
  onClose: () => void;
  /** Se ató: quien abrió relee la tira y el libro. */
  onVinculada?: (mensaje: string) => void;
  /** Se abre desde otro modal (el día, Producir sin lote). */
  aboveModals?: boolean;
}) {
  const v = useVinculoDeCubicacion(dia, corridaInicial);
  const { datos, errorDia, corridas, cubicacion, nuevas, cuadre, yaVinculada } = v;
  const { vincular, guardando, error } = useVincularCubicacion();
  const [cubicando, setCubicando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const puedeVincular = !!cubicacion && cuadre.cuadra && !guardando && !v.guardadas.cargando;

  const terminar = (mensaje: string) => {
    setHecho(mensaje);
    onVinculada?.(mensaje);
  };
  const guardar = async () => {
    if (!cubicacion || !puedeVincular) return;
    const r = await vincular(
      cubicacion,
      nuevas.map((c) => c.id),
    );
    /* 409: otra persona la cambió. Se relee la lista (el cuadre vuelve a
       hacerse con sus piezas nuevas); lo que se tenía no se reenvía. */
    if (r === "desactualizada") v.guardadas.recargar();
    if (r !== "ok") return;
    const nros = nuevas.map((c) => c.lineNo).join(", ");
    terminar(
      `«${cubicacion.nombre}» quedó vinculada a ${nuevas.length === 1 ? "la corrida" : "las corridas"} N.º ${nros}: ${fmtPiezas(cubicacion.totales.piezas)} pza · ${fmtM3(cubicacion.totales.m3)} m³.`,
    );
  };

  const nota = hecho
    ? null
    : yaVinculada
      ? "Ya está vinculada a esas corridas."
      : `${nuevas.length} de ${corridas.length} corridas`;

  return (
    <AdminModal
      open
      aboveModals={aboveModals}
      onClose={guardando ? () => undefined : onClose}
      variant="info"
      icon={Ruler}
      title="Agregar cubicación"
      description={`${etiquetaLarga(dia)} · la pieza por pieza de lo declarado por tipo`}
      footer={
        <ModalFooter error={error} nota={nota}>
          <Btn variant={hecho ? "primary" : "secondary"} onClick={onClose} disabled={guardando}>
            {hecho ? "Listo" : "Cerrar"}
          </Btn>
          {!hecho && (
            <>
              <Btn
                variant="secondary"
                onClick={() => setCubicando(true)}
                disabled={nuevas.length === 0}
              >
                <Calculator className="h-4 w-4" aria-hidden /> Cubicar ahora
              </Btn>
              <Btn variant="primary" onClick={() => void guardar()} disabled={!puedeVincular}>
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Link2 className="h-4 w-4" aria-hidden />
                )}
                {yaVinculada ? "Ya vinculada" : "Vincular"}
              </Btn>
            </>
          )}
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {hecho ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 p-3 text-base text-[var(--text-primary)]"
          >
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-ink)]"
              aria-hidden
            />
            {hecho}
          </p>
        ) : !datos ? (
          errorDia ? (
            <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-ink)]">
              No se pudo leer el día: {errorDia}
            </p>
          ) : (
            <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las corridas del día…
            </p>
          )
        ) : corridas.length === 0 ? (
          <p className="py-6 text-sm text-[var(--text-tertiary)]">
            Ese día no tiene corridas con m³ declarados.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <Kicker as="h4">Corridas del día</Kicker>
              <InfoTip
                title="A qué corridas se ata"
                what="Se tildan solas las declaradas por tipo (sin pieza por pieza)."
                affects="No cambia los m³ ni los paquetes: suma la pieza por pieza para el Anexo 04 y la marca del día."
                example="Lunes: Cumala 3.200 m³ por tipo. Se vincula la cubicación de 102 piezas que dio 3.208 m³."
              />
            </div>
            <CorridasAElegir
              corridas={corridas}
              elegidas={v.elegidas}
              atadas={v.idsAtadas}
              necesario={v.necesario}
              onAlternar={v.alternar}
            />

            <label className="block">
              <Kicker as="span" className="mb-1 block">
                Cubicación guardada
              </Kicker>
              <select
                className={I}
                value={v.id}
                onChange={(e) => v.elegir(e.target.value)}
                disabled={v.guardadas.cargando}
              >
                <option value="">
                  {v.guardadas.cargando ? "Leyendo las guardadas…" : "Elige una cubicación"}
                </option>
                {v.guardadas.lista.map((c) => {
                  const atadas = corridasDeLaCubicacion(c).length;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.nombre} · {fmtPiezas(c.totales.piezas)} pza · {fmtM3(c.totales.m3)} m³ ·{" "}
                      {etiquetaCorta(c.fecha)}
                      {atadas > 0 ? ` · ya atada a ${atadas}` : " · sin corrida"}
                    </option>
                  );
                })}
              </select>
            </label>

            {cubicacion && (
              <>
                <VeredictoDelCuadre cuadre={cuadre} />
                {/* Lo que ya ampara (de este día o de otros) entra al cuadre:
                    una medición no respalda dos veces la misma madera. */}
                <YaAtadaA corridas={v.atadas} />
                <TablaDelCuadre cuadre={cuadre} />
              </>
            )}
          </>
        )}
      </ModalBody>

      {/* Adentro del árbol de este modal: Radix lo apila encima como hijo. */}
      {cubicando && (
        <CtpCubicarProductoModal
          aboveModals
          titulo={etiquetaLarga(dia)}
          filas={nuevas.map((c) => ({
            id: c.id,
            etiqueta: `N.º ${c.lineNo}`,
            especie: c.especie,
            producto: c.producto,
            piezas: c.piezasAsiento,
            volumenM3: c.m3,
          }))}
          ctpEntryIds={nuevas.map((c) => c.id)}
          /* Atar exige cuadrar (sin «Guardar igual»): lo medido tiene que
             explicar lo declarado por especie, con la misma regla de acá. */
          validarAtadura={(p) => cuadrarVinculo(nuevas, p).motivo}
          onClose={() => setCubicando(false)}
          onGuardada={(mensaje) => {
            setCubicando(false);
            invalidarCtp();
            terminar(mensaje);
          }}
        />
      )}
    </AdminModal>
  );
}
