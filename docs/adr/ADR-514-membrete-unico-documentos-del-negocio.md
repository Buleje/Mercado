# ADR-514 — Membrete único de los documentos del negocio

- **Estado:** aceptado (2026-10-23). Sin schema.
- **Pedido por:** Brandon (23-10): «cualquier documento de la empresa en cualquier pestaña saldrá con el logo y nombre en el título, algo profesional, de mi admin que se ponga».
- **Relacionados:** ADR-494 (hoja GTF 2024), ADR-495 (talonario de la matricial), ADR-308 (trámites forestales), ADR-137 (alineación SERFOR del libro CTP).

## Contexto

El inventario del 23-10 midió **5 fuentes de logo** que no se hablaban: `Settings.logoUrl`
(Ajustes › Datos del negocio), `Tenant.name/logoUrl` (lo edita el superadmin), la ficha CTP
(`ctp-ficha:<id>` en PlatformSetting, con su PNG propio), el logo de trámites en
`localStorage` (`buleje-tramite-logo-<slug>`) y un logo por documento en el Anexo 04. Unos
~15 documentos imprimían «Buleje» (la plataforma) en vez del negocio. El logo de Blas en
Ajustes es WebP (41.906 B) y ni jsPDF ni pdf-lib leen WebP; el canvas del navegador no lee
una imagen de otro dominio sin CORS. Medido en la base: Blas tiene nombre comercial `""`,
razón social «INVERSIONES AGROFORESTALES BLAS SOCIEDAD ANONIMA CERRADA», RUC y la dirección
sólo en la tienda; `main` no tiene nada en Ajustes y su nombre registrado es «Buleje».

## Decisión

1. **Manda Ajustes › Datos del negocio** (`Settings`): nombre comercial, razón social, RUC,
   dirección, teléfono/WhatsApp, correo, pie y logo. `Tenant.name/logoUrl` es **sólo
   respaldo** de lo que falte.
2. **Título del documento** (`Membrete.nombre`) = nombre comercial › razón social (o la
   denominación de SUNAT) › nombre registrado. **Nunca un nombre por defecto de la
   plataforma**: sin dato, `null` y el documento decide (sale sin título de marca).
3. **Una sola lectura**: `MembreteDB.del(tenantId)` (cacheada 5 min bajo `settings:<id>:membrete`,
   así que guardar Ajustes la olvida sola; lo que escribe en `Tenant` llama a
   `MembreteDB.olvidar`). En el cliente: `useMembrete()` / `leerMembrete()` y
   `GET /api/admin/membrete`. La forma de `Membrete` sólo crece: se agregaron
   `nombreComercial`, `whatsapp`, `fuenteLogo` (`ajustes|registro`) y `logoPngUrl`.
4. **El logo se sirve en PNG desde el propio panel**: `MembreteDB.logoPng(tenantId)` lo baja,
   lo pasa a PNG con `sharp` (lado mayor ≤ 600 px) y lo cachea por negocio + huella de la URL;
   `GET /api/admin/membrete/logo` lo devuelve con `Cache-Control: private` y ETag. Así jsPDF,
   pdf-lib, canvas y html-to-image lo cargan sin CORS y en un formato que leen.
   Sólo se baja de lugares propios: data URL de imagen, `public/`, el dominio propio o el
   Supabase del proyecto con **lista fija de buckets**: `media` (público, donde sube «Subir
   logo») y `documents` sólo bajo `tenants/<id-del-negocio>/` (se baja con la llave de
   servicio). Nunca `adelantos-privado`, `forestal-privado` ni otro bucket. La ruta se decodifica
   una vez y se rechaza si queda `%`, `\`, `?`, `#`, un segmento vacío, `.` o `..`, o si no es
   canónica; el prefijo se vuelve a mirar sobre `new URL(...).pathname`, tal como lo verá el
   fetch (revisión de seguridad 23-10: `%252e%252e` llegaba al Drive de otro negocio).
   Formatos: PNG, JPEG, WebP, GIF y AVIF por los primeros bytes, antes de sharp (SVG, TIFF y
   HEIC quedan fuera); tope 5 MB, 6 s y 16 millones de píxeles.
   `PUT /api/settings` valida `logoUrl` al guardar con la misma regla (Zod, ≤2048 letras):
   lo que no pase es un 400 con mensaje claro.
5. **La ficha CTP queda para los papeles SERFOR**: su logo vale sólo si se cargó a propósito
   ahí; si no, el de Ajustes.
6. **Se retira el logo de trámites en `localStorage`** (siguiente carril): un logo por
   navegador no es el membrete del negocio.
7. **Fuera de este membrete** (tienen formato oficial o no son del negocio):
   la GTF A4 (logo sólo en el bloque del emisor, por la ficha), el talonario de la matricial
   (ADR-495), el libro LO-TH y los archivos SERFOR (sólo el pie «Sistema Buleje» puede
   cambiar), las plantillas de importación, etiquetas y marcadores, y los documentos de la
   plataforma (los que emite Buleje como SaaS).

## Alternativas descartadas

- **Que mande la ficha CTP**: es del módulo forestal y la mayoría de negocios no la tiene; la
  bodega y Musa quedarían sin membrete y Blas tendría dos lugares donde cambiar el logo.
- **Modelo nuevo en el schema** (`Membrete` con sus columnas): todos los datos ya existen en
  `Settings`; una tabla más es una migración en la base compartida (= producción) y una
  tercera copia del nombre para desincronizar.
- **Convertir el logo en el navegador** (canvas): falla con CORS en el bucket y cada
  documento repetía la conversión; en el servidor se hace una vez y se cachea.

## Consecuencias

- Los ~15 documentos que decían «Buleje» se adoptan uno por uno en los carriles siguientes
  (`useMembrete` + `logoPngUrl`); `imprimir-guia.ts` ya usa la razón social del membrete.
- En `main` el título será «Buleje» mientras Ajustes esté vacío: es su nombre registrado, no
  un valor por defecto. Basta escribir el nombre comercial en Ajustes.
- Blas sale con su razón social completa como título hasta que escriba un nombre comercial.
- El PNG de Blas pesa ~131 KB (395×600): entra en cada PDF que lo usa.
