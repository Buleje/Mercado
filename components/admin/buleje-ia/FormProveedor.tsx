"use client";

/**
 * Agregar un modelo: pegar la clave → Probar (el servidor lista los modelos
 * que el proveedor tiene HOY) → elegir → Guardar. La clave nunca vuelve del
 * servidor: después sólo se ven sus últimas letras.
 */
import { useMemo, useState } from "react";
import { Check, ExternalLink, Loader2 } from "@buleje/design-system/icons";
import { InfoAlert } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Button } from "@/components/ui-system/Button";
import type { ProveedorCatalogo, ResultadoPrueba } from "@/lib/ia-proveedores/tipos";
import type { BulejeIaModelos } from "@/hooks/use-buleje-ia-modelos";
import { CAMPO_IA, ETIQUETA_IA, TEXTO_ERROR_IA } from "./campos";

export function FormProveedor({
  proveedor: cat,
  modelos,
  esElPrimero,
  onCerrar,
}: {
  proveedor: ProveedorCatalogo;
  modelos: BulejeIaModelos;
  esElPrimero: boolean;
  onCerrar: () => void;
}) {
  const [clave, setClave] = useState("");
  const [baseUrl, setBaseUrl] = useState(cat.baseUrl ?? "");
  const [nombre, setNombre] = useState(cat.nombre);
  const [prueba, setPrueba] = useState<ResultadoPrueba | null>(null);
  const [probando, setProbando] = useState(false);
  const [modelo, setModelo] = useState(cat.modelosSugeridos[0]?.id ?? "");
  const [modeloVision, setModeloVision] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const personalizado = cat.id === "personalizado";

  /** Lista para elegir: la REAL del proveedor si ya se probó; si no, las sugeridas. */
  const opciones = useMemo(() => {
    const visionSugerida = new Map(cat.modelosSugeridos.map((m) => [m.id, m.vision]));
    if (prueba?.ok && prueba.modelos.length) {
      return prueba.modelos.map((m) => ({ id: m.id, vision: m.vision ?? visionSugerida.get(m.id) ?? false }));
    }
    return cat.modelosSugeridos.map((m) => ({ id: m.id, vision: m.vision }));
  }, [prueba, cat]);

  const probar = async () => {
    if (!clave.trim() && !personalizado) return setError("Pega primero la clave.");
    setError(null);
    setProbando(true);
    const r = await modelos.probar({ proveedor: cat.id, clave: clave.trim() || undefined, baseUrl: personalizado ? baseUrl.trim() : undefined });
    setProbando(false);
    if (!r.ok) return setError(r.error);
    setPrueba(r.data);
    if (r.data.ok && r.data.modelos.length && !r.data.modelos.some((m) => m.id === modelo)) {
      const sugerido = cat.modelosSugeridos.find((s) => r.data.modelos.some((m) => m.id === s.id));
      setModelo(sugerido?.id ?? r.data.modelos[0].id);
    }
  };

  const guardar = async () => {
    if (!modelo.trim()) return setError("Elige un modelo.");
    setError(null);
    setGuardando(true);
    const r = await modelos.guardar({
      proveedor: cat.id,
      nombre: nombre.trim() || cat.nombre,
      modelo: modelo.trim(),
      modeloVision: modeloVision || undefined,
      baseUrl: personalizado ? baseUrl.trim() : undefined,
      clave: clave.trim(),
      principal: esElPrimero || undefined,
    });
    setGuardando(false);
    if (r.ok) onCerrar();
    else setError(r.error);
  };

  const elegidoLeeFotos = opciones.find((o) => o.id === modelo)?.vision ?? false;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`Conectar ${cat.nombre}`}
      description={cat.empresa}
      footer={
        <>
          <Button variant="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={guardando || !prueba?.ok}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
          </Button>
        </>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <p className="text-sm text-[var(--text-secondary)]">{cat.ayuda}</p>
        {cat.urlClave && (
          <a href={cat.urlClave} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-dark)] underline dark:text-[var(--accent)]">
            Sacar mi clave de {cat.empresa} <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
        {personalizado && (
          <div>
            <label htmlFor="ia-base-url" className={ETIQUETA_IA}>
              Dirección del servidor
            </label>
            <input id="ia-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://mi-servidor.com/v1" inputMode="url" className={CAMPO_IA} />
          </div>
        )}
        <div>
          <label htmlFor="ia-clave" className={ETIQUETA_IA}>
            Clave {personalizado && "(si tu servidor la pide)"}
          </label>
          <div className="flex gap-2">
            <input
              id="ia-clave"
              type="password"
              autoComplete="off"
              value={clave}
              onChange={(e) => {
                setClave(e.target.value);
                setPrueba(null);
              }}
              placeholder="Pega aquí tu clave"
              className={CAMPO_IA}
            />
            <Button variant="secondary" onClick={probar} disabled={probando}>
              {probando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Probar
            </Button>
          </div>
        </div>
        {prueba && (
          <p role="status" className={prueba.ok ? "flex items-center gap-1.5 text-sm text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : TEXTO_ERROR_IA}>
            {prueba.ok && <Check className="h-4 w-4" aria-hidden />} {prueba.mensaje}
          </p>
        )}
        {prueba?.ok && (
          <>
            <div>
              <label htmlFor="ia-modelo" className={ETIQUETA_IA}>
                Modelo que contesta
              </label>
              <select id="ia-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} className={CAMPO_IA}>
                {opciones.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id}
                    {o.vision ? " · lee fotos" : ""}
                  </option>
                ))}
              </select>
            </div>
            {!elegidoLeeFotos && (
              <div>
                <label htmlFor="ia-modelo-vision" className={ETIQUETA_IA}>
                  Modelo para leer fotos (opcional)
                </label>
                <select id="ia-modelo-vision" value={modeloVision} onChange={(e) => setModeloVision(e.target.value)} className={CAMPO_IA}>
                  <option value="">Ninguno: no leer fotos</option>
                  {opciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id}
                      {o.vision ? " · lee fotos" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="ia-nombre" className={ETIQUETA_IA}>
                Nombre para reconocerlo
              </label>
              <input id="ia-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} className={CAMPO_IA} />
            </div>
            {esElPrimero && <InfoAlert description="Es tu primer modelo: desde ahora contesta él en vez de la IA de la plataforma." />}
          </>
        )}
        {error && (
          <p role="alert" className={TEXTO_ERROR_IA}>
            {error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
