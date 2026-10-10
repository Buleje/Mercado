"use client";

/**
 * «Anotar D1 y D2» — la planilla de las piezas del patio que no traen sus dos
 * puntas (Brandon 05-10: «en D1 y D2 quiero que estén los datos»).
 *
 * Medido el 05-10 en Blas: 17 de 17 trozas sin D1/D2 en NINGUNA fuente —ni la
 * guía, ni lo medido al recibirlas, ni Oxapampa—. Vinieron del inventario de
 * apertura del 03-10, que no traía esas columnas. Si el dato existe, está en
 * papel: esto es el lugar para pasarlo, todas de una y con el teclado.
 *
 * Escribe por `PATCH /trozas/medidas` (`useGuardarMedidas`), el mismo camino
 * que «Medir escaneando»: sólo sobre lo vacío (nunca pisa a SERFOR), queda
 * marcado `d1d2MedidoEnPlanta` y respeta el mes cerrado. No toca el volumen.
 *
 * Arriba, «Traer de la guía (SERFOR)» (05-10, ADR-469): por cada guía, las
 * medidas de la lista de trozas de la ficha SERFOR, por código. Lo que se llena
 * así sale de la planilla al releer el patio. Con «Escanear QR» (05-10) se lee
 * el QR de la guía de papel con la cámara, y el título habilitante que falta se
 * declara junto con las medidas, guía tras guía.
 */

import { useMemo, useState } from "react";
import { Ruler } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { medidasDePieza } from "@/lib/forestal/trozas-patio-medidas";
import type { CambioMedidaTroza } from "@/lib/forestal/medidas-troza";
import { Btn, ModalBody } from "./ctp-shared";
import CtpTrozasMedirFila, { leerCm, medidaInvalida, type ValoresMedida } from "./ctp-trozas-medir-fila";
import CtpTrozasMedirPegar, { repartirPegado } from "./ctp-trozas-medir-pegar";
import CtpTrozasMedirGuia, { guiasSinMedidas } from "./ctp-trozas-medir-guia";
import { useGuardarMedidas } from "./hooks/use-medidas-trozas";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

const VACIO: ValoresMedida = { d1: "", d2: "" };

export default function CtpTrozasMedirModal({
  piezas, inicialId, onClose, onGuardado,
}: {
  /** Las que tienen alguna punta vacía (`faltanMedidas`), en vivo: al guardar se van solas. */
  piezas: readonly TrozaPatioAPI[];
  /** La pieza desde la que se abrió: va primero y con el foco. */
  inicialId?: string | null;
  onClose: () => void;
  /** Releer el patio: las anotadas cambian en la tabla de atrás. */
  onGuardado: () => void;
}) {
  const [valores, setValores] = useState<Record<string, ValoresMedida>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [pegado, setPegado] = useState<string | null>(null);
  const { guardar, guardando, error } = useGuardarMedidas();

  const filas = useMemo(() => {
    const i = piezas.findIndex((p) => p.id === inicialId);
    return i > 0 ? [piezas[i], ...piezas.slice(0, i), ...piezas.slice(i + 1)] : [...piezas];
  }, [piezas, inicialId]);
  /* Con guías para traer (QR), el foco inicial no salta a la tabla: el modal
     bajaría hasta ella y en el celular abriría el teclado. Si se abrió desde
     una pieza, esa pieza manda. */
  const hayGuias = useMemo(() => guiasSinMedidas(filas).length > 0, [filas]);

  /* Lo que se manda: sólo las casillas tipeadas y válidas, y sólo la punta que
     falta (la que ya está no viaja: el servidor no la pisaría igual). */
  const cambios = useMemo(() => {
    const out: CambioMedidaTroza[] = [];
    for (const t of filas) {
      const v = valores[t.id];
      if (!v) continue;
      const ya = medidasDePieza(t);
      const d1 = ya.d1 == null ? leerCm(v.d1) : null;
      const d2 = ya.d2 == null ? leerCm(v.d2) : null;
      if ((d1 == null && d2 == null) || medidaInvalida(d1) || medidaInvalida(d2)) continue;
      out.push({ id: t.id, ...(d1 != null ? { d1Cm: d1 } : {}), ...(d2 != null ? { d2Cm: d2 } : {}) });
    }
    return out;
  }, [filas, valores]);
  const hayInvalidas = filas.some((t) => {
    const v = valores[t.id];
    return v && (medidaInvalida(leerCm(v.d1)) || medidaInvalida(leerCm(v.d2)));
  });

  const repartir = (texto: string) => {
    const r = repartirPegado(texto, filas, valores);
    setValores(r.valores);
    setPegado(r.resumen);
  };

  const enviar = async () => {
    const r = await guardar(cambios);
    if (!r) return;
    const rech = Object.fromEntries(r.rechazadas.map((x) => [x.id, x.motivo]));
    setErrores(rech);
    /* Lo guardado se limpia; lo rechazado queda tipeado para corregir. */
    setValores((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => rech[id])));
    const ok = cambios.length - r.rechazadas.length;
    setAviso(`${ok} ${ok === 1 ? "pieza guardada" : "piezas guardadas"}${r.rechazadas.length ? ` · ${r.rechazadas.length} no se guardaron (mira el motivo en su renglón)` : ""}.`);
    onGuardado();
    if (r.rechazadas.length === 0) onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={Ruler}
      title="Anotar D1 y D2"
      description={`${piezas.length} ${piezas.length === 1 ? "pieza sin sus dos puntas" : "piezas sin sus dos puntas"} en la lista`}
      ventana
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)]" role="status">
            {error ?? aviso ?? (cambios.length > 0 ? `${cambios.length} para guardar` : "Tipea en cm; Enter pasa a la siguiente casilla.")}
          </span>
          <span className="ml-auto" />
          <Btn onClick={onClose}>Cerrar</Btn>
          <Btn variant="primary" onClick={() => void enviar()} disabled={guardando || cambios.length === 0 || hayInvalidas}>
            {guardando ? "Guardando…" : `Guardar ${cambios.length || ""}`.trim()}
          </Btn>
        </div>
      }
    >
      <ModalBody className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          Lo que anotes queda marcado como <b className="text-[var(--text-primary)]">medido en planta</b>.
          <InfoTip
            title="Cómo se guarda"
            what="Sólo llena lo vacío: nunca pisa un D1/D2 que declaró la guía de SERFOR. El volumen del libro no cambia."
            affects="La casilla gris (≈) es el diámetro medio que haría cuadrar el volumen declarado con el largo (Huber): una pista para tipear, no se guarda. La última columna compara el volumen con tus puntas contra el declarado; más de 10 % pide revisar."
            example="Troza 62B, 7,75 m y 3,424 m³: la pista dice ≈75. Si anotas 76 y 74, la diferencia es +0 %."
          />
        </p>
        {filas.length > 0 && <CtpTrozasMedirGuia piezas={filas} onGuardado={onGuardado} />}
        {filas.length > 0 && <CtpTrozasMedirPegar onRepartir={repartir} resultado={pegado} />}
        {filas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">
            Todas las piezas de la lista tienen sus dos puntas.
          </p>
        ) : (
          <DataTable stickyHeader wrapperClassName="max-h-[58vh]" className="w-full text-sm">
            <thead>
              <tr>
                <th>Código</th>
                <th>Especie</th>
                <th>Guía</th>
                <th className="text-right">Largo (m)</th>
                <th className="text-right">Vol. (m³)</th>
                <th className="text-right">D1 (cm)</th>
                <th className="text-right">D2 (cm)</th>
                <th className="text-right" title="Volumen de Huber con esas puntas contra el declarado">Cuadra</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t, i) => (
                <CtpTrozasMedirFila
                  key={t.id}
                  t={t}
                  indice={i}
                  autoFocus={i === 0 && (Boolean(inicialId) || !hayGuias)}
                  valores={valores[t.id] ?? VACIO}
                  onCambio={(v) => setValores((prev) => ({ ...prev, [t.id]: v }))}
                  onPegarTabla={repartir}
                  error={errores[t.id]}
                />
              ))}
            </tbody>
          </DataTable>
        )}
      </ModalBody>
    </AdminModal>
  );
}
