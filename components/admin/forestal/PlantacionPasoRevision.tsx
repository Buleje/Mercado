"use client";

/**
 * PlantacionPasoRevision — Sección 17 (Resumen) + 19 (Declaración jurada) del
 * RNPF. Pinta el estado de cada bloque del formato con `validarPlantacion` +
 * chequeos propios para lo que esa función no cubre (titular/predio/
 * ubicación/documentos no son parte de sus avisos — sólo área, bloques y
 * especies lo son). No duplica el cálculo de superficie/especies/plantas:
 * usa `calcularResumen`.
 *
 * El texto de la declaración jurada (§4 del Formato N°01) es el MISMO que
 * arma `plantacion-print.ts` — reproducido acá literal, no parafraseado: es
 * una declaración con efectos legales (art. 34 del TUO de la Ley N°27444).
 */
import { AlertTriangle, CheckCircle2, FileCheck, MinusCircle, ScrollText, type LucideIcon } from "@buleje/design-system/icons";
import { calcularResumen, nombreTitular, validarPlantacion, type PlantacionInput } from "@/lib/forestal/plantacion-tramite";

const DECLARACION_1 =
  "Declaro bajo juramento que toda la información antes consignada en la presente solicitud es veraz y ha sido debidamente verificada. En caso que se compruebe fraude o falsedad en la declaración, información o documentación presentada, me someto a las consecuencias y responsabilidades administrativas y penales que correspondan, conforme a lo previsto en el artículo 34 del TUO de la Ley N° 27444, Ley del Procedimiento Administrativo General, aprobado por Decreto Supremo N° 004-2019-JUS, y el Código Penal respecto a los delitos contra la fe pública. Asimismo, declaro que no existe otro derecho de propiedad, registrado o no, sobre el área correspondiente a la plantación forestal.";

const DECLARACION_2 =
  "Adicionalmente, me comprometo a: a) permitir a la autoridad encargada de la inscripción de la plantación, o a quien esta designe, en el ejercicio de sus facultades de seguimiento y control, realizar visitas inspectivas con el objetivo de verificar la información señalada en la presente solicitud; b) actualizar la información contenida en el presente formato previo a los trabajos de aprovechamiento forestal y brindar las facilidades del caso a la ARFFS para que verifique los volúmenes existentes en campo, salvo las excepciones establecidas en la legislación forestal; y c) informar a la ARFFS el cambio de la titularidad de la plantación en caso esta sea vendida o transferida.";

type EstadoSeccion = "ok" | "warn" | "na";

interface Seccion {
  key: string;
  label: string;
  estado: EstadoSeccion;
  detalle?: string;
}

const ESTADO_META: Record<EstadoSeccion, { icon: LucideIcon; cls: string; label: string }> = {
  ok: { icon: CheckCircle2, cls: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", label: "Completo" },
  warn: { icon: AlertTriangle, cls: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", label: "Falta información" },
  na: { icon: MinusCircle, cls: "text-[var(--text-tertiary)]", label: "No corresponde" },
};

function construirSecciones(d: PlantacionInput): Seccion[] {
  const avisos = validarPlantacion(d);
  const avisoPara = (pred: (campo: string) => boolean) => avisos.some((a) => pred(a.campo));
  const resumen = calcularResumen(d);
  const hayBloques = d.bloques.length > 0;

  const titularOk = Boolean(
    d.titularTipoPersona &&
      (d.titularTipoPersona === "juridica" ? d.titularRazonSocial?.trim() : d.titularNombres?.trim() || d.titularApellidoPaterno?.trim()) &&
      d.titularNumeroDocumento?.trim() &&
      d.titularCelular?.trim(),
  );
  const predioOk = Boolean(d.predioNombre?.trim() && d.titularidadTipo);
  const ubicacionOk = Boolean(d.predioDepartamento && d.predioProvincia && d.predioDistrito);
  const areaOk = Boolean(d.predioAreaTotalHa && d.predioAreaTotalHa > 0) && !avisoPara((c) => c === "predioAreaTotalHa" || c === "bloques");
  const bloquesOk = hayBloques && !avisoPara((c) => c === "bloques" || (c.startsWith("bloques.") && c.endsWith(".vertices")));
  const especiesAplica = hayBloques;
  const especiesOk = especiesAplica && d.bloques.some((b) => b.especies.length > 0) && !avisoPara((c) => c.includes(".especies."));
  const coordenadasAplica = hayBloques;
  const coordenadasOk = coordenadasAplica && d.bloques.every((b) => b.vertices.length >= 3);
  const documentosRequeridos = (d.documentos ?? []).filter((doc) => doc.clasificacion === "requerido");
  const documentosOk = documentosRequeridos.every((doc) => Boolean(doc.documentId));

  return [
    { key: "titular", label: "Titular", estado: titularOk ? "ok" : "warn" },
    { key: "predio", label: "Predio", estado: predioOk ? "ok" : "warn" },
    { key: "ubicacion", label: "Ubicación", estado: ubicacionOk ? "ok" : "warn" },
    {
      key: "area",
      label: "Área",
      estado: areaOk ? "ok" : "warn",
      detalle: `${resumen.areaBloquesHa.toLocaleString("es-PE")} ha en bloques / ${resumen.areaDeclaradaHa.toLocaleString("es-PE")} ha declaradas`,
    },
    { key: "bloques", label: "Bloques", estado: hayBloques && bloquesOk ? "ok" : "warn", detalle: `${resumen.numBloques} bloque(s)` },
    {
      key: "especies",
      label: "Especies",
      estado: !especiesAplica ? "na" : especiesOk ? "ok" : "warn",
      detalle: `${resumen.numEspecies} especie(s) · ${resumen.totalPlantas.toLocaleString("es-PE")} plantas`,
    },
    { key: "coordenadas", label: "Coordenadas", estado: !coordenadasAplica ? "na" : coordenadasOk ? "ok" : "warn" },
    {
      key: "documentos",
      label: "Documentos adjuntos",
      estado: documentosOk ? "ok" : "warn",
      detalle: `${documentosRequeridos.filter((doc) => doc.documentId).length}/${documentosRequeridos.length} requeridos adjuntados`,
    },
  ];
}

const inputCls =
  "mt-1 h-10 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 disabled:opacity-60";

export default function PlantacionPasoRevision({
  datos,
  soloLectura,
  onChange,
  onGenerarDocumento,
}: {
  datos: PlantacionInput;
  soloLectura?: boolean;
  onChange: (patch: Partial<PlantacionInput>) => void;
  onGenerarDocumento: () => void;
}) {
  const secciones = construirSecciones(datos);
  const resumen = calcularResumen(datos);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        <b className="text-[var(--text-primary)]">{nombreTitular(datos)}</b> · {resumen.areaBloquesHa.toLocaleString("es-PE")} ha · {resumen.numBloques} bloque(s) ·{" "}
        {resumen.numEspecies} especie(s) · {resumen.totalPlantas.toLocaleString("es-PE")} plantas
      </p>

      <ul className="divide-y divide-[var(--rule-soft)] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {secciones.map((s) => {
          const meta = ESTADO_META[s.estado];
          return (
            <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">{s.label}</p>
                {s.detalle && <p className="text-xs text-[var(--text-tertiary)]">{s.detalle}</p>}
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-bold ${meta.cls}`}>
                <meta.icon className="h-4 w-4" aria-hidden="true" /> {meta.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Declaración jurada</p>
        </div>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{DECLARACION_1}</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{DECLARACION_2}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-tertiary)]">Lugar</span>
            <input type="text" value={datos.djLugar ?? ""} disabled={soloLectura} onChange={(e) => onChange({ djLugar: e.target.value })} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-tertiary)]">Fecha</span>
            {/* Texto libre, no `type="date"`: el documento imprime `djFecha` tal
                cual (`plantacion-print.ts`), igual que Lugar/Titular/DNI — un
                selector ISO forzaría un formato que el papel no pide. */}
            <input
              type="text"
              value={datos.djFecha ?? ""}
              placeholder="21 de agosto de 2026"
              disabled={soloLectura}
              onChange={(e) => onChange({ djFecha: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-tertiary)]">Titular / representante</span>
            <input
              type="text"
              value={datos.djTitularNombre ?? ""}
              placeholder={nombreTitular(datos)}
              disabled={soloLectura}
              onChange={(e) => onChange({ djTitularNombre: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-tertiary)]">DNI</span>
            <input type="text" value={datos.djDni ?? ""} disabled={soloLectura} onChange={(e) => onChange({ djDni: e.target.value })} className={inputCls} />
          </label>
        </div>

        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={Boolean(datos.djAceptado)}
            disabled={soloLectura}
            onChange={(e) => onChange({ djAceptado: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm font-bold text-[var(--text-primary)]">Declaro bajo juramento que la información consignada arriba es veraz.</span>
        </label>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        {!datos.djAceptado && (
          <p className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Aceptá la declaración jurada para generar el documento.</p>
        )}
        <button
          type="button"
          onClick={onGenerarDocumento}
          className={`inline-flex h-12 items-center gap-2 rounded-2xl px-6 text-sm font-bold text-white transition ${
            datos.djAceptado ? "bg-[var(--brand-ink)] hover:opacity-90" : "bg-[var(--text-tertiary)]/60"
          }`}
        >
          <FileCheck className="h-4 w-4" aria-hidden="true" /> Generar documentación
        </button>
      </div>
    </div>
  );
}
