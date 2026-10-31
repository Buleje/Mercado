"use client";

/**
 * «Cargar costos» — desde la tarjeta «Valor parado» del patio de trozas
 * (Brandon 05-10: ponerle precio al patio sin ir a Ingresos).
 *
 * Lista las guías con piezas paradas y sin factura (`guiasSinCostoDelPatio`,
 * el MISMO criterio con que la tarjeta las cuenta) y cada fila guarda por la
 * puerta de «Plata de la guía» (ver `ctp-trozas-costo-fila`). Se guarda fila por
 * fila o todo junto; lo que el servidor rechaza queda escrito en su fila.
 *
 * La lista se congela al abrir: una guía recién costeada se queda a la vista
 * con su «Guardado» en vez de desaparecer bajo el dedo.
 *
 * `useCostosDelPatio` aplica a las piezas lo que el servidor aceptó, así la
 * tarjeta cambia al instante aunque la vista no relea el patio; si lo relee,
 * manda lo leído.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Coins, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  conCostosCargados,
  type GuiaSinCosto,
  type PiezaKpi,
} from "@/lib/forestal/trozas-patio-kpis";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import FilaCostoGuia, { type FilaRegistrada } from "./ctp-trozas-costo-fila";
import { n2 } from "./ctp-trozas-ui";

const SIN_COSTOS: ReadonlyMap<string, number> = new Map();

/** El mismo conjunto si nada cambia (sin re-render), uno nuevo si sí. */
function conOSin(prev: ReadonlySet<string>, clave: string, va: boolean): ReadonlySet<string> {
  if (prev.has(clave) === va) return prev;
  const n = new Set(prev);
  if (va) n.add(clave);
  else n.delete(clave);
  return n;
}

/** El estado de «Cargar costos» dentro de los indicadores del patio. */
export function useCostosDelPatio<T extends PiezaKpi>(
  trozas: readonly T[],
  onRecargar?: () => void,
) {
  /* Atado a la lectura del patio en que se guardó: si el patio se relee, lo
     guardado ya viene de la base y lo local se descarta solo. */
  const [cargados, setCargados] = useState<{
    base: readonly T[];
    costos: ReadonlyMap<string, number>;
  }>({
    base: trozas,
    costos: SIN_COSTOS,
  });
  const [abierto, setAbierto] = useState<GuiaSinCosto[] | null>(null);
  const costos = cargados.base === trozas ? cargados.costos : SIN_COSTOS;
  const conCostos = useMemo(() => conCostosCargados(trozas, costos), [trozas, costos]);

  const alGuardar = useCallback(
    (nuevos: ReadonlyMap<string, number>) => {
      setCargados((c) => {
        const n = new Map(c.base === trozas ? c.costos : SIN_COSTOS);
        nuevos.forEach((v, k) => n.set(k, v));
        return { base: trozas, costos: n };
      });
      onRecargar?.();
    },
    [trozas, onRecargar],
  );

  const modal = abierto ? (
    <CtpTrozasCostoModal guias={abierto} onGuardado={alGuardar} onClose={() => setAbierto(null)} />
  ) : null;
  return { trozas: conCostos, abrir: setAbierto, modal };
}

export default function CtpTrozasCostoModal({
  guias,
  onGuardado,
  onClose,
}: {
  guias: readonly GuiaSinCosto[];
  onGuardado: (costos: ReadonlyMap<string, number>) => void;
  onClose: () => void;
}) {
  const filas = useRef(new Map<string, FilaRegistrada>());
  const [listos, setListos] = useState<ReadonlySet<string>>(() => new Set());
  const [conProveedor, setConProveedor] = useState<ReadonlySet<string>>(() => new Set());
  const [anotar, setAnotar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; mal: number } | null>(null);
  const [avisoCerrar, setAvisoCerrar] = useState(false);

  const reportar = useCallback((gtf: string, f: FilaRegistrada | null) => {
    if (f) filas.current.set(gtf, f);
    else filas.current.delete(gtf);
    setListos((prev) => conOSin(prev, gtf, Boolean(f?.listo)));
    setConProveedor((prev) => conOSin(prev, gtf, Boolean(f?.conProveedor)));
  }, []);

  /* Una por una y en el orden de la lista: cada guía es su propia transacción,
     y una rechazada (mes cerrado) no frena a las demás. */
  async function guardarTodo() {
    setGuardando(true);
    setResultado(null);
    setAvisoCerrar(false);
    let ok = 0;
    let mal = 0;
    for (const g of guias) {
      const f = listos.has(g.gtfNumber) ? filas.current.get(g.gtfNumber) : undefined;
      if (!f) continue;
      if (await f.guardar()) ok += 1;
      else mal += 1;
    }
    setGuardando(false);
    setResultado({ ok, mal });
  }

  function cerrar() {
    if (guardando) return;
    /* Un número tipeado y sin guardar no se pierde con un clic de más. */
    if (listos.size > 0 && !avisoCerrar) {
      setAvisoCerrar(true);
      return;
    }
    onClose();
  }

  const m3 = guias.reduce((a, g) => a + g.m3Patio, 0);
  const pendientes = listos.size;
  const guiasTxt = (n: number) => `${n} ${n === 1 ? "guía" : "guías"}`;

  return (
    <AdminModal
      open
      onClose={cerrar}
      variant="wide"
      icon={Coins}
      title="Cargar costos del patio"
      description={
        guias.length > 0
          ? `${guiasTxt(guias.length)} con madera parada y sin factura · ${n2(m3)} m³`
          : "Todas las guías del patio tienen su costo."
      }
      footer={
        <ModalFooter
          error={
            resultado && resultado.mal > 0
              ? `${resultado.mal === 1 ? "1 guía no se guardó" : `${resultado.mal} guías no se guardaron`}: el motivo está en su fila.`
              : null
          }
          aviso={
            resultado && resultado.mal === 0 && resultado.ok > 0
              ? `Listo: ${guiasTxt(resultado.ok)} con costo.`
              : undefined
          }
          nota={
            avisoCerrar ? (
              <span className="font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                {pendientes === 1
                  ? "Tienes 1 costo sin guardar"
                  : `Tienes ${pendientes} costos sin guardar`}
                : vuelve a cerrar para descartarlos.
              </span>
            ) : pendientes > 0 ? (
              `${pendientes === 1 ? "1 costo listo" : `${pendientes} costos listos`} para guardar`
            ) : undefined
          }
        >
          <Btn variant="secondary" onClick={cerrar} disabled={guardando}>
            Cerrar
          </Btn>
          <Btn
            variant="primary"
            onClick={() => void guardarTodo()}
            disabled={pendientes === 0 || guardando}
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {pendientes > 1 ? `Guardar los ${pendientes}` : "Guardar todo"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Sólo si alguna guía tiene a quién pagarle: sin proveedor enlazado no hay cuenta que tocar. */}
          {conProveedor.size > 0 ? (
            <label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={anotar}
                onChange={(e) => setAnotar(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Anotar cada guía en la cuenta de su proveedor
            </label>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
            Cómo se reparte
            <InfoTip
              title="Cómo se guarda el costo"
              what="Pon el total de la factura o el S/ por m³: uno calcula el otro con los m³ de la guía entera. Si la guía trae varias especies, el total se reparte por los m³ de cada una y todas quedan al mismo S/ por m³ (igual que Ingresos → Plata de la guía, «total de la factura»). Si cada especie tiene su precio, cárgala allá."
              affects="Mes cerrado, o costo que ya usó una corrida cerrada: no se cambia. La madera de servicio no lleva costo. Sólo admin o dueño guarda. El N° de factura todavía no se guarda aquí."
              example="Guía de 15 m³ (10 de Tornillo y 5 de Cumala) a S/ 6,000.00 → S/ 400.00 por m³: Tornillo S/ 4,000.00 y Cumala S/ 2,000.00."
              side="bottom"
            />
          </span>
        </div>
        {guias.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            Nada que cargar: lo parado ya está costeado o es de servicio.
          </p>
        ) : (
          <ul className="space-y-2">
            {guias.map((g) => (
              <FilaCostoGuia
                key={g.gtfNumber}
                guia={g}
                anotar={anotar}
                reportar={reportar}
                onGuardado={onGuardado}
              />
            ))}
          </ul>
        )}
      </ModalBody>
    </AdminModal>
  );
}
