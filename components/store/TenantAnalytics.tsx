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
const TIKTOK_RE = /^[A-Z0-9]{10,30}$/i;

export default function TenantAnalytics({
  gaId,
  pixelId,
  tiktokPixelId,
}: {
  gaId?: string | null;
  pixelId?: string | null;
  tiktokPixelId?: string | null;
}) {
  const ga = typeof gaId === "string" && GA_RE.test(gaId.trim()) ? gaId.trim() : null;
  const pixel = typeof pixelId === "string" && PIXEL_RE.test(pixelId.trim()) ? pixelId.trim() : null;
  const tiktok =
    typeof tiktokPixelId === "string" && TIKTOK_RE.test(tiktokPixelId.trim())
      ? tiktokPixelId.trim()
      : null;

  if (!ga && !pixel && !tiktok) return null;

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

      {/* TikTok Pixel del comerciante (Canales de venta) — lazyOnload. */}
      {tiktok && (
        <Script id="tenant-tiktok-pixel" strategy="lazyOnload">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
              ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
              ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
              for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
              ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
              ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var s=d.createElement("script");s.type="text/javascript",s.async=!0,s.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(s,a)};
              ttq.load('${tiktok}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}
    </>
  );
}
