"use client";

/**
 * Importar la LISTA de programaciones del SNIFFS (ADR-398).
 *
 * La pantalla anterior al detalle: una fila por lote programado, con su N°,
 * las fechas, la especie y —si la columna está— el volumen consumido. Un CTP
 * que empieza a llevar el libro acá tiene decenas de esas filas ya declaradas
 * allá, y armarlas de a una es la tarde entera.
 *
 * Se pega (captura o texto), se revisa fila por fila y se crean los lotes como
 * PROGRAMACIÓN: consumo declarado, producción pendiente. La producción se
 * declara después con «Agregar producción a esta corrida» (ADR-365) o pegando
 * el detalle de cada una — que es exactamente el orden en que ocurre en la
 * planta.
 *
 * Dos guardas que no se negocian: **una fila sin volumen consumido no se
 * importa** (un lote con 0 m³ no significa nada en el libro) y **un código que
 * ya existe se marca como repetido y se saltea** — importar dos veces la misma
 * lista no puede duplicar el libro.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, ScanText, Upload } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  interpretarListaProgramacionesSniffs,
  pareceListaProgramaciones,
  type ProgramacionSniffs,
} from "@/lib/forestal/sniffs-produccion-parse";
import { useLecturaPegada } from "./hooks/use-lectura-pegada";
import { Tecla, ZonaPegarSniffs, fmtDiaSniffs } from "./CtpPegarSniffs";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

const CAMPO =
  "h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

interface FilaImportar {
  id: string;
  incluir: boolean;
  code: string;
  especie: string;
  especieCientifica: string | null;
  inicio: string;
  fin: string;
  /** Texto: se edita, y vacío es un motivo para no importar. */
  volumen: string;
  leida: ProgramacionSniffs;
}

export interface ResultadoImportProgramaciones {
  creados: { code: string; lineNo: number }[];
  fallados: { code: string; motivo: string }[];
}

const filasDe = (filas: ProgramacionSniffs[], yaExisten: Set<string>): FilaImportar[] =>
  filas.map((f, i) => ({
    id: `${i}-${f.lote ?? "sin"}`,
    /* Lo repetido llega desmarcado: importarlo de nuevo duplicaría el libro. */
    incluir: !(f.lote && yaExisten.has(f.lote.trim().toLowerCase())),
    code: f.lote ?? "",
    especie: f.especieComun ?? "",
    especieCientifica: f.especieCientifica,
    inicio: f.fechaInicio ?? "",
    fin: f.fechaFin ?? "",
    volumen: f.volumenConsumidoM3 != null ? String(f.volumenConsumidoM3) : "",
    leida: f,
  }));

export default function CtpImportarProgramacionesModal({
  lotes,
  crearProgramacion,
  onListo,
  onClose,
}: {
  /** Los lotes que ya existen: contra ellos se detectan los repetidos. */
  lotes: readonly LoteAserrio[];
  /** Crea UN lote programado. El modal la llama una vez por fila incluida. */
  crearProgramacion: (input: {
    code: string | null;
    speciesCommon: string;
    speciesScientific: string | null;
    volumenConsumidoM3: number;
    fecha: string | undefined;
    finProceso: string | null;
    leida: ProgramacionSniffs;
  }) => Promise<{ code: string; lineNo: number }>;
  onListo: (r: ResultadoImportProgramaciones) => void;
  onClose: () => void;
}) {
  const [filas, setFilas] = useState<FilaImportar[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [fallados, setFallados] = useState<{ code: string; motivo: string }[]>([]);

  const yaExisten = useMemo(
    () => new Set(lotes.map((l) => l.code.trim().toLowerCase())),
    [lotes],
  );

  const lectura = useLecturaPegada<{ filas: ProgramacionSniffs[]; avisos: string[] }>({
    interpretar: interpretarListaProgramacionesSniffs,
    validar: (r, fuente) =>
      r.filas.length === 0
        ? fuente === "captura"
          ? "Leí la captura pero no encontré filas con fecha y especie. Prueba con una captura donde la tabla se vea entera, o copia su texto y pégalo acá."
          : (r.avisos[0] ?? "No encontré programaciones en lo que pegaste.")
        : null,
    /* Una sola programación también se importa: el modal ya dice qué se pega. */
    parece: (texto) => pareceListaProgramaciones(texto, 1),
    onLeido: (r) => {
      setFilas(filasDe(r.filas, yaExisten));
      setAvisos(r.avisos);
      setFallados([]);
    },
    escuchar: !importando,
  });

  const editar = (id: string, cambio: Partial<FilaImportar>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambio } : f)));

  /** Por qué esta fila no se puede importar. `null` = se puede. */
  const motivoNoVa = (f: FilaImportar): string | null => {
    if (!f.especie.trim()) return "sin especie";
    if (!(Number(f.volumen) > 0)) return "sin volumen consumido";
    if (f.code.trim() && yaExisten.has(f.code.trim().toLowerCase())) return "ya existe un lote con ese código";
    if (f.inicio && f.fin && f.fin < f.inicio) return "el fin es anterior al inicio";
    return null;
  };

  const incluidas = filas.filter((f) => f.incluir);
  const conProblema = incluidas.filter((f) => motivoNoVa(f) != null);
  const listas = incluidas.filter((f) => motivoNoVa(f) == null);
  const totalM3 = Math.round(listas.reduce((a, f) => a + (Number(f.volumen) || 0), 0) * 10_000) / 10_000;
  const repetidas = filas.filter((f) => f.code.trim() && yaExisten.has(f.code.trim().toLowerCase())).length;

  async function importar() {
    if (listas.length === 0 || importando) return;
    setImportando(true);
    setFallados([]);
    const creados: { code: string; lineNo: number }[] = [];
    const errores: { code: string; motivo: string }[] = [];
    for (const [i, f] of listas.entries()) {
      setAvance({ hechas: i, total: listas.length });
      try {
        const r = await crearProgramacion({
          code: f.code.trim() || null,
          speciesCommon: f.especie.trim(),
          speciesScientific: f.especieCientifica,
          volumenConsumidoM3: Number(f.volumen),
          fecha: f.inicio || undefined,
          finProceso: f.fin || null,
          leida: f.leida,
        });
        creados.push(r);
        /* La fila importada sale de la lista: reintentar no la duplica. */
        setFilas((prev) => prev.filter((x) => x.id !== f.id));
      } catch (e) {
        /* Una fila que falla NO aborta las otras: de treinta programaciones,
           que una tenga el código repetido no puede obligar a rehacer las 29. */
        errores.push({ code: f.code || f.especie, motivo: e instanceof Error ? e.message : String(e) });
      }
    }
    setAvance(null);
    setImportando(false);
    setFallados(errores);
    if (creados.length > 0) onListo({ creados, fallados: errores });
  }

  const hayFilas = filas.length > 0;

  return (
    <AdminModal
      open
      onClose={importando ? () => {} : onClose}
      variant="info"
      className="sm:max-w-[80rem]"
      icon={Upload}
      title="Importar programaciones del SNIFFS"
      description="Una fila por lote programado: se crean con el consumo declarado y la producción pendiente"
      footer={
        <ModalFooter
          error={fallados.length > 0 ? `${fallados.length} fila(s) no se pudieron importar: ${fallados[0]?.motivo}` : null}
          nota={
            hayFilas ? (
              <span className="font-mono tabular-nums">
                {listas.length} lista{listas.length === 1 ? "" : "s"} · {fmtM3(totalM3)} m³
                {conProblema.length > 0 && ` · ${conProblema.length} con problema`}
                {repetidas > 0 && ` · ${repetidas} ya en el libro`}
              </span>
            ) : (
              "Pega la lista de programaciones del SNIFFS"
            )
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={importando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={() => void importar()} disabled={listas.length === 0 || importando}>
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {importando
              ? `Importando ${(avance?.hechas ?? 0) + 1} de ${avance?.total ?? listas.length}…`
              : `Importar ${listas.length} lote${listas.length === 1 ? "" : "s"}`}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <ZonaPegarSniffs
          lectura={lectura}
          titulo="Pega la lista"
          compacto={hayFilas}
          texto={
            <>
              la captura de la tabla de programaciones (<Tecla>Ctrl+V</Tecla>) o su texto copiado
              {hayFilas ? "" : ". Cada fila se revisa antes de crear nada"}.
            </>
          }
        />

        {avisos.map((a) => (
          <p
            key={a}
            className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{a}</span>
          </p>
        ))}

        {repetidas > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <ScanText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <b>{repetidas}</b> fila{repetidas === 1 ? "" : "s"} ya {repetidas === 1 ? "tiene" : "tienen"} un lote con
              ese código en el libro: {repetidas === 1 ? "viene" : "vienen"} desmarcada{repetidas === 1 ? "" : "s"} para
              no duplicarlo.
            </span>
          </p>
        )}

        {fallados.length > 0 && (
          <ul className="space-y-1">
            {fallados.map((f) => (
              <li
                key={f.code + f.motivo}
                className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              >
                {f.code}: {f.motivo}
              </li>
            ))}
          </ul>
        )}

        <TablaCtp altoMax="max-h-[50vh]">
          <TheadCtp>
            <tr>
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Importar</span>
              </th>
              <th className="px-3 py-2 font-bold">N° de lote</th>
              <th className="px-3 py-2 font-bold">Especie</th>
              <th className="w-36 px-3 py-2 font-bold">Inicio</th>
              <th className="w-36 px-3 py-2 font-bold">Fin</th>
              <th className="w-32 px-3 py-2 text-right font-bold">Consumido (m³)</th>
              <th className="px-3 py-2 font-bold">Leído</th>
            </tr>
          </TheadCtp>
          <TbodyCtp>
            {!hayFilas && (
              <FilaVacia cols={7}>
                Todavía no pegaste nada. La lista del SNIFFS entra tal cual: una fila por lote programado.
              </FilaVacia>
            )}
            {filas.map((f) => {
              const problema = f.incluir ? motivoNoVa(f) : null;
              return (
                <tr
                  key={f.id}
                  className={!f.incluir ? "opacity-50" : problema ? "bg-[var(--data-warning-500)]/10" : "hover:bg-[var(--surface-sunken)]"}
                >
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={f.incluir}
                      onChange={(e) => editar(f.id, { incluir: e.target.checked })}
                      aria-label={`Importar ${f.code || f.especie}`}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={f.code}
                      onChange={(e) => editar(f.id, { code: e.target.value })}
                      placeholder="automático"
                      maxLength={60}
                      aria-label={`N° de lote de ${f.especie || "la fila"}`}
                      className={`${CAMPO} font-mono`}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={f.especie}
                      onChange={(e) => editar(f.id, { especie: e.target.value })}
                      maxLength={120}
                      aria-label={`Especie de ${f.code || "la fila"}`}
                      className={CAMPO}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      value={f.inicio}
                      onChange={(e) => editar(f.id, { inicio: e.target.value })}
                      aria-label={`Inicio de ${f.code || "la fila"}`}
                      className={CAMPO}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      value={f.fin}
                      onChange={(e) => editar(f.id, { fin: e.target.value })}
                      min={f.inicio || undefined}
                      aria-label={`Fin de ${f.code || "la fila"}`}
                      className={CAMPO}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={f.volumen}
                      onChange={(e) => editar(f.id, { volumen: e.target.value })}
                      aria-label={`Volumen consumido de ${f.code || "la fila"}`}
                      className={`${CAMPO} text-right font-mono tabular-nums`}
                    />
                  </td>
                  <td className="max-w-[20rem] px-3 py-1.5 text-xs text-[var(--text-tertiary)]">
                    {problema ? (
                      <b className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{problema}</b>
                    ) : (
                      <span className="block truncate font-mono" title={f.leida.crudo}>
                        {f.leida.estado ? `${f.leida.estado} · ` : ""}
                        {f.leida.fechaInicio ? fmtDiaSniffs(f.leida.fechaInicio) : "sin fecha"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </TbodyCtp>
        </TablaCtp>

        {hayFilas && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
            Se crean como <b>programación</b>.
            <InfoTip icono="ayuda" title="Qué es una programación" what="El consumo queda declarado y la producción, pendiente." example="Después se declara desde la tabla de Producción o pegando el detalle de cada lote." />
          </p>
        )}
      </ModalBody>
    </AdminModal>
  );
}
