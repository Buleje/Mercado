"use client";

/**
 * «Descontar la madera usada» — desde la ficha del permiso (ADR-432 + ADR-408).
 *
 * Brandon, 25-09: «en el aviso aparece "Vincular", eliges de qué guías salió
 * cada corrida y el saldo baja solo». Las corridas sin materia prima se agrupan
 * por especie; cada especie ofrece el lote con trozas del permiso que ya existe,
 * o lo arma con las trozas libres que alcanzan al 56 %. Después, la MISMA
 * vinculación de siempre: en tanda (`CtpVincularEnTandaModal`, con el reparto a
 * la vista antes de firmar) o de a una (`CtpVincularMateriaPrimaModal`, desde
 * Trazabilidad). Toda escritura va por `sumar-corrida`: ninguna vía nueva.
 *
 * Los dos vinculadores son modales escritos a mano: mientras están abiertos,
 * este `AdminModal` se oculta (`open={!paso}`) en vez de apilarse — Radix
 * apagaría sus clics (memoria `radix-abre-modal-a-mano-ocultar-no-apilar`).
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Layers, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import {
  bloqueadasDelLote,
  notaDelLoteDelPermiso,
  ordenDeEspecie,
  permisoDeTrozas,
  planDescontar,
  type GrupoAVincular,
} from "@/lib/forestal/vincular-desde-permiso";
import type { VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import CtpDescontarGrupo from "./CtpDescontarGrupo";
import { NotasDelPlan } from "./CtpDescontarPartes";
import CtpVincularEnTandaModal from "./CtpVincularEnTandaModal";
import CtpVincularMateriaPrimaModal from "./CtpVincularMateriaPrimaModal";
import { Btn, ModalFooter } from "./ctp-shared";
import { plural } from "./permiso-volumen-ui";

interface Paso {
  clave: string;
  loteId: string;
}

export default function CtpDescontarMaderaModal({
  volumen,
  ids,
  individual = false,
  onCerrar,
  onRecargar,
}: {
  volumen: VolumenDelPermiso;
  /** Las corridas a vincular: las del aviso, o UNA desde Trazabilidad. */
  ids: readonly string[];
  /** Una sola corrida: se vincula troza por troza, no en tanda. */
  individual?: boolean;
  onCerrar: () => void;
  /** Vuelve a sumar la ficha: el saldo tiene que bajar a la vista. */
  onRecargar?: () => void;
}) {
  const patio = useLotesAserrio({ contratoId: volumen.contratoId });
  const [paso, setPaso] = useState<Paso | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const avance = useRef({ vinculadas: 0, m3: 0 });
  /* Las que ya se escribieron (el servidor respondió 200) salen de la lista al
     cerrar el vinculador, sin esperar a que la ficha se vuelva a sumar (tarda
     unos segundos: ofrecer «Vincular 3» sobre dos ya vinculadas confunde). Se
     juntan en un ref y se aplican AL CERRAR: sacarlas mientras la tanda escribe
     le cambiaría las filas —o la desmontaría— a mitad de camino. */
  const escritas = useRef<string[]>([]);
  const [hechas, setHechas] = useState<ReadonlySet<string>>(() => new Set());

  const idsKey = ids.join("|");
  const corridas = useMemo(() => {
    const s = new Set(idsKey ? idsKey.split("|") : []);
    return volumen.corridas.filter((c) => s.has(c.id) && !hechas.has(c.id));
  }, [volumen.corridas, idsKey, hechas]);
  /* Las filas de guía del permiso: de ellas cuelga el consumo (I2 por fila). */
  const filas = useMemo(
    () => volumen.guias.map((g) => ({ id: g.id, gtf: g.gtf, especie: g.especie, m3: g.m3, consumidoM3: g.consumidoM3 })),
    [volumen.guias],
  );
  const plan = useMemo(
    () => planDescontar(corridas, patio.trozas, patio.lotes, filas),
    [corridas, patio.trozas, patio.lotes, filas],
  );
  const grupo = paso ? (plan.grupos.find((g) => g.clave === paso.clave) ?? null) : null;
  /* Si la especie se fue de la lista con el vinculador abierto, este modal
     vuelve: nunca queda todo oculto. */
  const vinculando = paso != null && grupo != null;
  /* El orden de la sierra (el mismo con que se armó el lote): todas las trozas
     del permiso de esa especie, libres o en lote. */
  const orden = useMemo(() => (paso ? ordenDeEspecie(patio.trozas, paso.clave) : []), [paso, patio.trozas]);

  const alTerminar = (texto: string | null, ok = true) => {
    const ya = escritas.current;
    escritas.current = [];
    if (ya.length > 0) setHechas((prev) => new Set([...prev, ...ya]));
    setPaso(null);
    if (texto) setAviso({ ok, texto });
    invalidarCtp();
    void patio.recargar();
    onRecargar?.();
  };

  const abrir = (g: GrupoAVincular, loteId: string) => {
    avance.current = { vinculadas: 0, m3: 0 };
    escritas.current = [];
    setAviso(null);
    setPaso({ clave: g.clave, loteId });
  };

  const armar = async (g: GrupoAVincular, trozaIds: string[]) => {
    const elegidas = g.libres.filter((t) => trozaIds.includes(t.id));
    const m3 = elegidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
    const r = await patio.crearConTrozas({
      speciesCommon: g.especie,
      notes: notaDelLoteDelPermiso(volumen.codigo, g, elegidas.length, m3),
      tipoProductoConsumir: "rolliza",
      /* La sierra cortó desde la primera corrida: la ventana del proceso abre ahí. */
      inicioProceso: g.ofrecibles[0]?.fecha ?? null,
      permiso: permisoDeTrozas(elegidas),
      trozaIds,
    });
    /* Si no entró ninguna, no hay nada que vincular: el motivo queda a la vista. */
    if (r.agregadas > 0) abrir(g, r.loteId);
    return { rechazadas: r.rechazadas };
  };

  /* Las piezas del lote que NO van (fila de otra especie, I2, otro permiso): la
     tanda y el vinculador individual las sacan del reparto. */
  const bloqueadas = useMemo(() => {
    const lote = paso ? patio.lotes.find((l) => l.id === paso.loteId) : undefined;
    return lote ? bloqueadasDelLote(lote, plan) : {};
  }, [paso, patio.lotes, plan]);

  /* Sólo el lote de ESTE paso: las piezas bloqueadas y las fechas se calculan
     para él. Ofrecer todos los lotes del tenant dejaba elegir otro sin esos
     frenos, y el servidor no compara el permiso de la troza con el de la
     corrida. */
  const loteDelPaso = useMemo(
    () => (paso ? patio.lotes.filter((l) => l.id === paso.loteId) : []),
    [paso, patio.lotes],
  );

  const total = corridas.reduce((a, c) => a + (c.m3 ?? 0), 0);
  const ofrecibles = plan.grupos.reduce((a, g) => a + g.ofrecibles.length, 0);
  const titulo = individual ? "Vincular la corrida" : "Descontar la madera usada";

  return (
    <>
      <AdminModal
        open={!vinculando}
        onClose={onCerrar}
        title={titulo}
        description={`${volumen.codigo} · ${plural(corridas.length, "corrida sin materia prima", "corridas sin materia prima")}`}
        icon={Layers}
        variant="wide"
        claveVentana="ctp-descontar-madera"
        footer={
          <ModalFooter>
            <Btn onClick={onCerrar}>Cerrar</Btn>
          </ModalFooter>
        }
      >
        <div className={`space-y-3 ${MODAL_BODY}`} data-vista="ctp-descontar-madera">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
            <span>
              <b className="font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(total)}</b> m³ de aserrada en{" "}
              {plural(plan.grupos.length, "especie", "especies")} ·{" "}
              <b className="text-[var(--text-primary)]">
                {ofrecibles} de {corridas.length}
              </b>{" "}
              se pueden vincular hoy
            </span>
            <InfoTip
              title={titulo}
              what="Cada corrida pasa a decir de qué trozas salió: el consumo se registra y el saldo de rolliza del permiso baja solo."
              affects="Sólo troza de ESTE permiso y la misma especie, que ya estaba en el patio el día de la corrida y cuya fila de guía la puede descontar. Lo que no, se frena y dice qué arreglar en Ingresos."
              example="5 corridas de Cachimbo · 10,05 m³ → lote de ≈ 18 m³ de troza (al 56 %)."
            />
          </div>

          {aviso && (
            <p
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                aviso.ok
                  ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--text-primary)]"
                  : "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 text-[var(--text-primary)]"
              }`}
            >
              {aviso.ok ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
              )}
              {aviso.texto}
            </p>
          )}

          {patio.error ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]">
              <span className="min-w-0 flex-1">No se pudieron leer las trozas del permiso: {patio.error}</span>
              <Btn size="sm" onClick={() => void patio.recargar()}>Reintentar</Btn>
            </div>
          ) : patio.cargando && patio.lotes.length === 0 && patio.trozas.length === 0 ? (
            <p className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las trozas del permiso…
            </p>
          ) : plan.grupos.length === 0 && plan.apartadas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-5 text-center text-sm text-[var(--text-secondary)]">
              Todas las corridas de este permiso ya descuentan su madera.
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Corridas sin materia prima por especie">
              {plan.grupos.map((g) => (
                <CtpDescontarGrupo
                  key={g.clave}
                  grupo={g}
                  ocupado={patio.cargando}
                  onVincular={(loteId) => abrir(g, loteId)}
                  onArmar={(trozaIds) => armar(g, trozaIds)}
                />
              ))}
            </ul>
          )}

          <NotasDelPlan plan={plan} truncado={patio.patioTruncado} />
        </div>
      </AdminModal>

      {vinculando && !individual && (
        <CtpVincularEnTandaModal
          corridas={grupo.ofrecibles}
          lotes={loteDelPaso}
          loteInicialId={paso.loteId}
          rendimientoMeta={RENDIMIENTO_META}
          ordenTrozas={orden}
          fechasIngreso={plan.fechasIngreso}
          bloqueadas={bloqueadas}
          onAvance={(n, m3, id) => {
            avance.current = { vinculadas: n, m3 };
            escritas.current.push(id);
          }}
          onCerrar={() => {
            const { vinculadas, m3 } = avance.current;
            /* Cancelar sin escribir nada no recarga nada; si alcanzó a escribir
               alguna antes de fallar, eso sí se dice y se vuelve a sumar. */
            if (vinculadas === 0) return setPaso(null);
            alTerminar(
              `Se vincularon ${vinculadas} de ${grupo.ofrecibles.length} corridas de ${grupo.especie} · ${fmtM3(m3)} m³ de rolliza descontados. Las que faltan siguen acá.`,
              false,
            );
          }}
          onListo={() => {
            const { vinculadas, m3 } = avance.current;
            alTerminar(
              `${plural(vinculadas, "corrida", "corridas")} de ${grupo.especie} ${vinculadas === 1 ? "quedó vinculada" : "quedaron vinculadas"} · ${fmtM3(m3)} m³ de rolliza descontados del saldo del permiso.`,
            );
          }}
        />
      )}
      {vinculando && individual && grupo.ofrecibles[0] && (
        <CtpVincularMateriaPrimaModal
          corrida={grupo.ofrecibles[0]}
          lotes={loteDelPaso}
          loteInicialId={paso.loteId}
          /* Las piezas del lote que le tocan en el reparto, no el lote entero. */
          trozasSugeridas={grupo.origen === "lote" ? grupo.sugeridas : undefined}
          fechasIngreso={plan.fechasIngreso}
          bloqueadas={bloqueadas}
          onCerrar={() => setPaso(null)}
          onListo={(msg) => {
            escritas.current = [grupo.ofrecibles[0]!.id];
            alTerminar(msg);
          }}
        />
      )}
    </>
  );
}
