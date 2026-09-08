"use client";

/**
 * «Qué no cuadra con el SNIFFS» — la mesa de los lotes cuyo libro no dice lo
 * mismo que quedó declarado en SERFOR (ADR-398).
 *
 * El cuadre por tarjeta contesta «¿este lote está bien?»; esta mesa contesta la
 * pregunta que se hace antes de una fiscalización: **«¿qué me falta?»**. Ordena
 * por m³ de diferencia porque es lo que decide por dónde empezar, y cada fila
 * lleva al lugar donde se resuelve — no a mirarlo otra vez.
 *
 * Un lote que cuadra no aparece: una lista donde el 90 % está bien enseña a no
 * abrirla.
 */

import { useMemo } from "react";
import { AlertTriangle, Boxes, Check, ScanText } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { cuadreSniffs, type CuadreSniffs, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { corridaAcompletar } from "./CtpDeclararDesdeSniffs";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

export interface LoteDescuadrado {
  lote: LoteAserrio;
  cuadre: CuadreSniffs;
  /** Cuánto pesa la diferencia, para ordenar. */
  peso: number;
  /** Se puede resolver acá: hay una corrida viva esperando su producción. */
  resoluble: boolean;
}

/**
 * Los lotes que no cuadran, del que más m³ de diferencia tiene al que menos.
 *
 * `pendiente` pesa lo que el SNIFFS declaró y el libro todavía no: es la deuda
 * completa, no una diferencia parcial.
 */
export function lotesQueNoCuadran(lotes: readonly LoteAserrio[]): LoteDescuadrado[] {
  return lotes
    .map((lote) => {
      const cuadre = cuadreSniffs(lote);
      if (!cuadre) return null;
      /* Entra lo que no cuadra Y lo que todavía no declaró su producción: un
         lote traído de la lista «cuadra» en lo comparable y sin embargo le
         falta cargar lo que salió — es trabajo, no un lote resuelto. */
      if (cuadre.estado === "cuadra" && !cuadre.produccionPendiente) return null;
      const peso =
        cuadre.estado === "pendiente"
          ? cuadre.producidoSniffsM3
          : cuadre.estado === "cuadra"
            ? /* Sin cifra del SNIFFS para comparar, lo que está esperando ser
                 declarado es la materia prima que ya entró a la sierra. */
              cuadre.consumidoLoteM3
            : Math.max(Math.abs(cuadre.deltaProducidoM3 ?? 0), Math.abs(cuadre.deltaConsumidoM3 ?? 0));
      return { lote, cuadre, peso, resoluble: corridaAcompletar(lote) != null } satisfies LoteDescuadrado;
    })
    .filter((x): x is LoteDescuadrado => x !== null)
    .sort((a, b) => b.peso - a.peso);
}

export default function CtpCuadreSniffsModal({
  lotes,
  onResolver,
  onVer,
  onClose,
}: {
  lotes: readonly LoteAserrio[];
  /** Abrir la declaración de ese lote con lo del SNIFFS a mano. */
  onResolver: (lote: LoteAserrio) => void;
  /** Abrir la ficha del lote, para los que no se resuelven declarando. */
  onVer: (lote: LoteAserrio) => void;
  onClose: () => void;
}) {
  const filas = useMemo(() => lotesQueNoCuadran(lotes), [lotes]);
  const pendientes = filas.filter((f) => f.cuadre.estado === "pendiente" || f.cuadre.produccionPendiente);
  const totalPendienteM3 = Math.round(pendientes.reduce((a, f) => a + f.peso, 0) * 10_000) / 10_000;

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      className="sm:max-w-[72rem]"
      icon={ScanText}
      title="Qué no cuadra con el SNIFFS"
      description="Los lotes cuyo libro no dice lo mismo que quedó declarado en SERFOR, del que más pesa al que menos"
      footer={
        <ModalFooter
          nota={
            filas.length === 0 ? (
              "Todos los lotes traídos del SNIFFS cuadran con el libro"
            ) : (
              <span className="font-mono tabular-nums">
                {filas.length} lote{filas.length === 1 ? "" : "s"}
                {pendientes.length > 0 && ` · ${pendientes.length} sin declarar (${fmtM3(totalPendienteM3)} m³)`}
              </span>
            )
          }
        >
          <Btn variant="secondary" onClick={onClose}>
            Cerrar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {filas.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
            <span>
              Una diferencia no es un error todavía: puede ser producción que falta declarar acá, o una captura de otro
              lote. Lo que no puede quedar es sin mirar.
            </span>
          </p>
        )}

        <TablaCtp altoMax="max-h-[55vh]">
          <TheadCtp>
            <tr>
              <th className="px-3 py-2 font-bold">Lote</th>
              <th className="px-3 py-2 font-bold">SNIFFS</th>
              <th className="px-3 py-2 font-bold">Qué pasa</th>
              <th className="w-32 px-3 py-2 text-right font-bold">SNIFFS (m³)</th>
              <th className="w-32 px-3 py-2 text-right font-bold">Libro (m³)</th>
              <th className="w-32 px-3 py-2 text-right font-bold">Diferencia</th>
              <th className="px-3 py-2">
                <span className="sr-only">Resolver</span>
              </th>
            </tr>
          </TheadCtp>
          <TbodyCtp>
            {filas.length === 0 && (
              <FilaVacia cols={7}>
                <span className="inline-flex items-center gap-2 font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  <Check className="h-4 w-4" aria-hidden />
                  Todo lo traído del SNIFFS cuadra con el libro.
                </span>
              </FilaVacia>
            )}
            {filas.map(({ lote, cuadre, peso, resoluble }) => (
              <tr key={lote.id} className="hover:bg-[var(--surface-sunken)]">
                <td className="px-3 py-2">
                  <b className="font-mono text-[var(--text-primary)]">{lote.code}</b>
                  <span className="ml-2 text-[var(--text-tertiary)]">{lote.speciesCommon}</span>
                </td>
                <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{cuadre.lote ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-lg px-2 py-0.5 text-sm font-bold ${
                      cuadre.estado === "pendiente" || cuadre.estado === "cuadra"
                        ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                        : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    }`}
                  >
                    {cuadre.estado === "pendiente" || (cuadre.estado === "cuadra" && cuadre.produccionPendiente)
                      ? "falta declararlo acá"
                      : cuadre.deltaProducidoM3 == null
                        ? "el consumo difiere"
                        : "difiere lo producido"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {cuadre.deltaProducidoM3 == null
                    ? cuadre.consumidoSniffsM3 != null
                      ? fmtM3(cuadre.consumidoSniffsM3)
                      : "—"
                    : fmtM3(cuadre.producidoSniffsM3)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {cuadre.deltaProducidoM3 == null ? fmtM3(cuadre.consumidoLoteM3) : fmtM3(cuadre.producidoLoteM3)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {fmtM3(peso)}
                </td>
                <td className="px-3 py-2 text-right">
                  {resoluble ? (
                    <Btn size="sm" variant="primary" onClick={() => onResolver(lote)}>
                      <Boxes className="h-4 w-4" />
                      {cuadre.produccionPendiente || cuadre.estado === "pendiente" ? "Declarar" : "Completar"}
                    </Btn>
                  ) : (
                    <Btn size="sm" variant="ghost" onClick={() => onVer(lote)} title="No hay corrida viva que declarar: mirá la ficha">
                      Ver la ficha
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </TbodyCtp>
        </TablaCtp>
      </ModalBody>
    </AdminModal>
  );
}
