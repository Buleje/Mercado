"use client";

/**
 * Estado y guardado de la ventana de una actividad (ADR-501 §3). La pantalla
 * valida con el MISMO schema del servidor (`ActividadCrearSchema.safeParse`)
 * para decir el error al lado del botón sin esperar el 400; el servidor
 * vuelve a validar igual. Editar manda `version` (409 si otro la cambió).
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ActividadCrearSchema, OBJETIVO_POR_REGLA, primerMensaje } from "@/lib/agenda/schemas";
import type { PlantillaAgenda } from "@/lib/agenda/plantillas";
import type {
  ActividadDTO,
  CanalAgenda,
  ColorAgenda,
  FechaKey,
  ObjetivoActividad,
  Recurrencia,
  ReglaAgenda,
  RolResponsableAgenda,
} from "@/lib/agenda/tipos";
import { useAgenda } from "@/hooks/use-agenda";
import { crearActividad, editarActividad } from "../agenda-api";
import { diaDelMes, diaSemanaDe, hoyKey } from "../comun/fechas";
import { REGLA_UI } from "../comun/reglas";

export interface Borrador {
  nombre: string;
  regla: ReglaAgenda;
  objetivo: ObjetivoActividad | null;
  recurrencia: Recurrencia;
  /** "" = sin hora. */
  hora: string;
  canales: CanalAgenda[];
  responsableRol: RolResponsableAgenda | null;
  parametros: Record<string, unknown>;
  color: ColorAgenda;
  nota: string;
  activo: boolean;
}

/** Lo que recibe cada regla al elegirla (los mismos valores por defecto del schema). */
export const PARAMETROS_INICIALES: Record<ReglaAgenda, Record<string, unknown>> = {
  asistencia: { minimo: "todos" },
  facturas: { modo: "emitir" },
  servicio_aserrio: { soloTerceros: false },
  gastos_ingresos: { que: ["gastos", "ingresos"] },
  adelantos: {},
  cuenta_tercero: {},
  manual: {},
};

const LUN_A_SAB = [1, 2, 3, 4, 5, 6];

export function borradorVacio(hoy: FechaKey = hoyKey()): Borrador {
  return {
    nombre: "",
    regla: "manual",
    objetivo: null,
    recurrencia: { frecuencia: "semanal", desde: hoy, hasta: null, diasSemana: LUN_A_SAB, diaMes: null, cadaN: null },
    hora: "",
    canales: ["campana"],
    responsableRol: null,
    parametros: {},
    color: "info",
    nota: "",
    activo: true,
  };
}

export function borradorDeActividad(a: ActividadDTO): Borrador {
  return {
    nombre: a.nombre,
    regla: a.regla,
    objetivo: a.objetivo,
    recurrencia: { ...a.recurrencia, diasSemana: [...a.recurrencia.diasSemana] },
    hora: a.hora ?? "",
    canales: [...a.canales],
    responsableRol: (a.responsableRol as RolResponsableAgenda | null) ?? null,
    parametros: { ...a.parametros },
    color: a.color,
    nota: a.nota ?? "",
    activo: a.activo,
  };
}

/** Una sugerida abierta en la ventana (la de la cuenta de un tercero pide elegir la cuenta). */
export function borradorDePlantilla(p: PlantillaAgenda, hoy: FechaKey = hoyKey()): Borrador {
  return {
    ...borradorVacio(hoy),
    nombre: p.pideObjetivo ? "" : p.nombre,
    regla: p.regla,
    recurrencia: { frecuencia: p.frecuencia, desde: hoy, hasta: null, diasSemana: [...p.diasSemana], diaMes: p.diaMes, cadaN: null },
    hora: p.hora ?? "",
    canales: [...p.canales],
    parametros: { ...p.parametros },
    color: p.color,
    activo: false,
  };
}

/** Al cambiar la frecuencia, lo que pide la nueva viene ya lleno. */
export function cambiarFrecuencia(r: Recurrencia, frecuencia: Recurrencia["frecuencia"]): Recurrencia {
  const dias = r.diasSemana.length > 0 ? r.diasSemana : [diaSemanaDe(r.desde)];
  return {
    ...r,
    frecuencia,
    diasSemana: frecuencia === "diaria" ? [0, 1, 2, 3, 4, 5, 6] : frecuencia === "semanal" || frecuencia === "quincenal" ? dias : [],
    diaMes: frecuencia === "mensual" ? (r.diaMes ?? diaDelMes(r.desde)) : null,
    cadaN: frecuencia === "cada_n_dias" ? (r.cadaN ?? 2) : null,
    hasta: frecuencia === "una_vez" ? null : r.hasta,
  };
}

function cuerpo(b: Borrador) {
  return {
    nombre: b.nombre,
    regla: b.regla,
    objetivo: b.objetivo,
    recurrencia: b.recurrencia,
    hora: b.hora || null,
    canales: b.canales,
    responsableRol: b.responsableRol,
    parametros: b.parametros,
    color: b.color,
    nota: b.nota,
    activo: b.activo,
  };
}

export function useActividadForm(actividad: ActividadDTO | null, inicial: Borrador | undefined, onGuardada: () => void) {
  const { refrescar } = useAgenda();
  const [b, setB] = useState<Borrador>(() => (actividad ? borradorDeActividad(actividad) : (inicial ?? borradorVacio())));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = useCallback(<K extends keyof Borrador>(campo: K, valor: Borrador[K]) => {
    setB((prev) => ({ ...prev, [campo]: valor }));
    setError(null);
  }, []);

  /** Cambiar el tipo trae sus parámetros y suelta la cuenta si ya no va. */
  const cambiarRegla = useCallback((regla: ReglaAgenda) => {
    setB((prev) => {
      const pide = OBJETIVO_POR_REGLA[regla];
      const nombreEraDelTipo = prev.nombre.trim() === "" || prev.nombre === REGLA_UI[prev.regla].label;
      return {
        ...prev,
        regla,
        nombre: nombreEraDelTipo ? (regla === "manual" ? "" : REGLA_UI[regla].label) : prev.nombre,
        parametros: { ...PARAMETROS_INICIALES[regla] },
        objetivo: pide && prev.objetivo?.tipo === pide.tipo ? prev.objetivo : null,
      };
    });
    setError(null);
  }, []);

  const guardar = useCallback(async () => {
    const datos = cuerpo(b);
    const v = ActividadCrearSchema.safeParse(datos);
    if (!v.success) {
      setError(primerMensaje(v.error));
      return;
    }
    setGuardando(true);
    const r = actividad ? await editarActividad(actividad.id, { ...datos, version: actividad.version }) : await crearActividad(datos);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success(actividad ? "Actividad guardada" : b.activo ? "Actividad creada" : "Actividad creada apagada: préndela cuando quieras");
    refrescar();
    onGuardada();
  }, [actividad, b, onGuardada, refrescar]);

  return { b, cambiar, cambiarRegla, guardar, error, guardando };
}
