# ADR-486 — QR corto: `/v/…` con el código del negocio

- **Estado:** aceptado (2026-10-08).
- **Pedido por:** Brandon (08-10), opción elegida «QR corto con tu dominio»: el QR de cada troza y guía sale denso y cuesta leerlo impreso chico.
- **Extiende:** el QR único (commit `6df99c62c`, contrato K4 (d)) y la verificación por negocio activo (`fe093f765`). No toca el proxy ni el schema.

## Contexto (medido 08-10)

Blas no tiene dominio propio y el sistema no tiene subdominios, así que sus QR iban por `…/t/inversiones-agroforestales-blas-sociedad-anonima/verificar/…`. Con `https://www.buleje.pe` de base (supuesta: la de producción no está en el repo), medido con `qrcode` 1.5:

| QR | Hoy | Corto | Con dominio propio |
|---|---|---|---|
| Troza (etiqueta, corrección L) | 122 letras · v6 · 41×41 | 65 · v4 · 33×33 | 60 · v4 · 33×33 |
| Guía (hoja de despacho, M) | 113 · v7 · 45×45 | 57 · v4 · 33×33 | 52 · v4 · 33×33 |
| Despacho CTP (GTF, M) | 117 · v7 · 45×45 | 57 · v4 · 33×33 | 52 · v4 · 33×33 |
| Árbol por código (pasaporte, M) | 91 · v6 · 41×41 | 40 · v3 · 29×29 | 35 · v3 · 29×29 |

Al mismo ancho impreso, cada cuadradito del QR sale entre 24 % (41→33) y 36 % (45→33) más grande.

## Decisión

1. **Una letra por documento** en `/v/…` (`RUTAS_CORTAS`, `lib/tenant-url-publica.ts`): `t` troza por línea (`?c=<código>` sigue aparte, para la pistola sin internet), `c` troza o árbol por código, `g` guía, `d` despacho, `l` lote, `k` cacao. **Nunca se cambia ni se reusa una letra**: está impresa.
2. **Dos formas**:
   - el host ya dice el negocio (dominio propio, subdominio, el negocio principal) → `https://<host>/v/<letra>/<id>`;
   - si no → `https://<principal>/v/<código>/<letra>/<id>`, con un **código de 5 letras** del negocio.
3. **Código sin escribir en la base**: `codigoCortoNegocio(tenantId)` = FNV-1a de 32 bits del id, módulo 36⁵, en base 36 (Blas = `il3g4`). Determinístico; **nunca se cambia la fórmula**. Se resuelve con un mapa en memoria de TODOS los negocios (5 min de caché; un código que no está relee la base a lo sumo una vez por minuto, para un negocio recién creado).
4. **Choques**: si dos negocios caen en el mismo código, es del **más viejo, activo o no**; el más nuevo no recibe código y sus QR siguen largos. Así el dueño de un código no cambia cuando se crea o se da de baja otro negocio, y un QR impreso nunca pasa a abrir otro negocio. Hoy: 14 negocios, 14 códigos distintos.
   - **Límite conocido (revisión 08-10):** si un negocio se BORRA de la base (no de baja: `superadmin/tenants/[slug]/delete` y `cron/cleanup-demos`), su código queda libre y lo toma el siguiente que choque con él. Sus QR por id siguen en «no encontrado» (los ids son únicos en toda la base), pero los que van por código de troza (`c`) o de cacao (`k`) podrían abrir el del otro negocio si coincide el código. Probabilidad: con N negocios en toda la historia, ≈ N² ÷ 120 millones (1 000 negocios ≈ 0,8 %), y además el borrado tiene que haber impreso QR. Si llega a importar: tabla de códigos retirados que `duenosDeCodigosCortos` reciba junto a los vivos.
5. **La base la sigue decidiendo el servidor** (`GET /api/admin/tenant/url-publica`): ahora devuelve la base CORTA (`…/v` o `…/v/<código>`). Los armadores de cada QR (`urlVerificarTroza`, `urlVerificarGuiaLoth`, `urlVerificarDespacho`, `urlVerificarLote`, `urlVerificarCacao`) reconocen la base corta mirando su ruta anclada (`^/v(/<código>)?$`; `…/t/v`, un negocio con slug «v», es larga) y usan la letra; con una base larga arman la ruta de siempre. Ningún llamador cambió: etiquetas del Libro TH, pasaporte, hoja de despacho, resumen interno de la GTF, GTF y certificado del CTP, expediente EUDR, certificado de lote y cacao.
6. **`/v/…` muestra la página, no redirige** (`app/v/[codigo]/[...resto]/page.tsx`): dibuja las mismas páginas de `/verificar/**` y `/verificar-cacao/**` fijándoles el negocio del código en un almacén de React `cache` que vive un solo pedido (`app/verificar/_componentes/tenant-verificacion.ts`). Sin salto extra en el celular, sin cookie de negocio y sin dejar ver el slug.
7. **El escáner** (`leerEscaneo`) entiende las dos formas: traduce `/v/…` a la ruta larga (`rutaLargaDeCorta`) antes de leer.

## Seguridad

- Código desconocido, mal formado o de un negocio dado de baja → el mismo «no encontrado» que un id inventado. Los códigos no son secretos (van impresos en cada etiqueta): un código existente tarda algo más en responder que uno inventado (consulta la base), igual que `/t/<slug>` hoy, así que midiendo tiempos se podría saber cuáles existen. Eso sólo dice que hay un negocio, no publica nada que `/verificar` no publique.
- Una forma que no es de QR (`/v/<código>`, letra desconocida, tramos de más) → página de «no encontrado» con **estado 200**: `notFound()` corre dentro del `<Suspense>` y con `cacheComponents` el estado ya salió (404 «blando», `noindex`). Igual que las demás páginas de `/verificar/**`.
- **El código sólo vale en el host principal.** Con dominio propio, subdominio o `/t/<slug>` de OTRO negocio, `/v/<código>/…` dice «no encontrado» (`negocioDeCodigoEnHost`): `/t/<slug de A>/v/<código de B>/…` no muestra el certificado de B bajo la dirección de A. El proxy marca `/t/<slug>` con `x-tenant-store-route`; si un cliente la manda a mano sólo se cierra la puerta.
- Nunca otro negocio: el código se resuelve a un solo dueño fijo (regla 4) y cada consulta sigue filtrando por ese `tenantId`.
- En el host principal, `/v/<código>/…` no publica nada que `/t/<slug>/verificar/…` no publique hoy.
- El proxy deja pasar `/v/…` sin sesión (no es `/admin`, `/api` ni `/superadmin`): verificado con curl sin cookies.

## Lo que no cambia

- Las etiquetas ya impresas (`/verificar/**`, `/t/<slug>/verificar/**`) siguen abriendo igual.
- Al comprar dominio: se configura como dominio propio y la base pasa sola a `https://<dominio>/v`.

## Descartado

- **Redirigir** `/v/…` a `/t/<slug>/verificar/…`: un salto más, deja la cookie del negocio en el celular y el `Location` dejaba enumerar los slugs probando códigos.
- **Columna con el código**: pedía escribir en la base de Blas y una migración; el hash del id alcanza.
- **Todo en mayúsculas** (modo alfanumérico del QR: 5,5 bits por letra en vez de 8): bajaría la troza de v4 a v3, pero las rutas e ids de Next distinguen mayúsculas y el `?c=` no entra en ese alfabeto. Queda como idea.
