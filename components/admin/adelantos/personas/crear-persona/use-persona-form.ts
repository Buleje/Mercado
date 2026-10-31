"use client";

/**
 * El estado del alta (o edición) de persona: los datos, lo que contestó el
 * padrón, la foto del DNI elegida, el aviso de repetida y el guardado.
 *
 * Vive junto al modal y no en `hooks/` porque sólo lo usa este modal.
 */
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { normalizarNumero } from "@/lib/documento/tipos";
import { buscarDuplicado } from "@/lib/adelantos/persona-validacion";
import { useLookupDocumento } from "@/hooks/use-lookup-documento";
import { cuerpoDe, datosDe, esEmpresa, type DatosPersona, type Hallado, type PersonaEditable } from "./datos";
import { errorAntesDeGuardar } from "./validacion";
import { ubigeoCanonico } from "./SeccionUbicacion";
import { borrarFotoDocumento, pedirAdelantoPara, subirFotoDocumento, type FotoElegida } from "./acciones";

type RespuestaError = { error?: string; issues?: string[] };

export function usePersonaForm({
  persona,
  personasExistentes,
  onCreated,
}: {
  persona?: PersonaEditable;
  personasExistentes: readonly PersonaEditable[];
  onCreated: () => void;
}) {
  /** La persona que se edita. Cambia si «ya existe → abrirla». */
  const [actual, setActual] = useState<PersonaEditable | undefined>(persona);
  const [d, setD] = useState<DatosPersona>(() => datosDe(persona));
  /** Lo que dijo el padrón; viaja al backend junto con lo demás. */
  const [oficial, setOficial] = useState<Hallado | null>(null);
  const [foto, setFoto] = useState<FotoElegida | null>(null);
  /** Al editar: quitar la foto que ya tenía (se borra al guardar). */
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hoy = limaDateKey();
  const editando = !!actual;

  const set = useCallback(<K extends keyof DatosPersona>(k: K, v: DatosPersona[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
  }, []);

  /**
   * Rellenar sin pisar lo escrito a mano: si alguien ya tipeó un nombre —el
   * apodo con el que se lo conoce— la razón social no puede borrárselo. El
   * ubigeo baja con el nombre del catálogo para que las listas lo reconozcan.
   */
  const rellenar = useCallback((r: Hallado) => {
    setOficial(r);
    const u = ubigeoCanonico(r);
    setD((prev) => {
      const siVacio = (actualV: string, nuevo?: string) => (actualV.trim() || !nuevo ? actualV : nuevo);
      return {
        ...prev,
        nombre: siVacio(prev.nombre, r.nombre),
        direccion: siVacio(prev.direccion, r.direccionCalle || r.direccion),
        departamento: siVacio(prev.departamento, u.departamento),
        provincia: siVacio(prev.provincia, u.provincia),
        distrito: siVacio(prev.distrito, u.distrito),
      };
    });
  }, []);

  const lookup = useLookupDocumento(d.documento, rellenar);

  const duplicado = useMemo(
    () => buscarDuplicado({ nombre: d.nombre, documento: d.documento, telefono: d.telefono }, personasExistentes, actual?.id),
    [d.nombre, d.documento, d.telefono, personasExistentes, actual?.id],
  );

  const empresa = esEmpresa(d, oficial);

  /** «Ya existe → abrirla»: el mismo modal pasa a editar a esa persona. */
  const abrirExistente = useCallback(
    (id: string) => {
      const p = personasExistentes.find((x) => x.id === id);
      if (!p) return;
      setActual(p);
      setD(datosDe(p));
      setOficial((o) => (o && normalizarNumero(p.documento ?? "") === o.numero ? o : null));
      setFoto(null);
      setQuitarFoto(false);
      setErr(null);
    },
    [personasExistentes],
  );

  const guardar = async (conAdelanto: boolean) => {
    setErr(null);
    const bloqueo = errorAntesDeGuardar(d, hoy, empresa);
    if (bloqueo) {
      setErr(bloqueo);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        actual ? `/api/adelantos/beneficiarios/${encodeURIComponent(actual.id)}` : "/api/adelantos/beneficiarios",
        {
          method: actual ? "PATCH" : "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(cuerpoDe(d, oficial)),
        },
      );
      if (!res.ok) {
        const j = await leerJson<RespuestaError>(res);
        const detalle = j?.issues?.length ? `: ${j.issues.join(" · ")}` : "";
        setErr(
          j?.error ? `${j.error}${detalle}` : actual ? "No se pudo guardar los cambios." : "No se pudo crear la persona.",
        );
        return;
      }
      const id = actual?.id ?? (await leerJson<{ id?: string }>(res))?.id ?? null;

      /* La persona ya quedó: la foto falla aparte y se avisa, no se deshace nada. */
      let fallaFoto: string | null = null;
      if (id && foto) fallaFoto = await subirFotoDocumento(id, foto);
      else if (id && quitarFoto && actual?.tieneFotoDocumento) fallaFoto = await borrarFotoDocumento(id);
      if (fallaFoto) {
        toast.warning(
          `${actual ? "Cambios guardados" : "Persona creada"}, pero la foto del DNI no se ${foto ? "subió" : "quitó"} (${fallaFoto}). Puedes hacerlo después desde Editar.`,
          { duration: 10_000 },
        );
      }
      /* Antes de `onCreated`: la recarga de la lista es la que atiende el pedido. */
      if (conAdelanto && id) pedirAdelantoPara(id);
      onCreated();
    } catch (e) {
      logger.error("[adelantos] no se pudo guardar la persona", { error: String(e) });
      setErr("No se pudo guardar. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return {
    actual,
    editando,
    d,
    set,
    oficial,
    lookup,
    duplicado,
    empresa,
    hoy,
    foto,
    setFoto,
    quitarFoto,
    setQuitarFoto,
    saving,
    err,
    setErr,
    abrirExistente,
    guardar,
  };
}

export type PersonaForm = ReturnType<typeof usePersonaForm>;
