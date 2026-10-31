"use client";

/**
 * «Lote mixto» (ADR-441): la pila del patio escaneada de corrido, guardada en
 * el servidor, que al terminar se reparte en un lote por especie + permiso.
 *
 * Brandon (26-09): «en Consumos quiero activar la cámara para escanear el QR de
 * las trozas; se almacenarán en un lote mixto con varias especies; al terminar,
 * de ese lote mixto se crearán lotes de especies individuales como se trabaja
 * normalmente, y ya se podrán poner en producción».
 *
 * Tres momentos en el mismo modal:
 *   1. sin mixto abierto → abrir uno (LM-AAAA-NNN);
 *   2. la pila: escanear (cada lectura aparta en el servidor), sacar, anular;
 *   3. «Terminar y repartir» → vista previa → los lotes creados, cada uno con
 *      «Producir» y «Ver en Consumos» (como `CtpArmarLoteEscaneoModal`).
 *
 * Lee el patio ENTERO (su propio `useLotesAserrio`, sin «Solo este permiso»):
 * una troza de otro permiso escaneada no puede decir «no está en esta lista».
 * Al abrirse relee todo: otra tablet pudo apartar mientras tanto.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Combine, Flame, Layers, PackageOpen } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { RechazoDeTroza } from "@/lib/forestal/lote-mixto";
import { lineaDelMixto } from "@/lib/forestal/lote-mixto-vista";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { AvisoLotesArmados, codigoDeTroza, CAMPO, type LoteArmado } from "./armar-lote-escaneo-partes";
import CtpLoteMixtoPila from "./CtpLoteMixtoPila";
import CtpLoteMixtoReparto from "./CtpLoteMixtoReparto";
import { AnularMixto, SinMixtoAbierto } from "./lote-mixto-partes";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import type { EstadoLotesMixtos } from "./hooks/use-lotes-mixtos";
import { usePilaDelMixto } from "./hooks/use-pila-del-mixto";
import { useReservaDelMixto } from "./hooks/use-reserva-del-mixto";
import type { LoteAProducir } from "./CtpLotesView";

export default function CtpLoteMixtoModal({
  mixtos,
  onClose,
  onProducir,
  onCargar,
  puedeAnular,
}: {
  mixtos: EstadoLotesMixtos;
  onClose: () => void;
  /** Producir con un lote hijo (Consumos → Producción). */
  onProducir?: (lote: LoteAProducir) => void;
  /** Cargarlo en Consumos (elige el lote en «Consumir en un lote…»). */
  onCargar?: (lote: LoteAProducir) => void;
  /** Anular es de dueño o administrador. */
  puedeAnular: boolean;
}) {
  const patio = useLotesAserrio();
  const trozas = patio.trozas;
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [paso, setPaso] = useState<"pila" | "reparto">("pila");
  const [anulando, setAnulando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  /** Lo repartido mientras el modal estuvo abierto, lo último arriba. */
  const [armados, setArmados] = useState<LoteArmado[]>([]);
  /** Trozas que el reparto soltó porque ya no podían ir a ningún lote. */
  const [excluidas, setExcluidas] = useState<RechazoDeTroza[]>([]);

  const { recargar: releerMixtos } = mixtos;
  const { recargar: releerPatio } = patio;
  const releer = useCallback(async () => {
    invalidarCtp("/forestal/");
    await Promise.all([releerMixtos(true), releerPatio()]);
  }, [releerMixtos, releerPatio]);
  /* Al abrir, todo fresco: el caché de hace un minuto no sabe lo que apartó otra tablet. */
  useEffect(() => {
    void releer();
  }, [releer]);

  const mixto = mixtos.abiertos.find((m) => m.id === elegidoId) ?? mixtos.abiertos[0] ?? null;
  const porId = useMemo(() => new Map(trozas.map((t) => [t.id, t])), [trozas]);
  const codigoDe = useCallback(
    (id: string) => {
      const t = porId.get(id);
      return t ? codigoDeTroza(t) : id.slice(-6);
    },
    [porId],
  );
  const reserva = useReservaDelMixto({ mixto, reservar: mixtos.reservar, alTerminar: releer, codigoDe });
  const pila = usePilaDelMixto({ mixto, patio: trozas, lotes: patio.lotes, reserva });

  const crear = async () => {
    setCreando(true);
    setErrorCrear(null);
    try {
      const nuevo = await mixtos.crear();
      setElegidoId(nuevo.id);
      setPaso("pila");
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  };

  const repartir = async ({ destinos, notas }: { destinos: Record<string, string>; notas: string }) => {
    if (!mixto) return;
    const r = await mixtos.repartir(mixto.id, { destinos, notas });
    await releerPatio();
    setArmados((prev) => [
      ...r.lotes.map((l) => ({
        loteId: l.loteId,
        code: l.code,
        agregadas: l.piezas,
        rechazadas: [],
        nuevo: l.nuevo,
        especie: l.especie,
        permiso: l.permiso,
      })),
      ...prev,
    ]);
    setExcluidas(r.excluidas);
    setPaso("pila");
    setElegidoId(null);
  };

  const noListo =
    pila.pendiente > 0
      ? "Espera a que se aparte todo lo escaneado (o a que vuelva la señal) para repartir."
      : null;
  const cargandoPrimera = mixtos.cargando && mixtos.mixtos.length === 0;

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={Combine}
      title={mixto ? `Lote mixto ${mixto.code}` : "Lote mixto"}
      description="Escanea la pila mezclada; al terminar se reparte en un lote por especie y permiso."
      footer={
        <ModalFooter error={mixtos.error && !cargandoPrimera ? `No se pudo releer: ${mixtos.error}` : null} nota={mixto && paso === "pila" ? noListo : null}>
          <Btn variant="secondary" onClick={onClose}>
            Cerrar
          </Btn>
          {mixto && paso === "pila" && puedeAnular && !anulando && (
            <Btn variant="ghost" onClick={() => setAnulando(true)}>
              <Ban className="h-4 w-4" aria-hidden /> Anular
            </Btn>
          )}
          {mixto && paso === "pila" && (
            <Btn
              variant="primary"
              onClick={() => setPaso("reparto")}
              disabled={pila.tarjetas.length === 0 || pila.pendiente > 0 || anulando}
              title={noListo ?? undefined}
            >
              <Layers className="h-4 w-4" aria-hidden /> Terminar y repartir
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <AvisoLotesArmados
          lotes={armados}
          acciones={
            onProducir || onCargar
              ? (r) => {
                  const lote = { id: r.loteId, code: r.code ?? "" };
                  return (
                    <>
                      {onCargar && (
                        <Btn variant="secondary" onClick={() => onCargar(lote)}>
                          <PackageOpen className="h-4 w-4" aria-hidden /> Ver en Consumos
                        </Btn>
                      )}
                      {onProducir && (
                        <Btn variant="primary" onClick={() => onProducir(lote)}>
                          <Flame className="h-4 w-4" aria-hidden /> Producir
                        </Btn>
                      )}
                    </>
                  );
                }
              : undefined
          }
        />

        {excluidas.length > 0 && (
          <p role="status" className="rounded-xl bg-[var(--data-warning-500)]/10 px-3 py-2 text-base text-[var(--text-primary)]">
            <b>Quedaron fuera del reparto:</b>{" "}
            {excluidas.map((x) => `${x.codigo ?? x.id.slice(-6)} (${x.motivo})`).join(" · ")}
          </p>
        )}

        {mixtos.abiertos.length > 1 && paso === "pila" && (
          <label className="block text-sm">
            <span className="mb-1 block font-bold text-[var(--text-secondary)]">Lote mixto abierto</span>
            <select value={mixto?.id ?? ""} onChange={(e) => setElegidoId(e.target.value)} className={CAMPO}>
              {mixtos.abiertos.map((m) => (
                <option key={m.id} value={m.id}>
                  {lineaDelMixto({ code: m.code, status: m.status, piezas: m.resumen.piezas, especies: m.resumen.especies })}
                </option>
              ))}
            </select>
          </label>
        )}

        {cargandoPrimera ? (
          <p className="py-6 text-base text-[var(--text-tertiary)]">Leyendo los lotes mixtos…</p>
        ) : mixtos.error && mixtos.mixtos.length === 0 ? (
          <div role="alert" className="space-y-2 rounded-xl bg-[var(--data-error-500)]/10 px-3 py-3 text-base text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            <p className="font-bold">No se pudieron leer los lotes mixtos: {mixtos.error}</p>
            <Btn variant="secondary" onClick={() => void releer()}>
              Reintentar
            </Btn>
          </div>
        ) : !mixto ? (
          <SinMixtoAbierto onCrear={() => void crear()} creando={creando} error={errorCrear} />
        ) : paso === "reparto" ? (
          <CtpLoteMixtoReparto
            code={mixto.code}
            pila={pila.pila}
            tarjetas={pila.tarjetas}
            lotes={patio.lotes}
            onVolver={() => setPaso("pila")}
            onConfirmar={repartir}
          />
        ) : (
          <>
            {anulando && (
              <AnularMixto
                code={mixto.code}
                onCancelar={() => setAnulando(false)}
                onAnular={async (motivo) => {
                  await mixtos.anular(mixto.id, motivo);
                  setAnulando(false);
                  setElegidoId(null);
                  await releerPatio();
                }}
              />
            )}
            <CtpLoteMixtoPila
              mixto={mixto}
              patio={{ trozas, cargando: patio.cargando, error: patio.error }}
              tarjetas={pila.tarjetas}
              resumen={pila.resumen}
              reserva={reserva}
              lotesNuevos={pila.lotesNuevos}
              reciente={pila.reciente}
            />
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
