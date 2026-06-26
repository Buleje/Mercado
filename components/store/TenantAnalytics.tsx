import Script from "next/script";

/**
 * TenantAnalytics — GA4 + Meta Pixel POR TENANT (Brandon 2026-06-26).
 *
 * El dueño pega su `G-XXXX` (Google Analytics 4) y/o su Pixel ID de Meta en el
 * Modo Creativo (Avanzado). Acá los inyectamos en SU tienda pública `/t/<slug>`.
 * Es distinto del Analytics de plataforma (`components/Analytics.tsx`, por ENV):
 * esto mide la tienda del comerciante, no Buleje.
 *
 * SEGURIDAD: los IDs se interpolan dentro de un `<Script>` inline → un tenant
 * malicioso podría intentar romper el string e inyectar JS. Por eso validamos
 * con regex ESTRICTO (solo el formato real del ID) y NO inyectamos si no matchea.
 * Nunca correr en `?preview=true` (no contaminar las métricas con el dueño editando).
 */

const GA_RE = /^G-[A-Z0-9]{4,20}$/i;
const PIXEL_RE = /^\d{6,20}$/;

export default function TenantAnalytics({
  gaId,
  pixelId,
}: {
  gaId?: string | null;
  pixelId?: string | null;
}) {
  const ga = typeof gaId === "string" && GA_RE.test(gaId.trim()) ? gaId.trim() : null;
  const pixel = typeof pixelId === "string" && PIXEL_RE.test(pixelId.trim()) ? pixelId.trim() : null;

  if (!ga && !pixel) return null;

  return (
    <>
      {/* Google Analytics 4 del comerciante */}
      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="tenant-ga4" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga}', { transport_type: 'beacon' });
            `}
          </Script>
        </>
      )}

      {/* Meta (Facebook) Pixel del comerciante — lazyOnload: fbevents pesa ~90KB */}
      {pixel && (
        <>
          <Script id="tenant-meta-pixel" strategy="lazyOnload">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${pixel}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element -- pixel tracking 1x1 */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${pixel}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}
    </>
  );
}
