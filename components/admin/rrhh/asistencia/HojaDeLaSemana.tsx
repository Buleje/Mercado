"use client";

/**
 * HojaDeLaSemana — personas × lunes a domingo, con lo ganado del día y de la
 * semana (ADR-416, pedido de Brandon 2026-09-14).
 *
 * Las marcas salen de `use-rrhh-asistencia`: es la misma hoja que el día y el
 * mes, y se edita igual. Lo ganado sale de `/api/rrhh/ganado`, o sea de
 * `calcularGanado` en el servidor (nunca una cuenta aparte), y sólo lo ve el
 * nivel completo. Bajo 640 px va el calendario por persona del mes, con 7 días.
 *
 * Tardanzas (ADR-417): la semana es donde se revisa y de donde sale el PDF con
 * firma, así que lo que la hoja del día sugiere el martes tiene que verse acá
 * el viernes — un punto en la celda, el detalle al abrirla, y arriba una banda
 * que dice quién y qué día quedó en PRESENTE con la hora de entrada pasada.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Users } from "@buleje/design-system/icons";
import { EmptyState, LoadingState, StatCard } from "@buleje/design-system";
import { avisarFallos, useRrhhAsistencia } from "@/hooks/use-rrhh-asistencia";
import { useRrhhGanado } from "@/hooks/use-rrhh-ganado";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { sinDato } from "@/lib/errores/sin-dato";
import { rangoDeDias, semanaDe, sumarDias } from "@/lib/rrhh/fechas";
import { cn, limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON } from "../rrhh-form";
import { COPY_REFERENCIA, dentroDeVentana, formatearPEN, pluralizar } from "../rrhh-ui";
import HistorialMarcaModal from "./HistorialMarcaModal";
import LeyendaEstados from "./LeyendaEstados";
import NavegadorPeriodo from "./NavegadorPeriodo";
import SemanaEnCelular from "./SemanaEnCelular";
import SemanaEnTabla from "./SemanaEnTabla";
import { conteoDelMes, diasTrabajados } from "./conteo-mes";
import { etiquetaSemana, formatearDias, horariosPorColaborador, marcaConTardanza, resumenTardanzas, tardanzasSinMarcar } from "./semana";
import { descargarPdfDeLaSemana, type FilaSemana } from "./semana-pdf";
import type { ColaboradorMinDTO, GanadoPersona, NivelRrhh } from "@/lib/rrhh/tipos";

interface Props {
  /** Lunes de la semana que se mira. */
  desde: string;
  onCambiarSemana: (lunes: string) => void;
  nivel: NivelRrhh;
  /** El switch Día/Semana/Mes, que va en la misma barra que el navegador. */
  selectorModo?: ReactNode;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function HojaDeLaSemana({ desde, onCambiarSemana, nivel, selectorModo }: Props) {
  const hasta = sumarDias(desde, 6);
  const conPlata = nivel === "completo";
  const { hoja, loading, error, pendientes, erroresPorCelda, marcar, guardarAhora, recargar } = useRrhhAsistencia(desde, hasta);
  const { ganado, error: errorGanado, recargar: recargarGanado } = useRrhhGanado(desde, hasta, undefined, conPlata);
  // El horario vive en el puesto y la hoja sólo trae `{ id, nombre }` del puesto
  // de cada persona (ADR-417): sin este catálogo ninguna celda tiene contra qué
  // comparar la hora marcada, y la semana se revisa a mano, como antes.
  const { puestos } = useRrhhPuestos();
  const [historial, setHistorial] = useState<{ colaborador: ColaboradorMinDTO; fecha: string } | null>(null);
  const [descargando, setDescargando] = useState(false);

  const dias = useMemo(() => rangoDeDias(desde, hasta), [desde, hasta]);
  const hoy = hoja?.hoy ?? limaDateKey();
  const semanaActual = semanaDe(hoy).desde;

  // Lo ganado se vuelve a pedir cuando una marca ya quedó guardada (sin
  // pendientes): con el toque optimista todavía no cambió nada en el servidor.
  const firmaMarcas = useMemo(() => (hoja?.marcas ?? []).map((m) => `${m.id}:${m.estado}`).sort().join("|"), [hoja]);
  const firmaAnterior = useRef<{ desde: string; firma: string } | null>(null);
  useEffect(() => {
    if (!conPlata || !hoja || pendientes.size > 0) return;
    const previa = firmaAnterior.current;
    if (previa && previa.desde === hoja.desde && previa.firma !== firmaMarcas) recargarGanado();
    firmaAnterior.current = { desde: hoja.desde, firma: firmaMarcas };
  }, [conPlata, hoja, pendientes.size, firmaMarcas, recargarGanado]);

  const ganadoPorId = useMemo(() => {
    // Lo ganado de la semana anterior, todavía en pantalla, no se mezcla con la nueva.
    if (!ganado || ganado.desde !== desde) return null;
    return new Map<string, GanadoPersona>(ganado.personas.map((p) => [p.colaboradorId, p]));
  }, [ganado, desde]);

  const filas = useMemo<FilaSemana[]>(() => {
    if (!hoja) return [];
    return hoja.colaboradores.map((c) => {
      const marcasDeLaPersona = hoja.marcas.filter((m) => m.colaboradorId === c.id);
      const { conteo, sinMarcar } = conteoDelMes(c, marcasDeLaPersona, dias, hoy);
      return { c, marcasDeLaPersona, conteo, sinMarcar, trabajados: diasTrabajados(conteo), plata: ganadoPorId?.get(c.id) ?? null };
    });
  }, [hoja, dias, hoy, ganadoPorId]);

  const horarios = useMemo(() => horariosPorColaborador(puestos, hoja?.colaboradores ?? []), [puestos, hoja]);

  // Lo que la revisión semanal tiene que ver antes de firmar: los días que
  // quedaron en PRESENTE con la hora de entrada pasada de la tolerancia.
  // `dias.includes` lo acota a la semana en pantalla aunque la hoja traiga un
  // rango más ancho, y `dentroDeVentana` deja afuera lo que el rol no podría
  // corregir — un aviso sin acción posible enseña a ignorar la banda entera.
  const tardanzas = useMemo(() => {
    if (!hoja) return null;
    const lista = tardanzasSinMarcar(hoja.marcas, horarios, (f) => dias.includes(f) && dentroDeVentana(f, hoja.ventana));
    if (lista.length === 0) return null;
    const nombreDe = (id: string) => hoja.colaboradores.find((c) => c.id === id)?.nombre ?? "Alguien";
    return { n: lista.length, detalle: resumenTardanzas(lista, nombreDe) };
  }, [hoja, horarios, dias]);

  const totales = useMemo(
    () => ({
      trabajados: filas.reduce((a, f) => a + f.trabajados, 0),
      faltas: filas.reduce((a, f) => a + f.conteo.FALTA, 0),
      ganado: ganadoPorId ? r2(filas.reduce((a, f) => a + (f.plata?.total ?? 0), 0)) : null,
    }),
    [filas, ganadoPorId],
  );

  // La marca viaja COMPLETA (`marcaConTardanza`): el buffer del hook reemplaza
  // la celda, y con sólo el estado se perdería la hora que delató la tardanza.
  const aceptarTardanza = (colaboradorId: string, fecha: string) =>
    marcar(marcaConTardanza(hoja?.marcas.find((m) => m.colaboradorId === colaboradorId && m.fecha === fecha), colaboradorId, fecha));

  // Igual que el día y el mes: vaciar el buffer ANTES de irse de la semana.
  const irASemana = async (lunes: string) => {
    if (lunes === desde || lunes > semanaActual) return;
    const resultado = await guardarAhora();
    if (!resultado.ok) avisarFallos(resultado.fallos);
    onCambiarSemana(lunes);
  };

  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarPdfDeLaSemana({ filas, dias, lunes: desde, hoy, nivel, total: totales.ganado });
    } catch (err) {
      sinDato("RRHH PDF de la semana")(err);
      toast.error("No se pudo armar el PDF. Reintenta.");
    } finally {
      setDescargando(false);
    }
  };

  let contenido: ReactNode;
  if (loading) {
    contenido = <LoadingState message="Cargando la hoja de la semana..." />;
  } else if (error || !hoja) {
    contenido = (
      <AvisoRrhh tono="error" accion={<button type="button" onClick={recargar} className={BOTON.chico}>Reintentar</button>}>
        {error ?? "No se pudo cargar la hoja."}
      </AvisoRrhh>
    );
  } else if (filas.length === 0) {
    contenido = <EmptyState icon={Users} title="Sin personal esta semana" description="Agrega personas desde la hoja del día o desde Personal." />;
  } else {
    contenido = (
      <>
        <div className={cn("grid grid-cols-2 gap-3", conPlata ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          <StatCard label="Personas" value={filas.length} density="compact" />
          <StatCard label="Días trabajados" value={formatearDias(totales.trabajados)} density="compact" />
          <StatCard label="Faltas" value={totales.faltas} density="compact" />
          {conPlata && <StatCard label="Ganado de la semana" value={totales.ganado != null ? formatearPEN(totales.ganado) : "—"} density="compact" />}
        </div>

        {conPlata && errorGanado && <AvisoRrhh tono="error">{errorGanado}: la hoja se ve igual, sin los montos.</AvisoRrhh>}

        {tardanzas && (
          <AvisoRrhh tono="aviso" icono={AlertTriangle}>
            {pluralizar(tardanzas.n, "día figura presente", "días figuran presentes")} con la hora de entrada pasada de la tolerancia del puesto: {tardanzas.detalle}. Ábrelos y confirma la tardanza antes de firmar la semana.
          </AvisoRrhh>
        )}

        <SemanaEnTabla
          filas={filas}
          dias={dias}
          hoy={hoy}
          ventana={hoja.ventana}
          horarios={horarios}
          pendientes={pendientes}
          erroresPorCelda={erroresPorCelda}
          conPlata={conPlata}
          totales={totales}
          onMarcar={(colaboradorId, fecha, estado) => marcar({ colaboradorId, fecha, estado })}
          onAceptarTardanza={aceptarTardanza}
          onVerHistorial={(colaborador, fecha) => setHistorial({ colaborador, fecha })}
        />

        <SemanaEnCelular
          filas={filas}
          colaboradores={hoja.colaboradores}
          marcas={hoja.marcas}
          dias={dias}
          hoy={hoy}
          ventana={hoja.ventana}
          horarios={horarios}
          pendientes={pendientes}
          erroresPorCelda={erroresPorCelda}
          conPlata={conPlata}
          onMarcar={(colaboradorId, fecha, estado) => marcar({ colaboradorId, fecha, estado })}
          onAceptarTardanza={aceptarTardanza}
          onVerHistorial={(colaborador, fecha) => setHistorial({ colaborador, fecha })}
        />

        <LeyendaEstados />
        {conPlata && <p className="text-xs text-[var(--text-tertiary)]">{COPY_REFERENCIA}</p>}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selectorModo}
        <div className="flex flex-wrap items-center gap-2">
          <NavegadorPeriodo
            etiqueta={etiquetaSemana(desde)}
            esActual={desde === semanaActual}
            textoActual="Esta semana"
            textoVolver="Ir a esta semana"
            puedeAvanzar={desde < semanaActual}
            etiquetaAnterior="Semana anterior"
            etiquetaSiguiente="Semana siguiente"
            onAnterior={() => irASemana(sumarDias(desde, -7))}
            onSiguiente={() => irASemana(sumarDias(desde, 7))}
            onVolver={() => irASemana(semanaActual)}
            selector={{ tipo: "date", valor: desde, max: hoy, onElegir: (f) => irASemana(semanaDe(f).desde) }}
          />
          <button type="button" onClick={descargar} disabled={!hoja || filas.length === 0 || descargando} className={cn(BOTON.secundario, "gap-2")}>
            <Download className="h-4 w-4" />
            {descargando ? "Armando el PDF…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      {contenido}

      {historial && <HistorialMarcaModal open onClose={() => setHistorial(null)} colaborador={historial.colaborador} fecha={historial.fecha} />}
    </div>
  );
}
