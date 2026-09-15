# ADR-378 — El tenant sale de la sesión, nunca de una constante

- **Fecha:** 2026-08-12
- **Estado:** Aceptado
- **Área:** Multi-tenant · `app/api/**`, `lib/db/**`

## Contexto

Un reporte de QA sobre el módulo Compras decía que el botón «Marcar enviada» de
Devoluciones no hacía nada: el estado no cambiaba ni tras refrescar la lista.
Parecía un problema de UI. No lo era.

`app/api/supplier-returns/route.ts` tenía `const TENANT = "main"` y lo usaba en
GET y POST en lugar del tenant de la sesión. El `PATCH` de `[id]/route.ts` sí
filtraba por `auth.tenantId`. Esa asimetría producía tres efectos encadenados:

| Acción | Qué pasaba de verdad |
|---|---|
| Crear devolución | Se guardaba con `tenantId: "main"` — datos de una empresa dentro de otra |
| Ver la lista | Mostraba las de "main", así que parecía haber funcionado |
| «Marcar enviada» | El PATCH no encontraba la fila y devolvía **404** |

El 404 lo tragaba el cliente en silencio, así que el síntoma visible era un
botón muerto y la causa real —una fuga de datos entre empresas— quedaba
invisible.

**La prueba fue de datos, no de código:** el proveedor "Proveedor QA Test"
existe bajo el tenant forestal (`cmpxiv6p4…`) mientras su devolución estaba
guardada bajo `"main"`. Un `SELECT` cruzando ambos `tenantId` lo mostró en un
turno; leer el componente no lo habría mostrado nunca.

Barriendo el mismo patrón apareció un caso peor: `/api/presupuesto` (el «Poner
techo» de Historial de Gastos) tenía `const TENANT_ID = "main"` **y además ni
GET ni POST llamaban a `requireAdmin`**. Sin ninguna cookie, `GET
/api/presupuesto` devolvía 200 con el gasto del mes por categoría, y el POST
dejaba sobrescribir el presupuesto a cualquiera.

También `getSupplierPhone` buscaba el proveedor sin `tenantId`: un id ajeno
devolvía su teléfono y la notificación de devolución se le mandaba por WhatsApp
a un proveedor de otra empresa.

## Decisión

**1. El `tenantId` de una operación de negocio sale siempre de la sesión
(`auth.tenantId`), nunca de una constante del módulo.** Ya era la regla #3 del
proyecto; este ADR la vuelve verificable.

**2. La constante `"main"` sólo es legítima cuando el dato es de la
plataforma, no de una empresa.** Ejemplos válidos que el barrido confirmó:
crons de plataforma, `/api/contact`, avisos de marketplace al admin de Buleje.
El criterio es la pregunta *«¿de quién es este dato?»*, no la comodidad.

**3. Todo endpoint que devuelva o escriba datos de una empresa exige un
guard**, aunque el tenant ya esté bien resuelto. Tenant correcto sin
autenticación sigue siendo una filtración.

**4. Cuando una lectura y una escritura del mismo recurso resuelven el tenant
de forma distinta, es un bug aunque los tests pasen.** La asimetría entre GET y
PATCH fue exactamente lo que convirtió una fuga en un "botón que no anda".

## Consecuencias

- `/api/supplier-returns` (GET/POST), `/api/presupuesto` (GET/POST) y
  `getSupplierPhone` usan el tenant de la sesión; presupuesto además exige
  `requireAdmin` — verificado: 401 anónimo, 200 con sesión.
- Regresión permanente en `__tests__/supplier-returns-tenant.test.ts`, que
  afirma que el DB class recibe el tenant de la sesión y **nunca** `"main"`.
  Verificado que falla con el código anterior.
- Los gates estáticos no cubren esto: `tsc`, `eslint` y los 1901 tests del
  repo pasaban en verde con la fuga viva. El detector es el barrido + la
  llamada anónima real.

## Cómo se busca el patrón

```bash
grep -rn 'const TENANT = "main"\|const TENANT_ID = "main"\|tenantId: "main"' \
  --include="*.ts" app/api lib/db
```

Para los endpoints sin guard, buscar rutas cuyo fuente no mencione ninguna
señal de control de acceso (`require*(`, `try(Admin|Auth)`, `get*Session(`,
`verify*(Auth|Session|Token|Signature)`, gate por `NODE_ENV === "production"`)
y **confirmar con un `curl` sin cookies** antes de tocar nada: en el barrido de
2026-08-12, de 115 sospechosos iniciales sólo `/api/presupuesto` era real. El
resto eran catálogos públicos por diseño o guards que el patrón no matcheaba.

## Alternativas consideradas

- **Un middleware que inyecte el tenant en todas las rutas.** Ya existe la
  resolución en `proxy.ts`; el problema no era obtenerlo sino *usarlo*. Un
  default automático habría escondido el error en vez de romperlo.
- **Prohibir el literal `"main"` con una regla de ESLint.** Descartado por
  ahora: hay usos legítimos de plataforma y una regla ciega generaría
  supresiones, que es peor que el grep del barrido.

## Referencias

- Reporte de QA del módulo Compras, 2026-08-12
- Regla #3 de `CLAUDE.md` · `.claude/rules/db-classes.md`
- ADR-084 — trial-suspension-mode (paridad de escrituras bloqueadas por plan)
