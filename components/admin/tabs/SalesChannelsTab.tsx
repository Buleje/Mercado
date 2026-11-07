"use client";

import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, Facebook, MoreHorizontal, RefreshCw, Video } from "@buleje/design-system/icons";
import { ErrorAlert, LoadingState, SectionTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import Plegable from "@/components/admin/shared/Plegable";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { BarraSinGuardar } from "@/components/admin/store-customizer/BarraSinGuardar";
import { cambiosDe, cuantos } from "@/components/admin/store-customizer/cambios";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { EMPTY_SALES_CHANNELS, type SalesChannelsConfig } from "@/lib/types/sales-channels";
import { Field, FilaCanal, ListaDeFunciones } from "@/components/admin/redes-medicion/FilaCanal";
import { COMBINED, GA_FEATURES, META_FEATURES, TIKTOK_FEATURES } from "@/components/admin/redes-medicion/funciones";
import { DetalleVisitas, resumenDeVisitas, useIndicadoresVisitas, useVisitasTienda } from "./SalesChannelsAnalyticsPanel";

/**
 * Tienda online › Redes y medición, en el patrón del panel (11-10):
 * - Cabecera en una fila: título + ⓘ · Indicadores plegables de las visitas
 *   (antes: 4 tarjetas fijas con minigráficos) · «⋯».
 * - Los tres píxeles en UNA tarjeta, una fila por red con su estado. Antes:
 *   tres tarjetas de 160 px y el mismo estado dos veces (chips arriba y
 *   píldora en cada tarjeta).
 * - Lo opcional (CAPI, catálogos) y el detalle de las visitas, plegados.
 * - Guardar: la barra pegada abajo aparece sólo si cambiaste algo (antes
 *   «Guardar canales» siempre a la vista).
 */

/** Los seis campos que se guardan, planos: para contar qué cambió. */
function plano(c: SalesChannelsConfig, analyticsId: string) {
  return {
    metaPixel: c.meta.pixelId,
    capi: c.meta.capiToken,
    metaCatalogo: c.meta.catalogId,
    tiktokPixel: c.tiktok.pixelId,
    tiktokCatalogo: c.tiktok.catalogId,
    ga4: analyticsId,
  };
}

export default function SalesChannelsTab() {
  const [config, setConfig] = useState<SalesChannelsConfig>(EMPTY_SALES_CHANNELS);
  const [analyticsId, setAnalyticsId] = useState("");
  const [guardado, setGuardado] = useState({ config: EMPTY_SALES_CHANNELS, analyticsId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visitas = useVisitasTienda();
  const kpis = useIndicadoresVisitas(visitas);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/sales-channels", { headers: csrfHeaders({}) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { channels?: SalesChannelsConfig; analyticsId?: string } | null) => {
        if (!active || !d) return;
        const c = d.channels ?? EMPTY_SALES_CHANNELS;
        const ga = typeof d.analyticsId === "string" ? d.analyticsId : "";
        setConfig(c);
        setAnalyticsId(ga);
        setGuardado({ config: c, analyticsId: ga });
      })
      .catch((err) => console.error("[sales-channels] load failed", err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sales-channels", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...config, analyticsId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { channels: SalesChannelsConfig; analyticsId?: string };
      const ga = typeof d.analyticsId === "string" ? d.analyticsId : analyticsId;
      setConfig(d.channels);
      setAnalyticsId(ga);
      setGuardado({ config: d.channels, analyticsId: ga });
    } catch (err) {
      console.error("[sales-channels] save failed", err);
      setError("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LoadingState message={null} className="py-10" />
    );
  }

  const metaConnected = config.meta.pixelId.trim().length > 0;
  const tiktokConnected = config.tiktok.pixelId.trim().length > 0;
  const gaConnected = analyticsId.trim().length > 0;
  const nCambios = cuantos(cambiosDe(plano(guardado.config, guardado.analyticsId), plano(config, analyticsId)));
  const opcionales = [config.meta.capiToken, config.meta.catalogId, config.tiktok.catalogId].filter((v) => v.trim()).length;
  const acciones: MenuAccion[] = [
    { id: "actualizar", label: "Actualizar visitas", icon: RefreshCw, onSelect: () => visitas.cargar() },
    {
      id: "ga4",
      label: "Abrir Google Analytics",
      hint: "Ahí sacas tu ID de medición (G-…)",
      icon: ExternalLink,
      onSelect: () => window.open("https://analytics.google.com/analytics/web/#/p/admin/streams", "_blank", "noopener,noreferrer"),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Sin cabecera de módulo: el título de la pantalla es el de Tienda
          online. La vista lleva SU título (SectionTitle, como Apariencia y
          Páginas) en la fila de sus Indicadores. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Redes y medición</SectionTitle>
          <InfoTip
            title="Canales de venta"
            ancho="w-96"
            what={<span>Conecta Meta, TikTok y Google Analytics con tus IDs: los eventos de compra se activan solos en tu tienda.</span>}
            body={<ListaDeFunciones features={COMBINED} />}
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Actualizar visitas y abrir Google Analytics" />
        </div>
      </div>

      {kpis.panel}

      {error && <ErrorAlert description={error} />}

      {/* Los tres píxeles en una tarjeta: una fila por red, su estado una vez. */}
      <section className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" aria-label="Tus píxeles y la medición">
        <FilaCanal Brand={Facebook} name="Meta" detalle="Facebook e Instagram" connected={metaConnected} accent="var(--data-info-500)" features={META_FEATURES}>
          <Field
            label="Meta Pixel ID"
            placeholder="Ej. 123456789012345"
            value={config.meta.pixelId}
            onChange={(v) => setConfig((c) => ({ ...c, meta: { ...c.meta, pixelId: v } }))}
          />
        </FilaCanal>
        {/* R2 (10-10): el Pixel lo editaba también Mi Tienda (Básico) en
            Avanzado; CAPI, catálogo y TikTok eran sólo de Canales (Pro). */}
        <PermisoDe origen="canales">
          <FilaCanal Brand={Video} name="TikTok" detalle="TikTok Shop" connected={tiktokConnected} accent="var(--text-primary)" features={TIKTOK_FEATURES}>
            <Field
              label="TikTok Pixel ID"
              placeholder="Ej. C1A2B3C4D5E6F7G8"
              value={config.tiktok.pixelId}
              onChange={(v) => setConfig((c) => ({ ...c, tiktok: { ...c.tiktok, pixelId: v } }))}
            />
          </FilaCanal>
        </PermisoDe>
        {/* Google Analytics 4 — mismo storeTheme.analyticsId; Apariencia › Avanzado sólo lo muestra. */}
        <FilaCanal
          Brand={BarChart3}
          name="Google Analytics 4"
          connected={gaConnected}
          accent="var(--data-warning-500)"
          features={GA_FEATURES}
          nota="Se edita sólo aquí. Apariencia › Avanzado muestra el mismo ID, sin editarlo."
        >
          <Field label="ID de medición (GA4)" placeholder="G-XXXXXXXXXX" value={analyticsId} onChange={setAnalyticsId} />
        </FilaCanal>
      </section>

      <PermisoDe origen="canales">
        <Plegable
          clave="tienda-redes:opcional"
          titulo="API de Conversiones y catálogos"
          resumen={opcionales ? `${opcionales} de 3 configurados` : "Opcional · sin configurar"}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Token CAPI de Meta"
              placeholder="Token de la API de Conversiones"
              value={config.meta.capiToken}
              onChange={(v) => setConfig((c) => ({ ...c, meta: { ...c.meta, capiToken: v } }))}
            />
            <Field
              label="ID de catálogo de Meta"
              placeholder="Para anuncios dinámicos / Advantage+"
              value={config.meta.catalogId}
              onChange={(v) => setConfig((c) => ({ ...c, meta: { ...c.meta, catalogId: v } }))}
            />
            <Field
              label="ID de catálogo de TikTok Shop"
              placeholder="Catálogo de TikTok Shop"
              value={config.tiktok.catalogId}
              onChange={(v) => setConfig((c) => ({ ...c, tiktok: { ...c.tiktok, catalogId: v } }))}
            />
          </div>
        </Plegable>
      </PermisoDe>

      <Plegable clave="tienda-redes:visitas" titulo="De dónde llegan tus visitas" resumen={resumenDeVisitas(visitas)}>
        <DetalleVisitas {...visitas} />
      </Plegable>

      <BarraSinGuardar
        texto={nCambios > 0 ? (nCambios === 1 ? "1 cambio sin guardar" : `${nCambios} cambios sin guardar`) : null}
        guardando={saving}
        error={error}
        onGuardar={save}
        onDescartar={() => {
          setConfig(guardado.config);
          setAnalyticsId(guardado.analyticsId);
          setError(null);
        }}
      />
    </div>
  );
}
