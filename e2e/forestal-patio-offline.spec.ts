import { expect, test, type Page } from "@playwright/test";

/**
 * forestal-patio-offline.spec.ts
 *
 * El modo patio (`/admin/patio`) con y sin señal. Cubre lo que ningún test
 * unitario puede: que la cola, el caché y la pantalla se pongan de acuerdo.
 *
 * Lo verdaderamente frágil de este subsistema no son las funciones puras —esas
 * ya tienen sus tests— sino las tres promesas que las unen:
 *
 *   1. sin red, lo que se carga se ANOTA y NO se da por guardado en el libro;
 *   2. sin red, lo consultado sale del caché DICIENDO de cuándo es;
 *   3. un rechazo del libro (4xx) se MUESTRA, no se encola — si se encolara, el
 *      operario quedaría esperando algo que nunca va a entrar.
 *
 * Se simula la falta de señal abortando las requests con `route`, no con
 * `context.setOffline`: setOffline recarga la página y se pierde el estado que
 * se está probando. Además así se cubre el caso real de `navigator.onLine ===
 * true` con la red caída (wifi conectado sin salida), que es el que más pasa.
 *
 * Requiere: `npm run seed:forestal` (deja guías, trozas y corridas del tenant
 * main). Sin datos, los tests se saltean en vez de fallar en rojo por algo que
 * no es una regresión.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "qaadmin";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "Qa-admin-1234";
/** El forestal vive acá: los datos del seed son de este tenant. */
const TENANT = process.env.E2E_TENANT ?? "main";

const API_FORESTAL = "**/api/admin/forestal/**";

async function entrarAlPatio(page: Page): Promise<boolean> {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  // Los inputs son CONTROLADOS (`value={pw}`): llenarlos antes de que React
  // hidrate escribe en el DOM y la hidratación lo pisa con "". El síntoma es un
  // submit que se queda deshabilitado y un timeout que no dice por qué, así que
  // se espera a que el formulario esté vivo y se CONFIRMA que el valor pegó.
  const usuario = page.locator("#username");
  const clave = page.locator("#password");
  await clave.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {
    /* con polling abierto puede no llegar nunca; el toHaveValue es el gate real */
  });

  await usuario.fill(ADMIN_USER);
  await clave.fill(ADMIN_PASS);
  await expect(usuario).toHaveValue(ADMIN_USER, { timeout: 10_000 });
  await expect(clave).toHaveValue(ADMIN_PASS, { timeout: 10_000 });

  const entrar = page.getByRole("button", { name: /entrar al panel/i });
  await expect(entrar).toBeEnabled({ timeout: 10_000 });
  await entrar.click();

  // `qaadmin` existe en varias tiendas, así que el login contesta 200 con
  // `requiresTenantChoice` en vez de dejar entrar: sin este paso el helper
  // devolvía false y los cinco tests se SALTEABAN — peor que fallar, porque
  // simula cobertura que no existe.
  const elegirMain = page
    .locator("button")
    .filter({ has: page.getByText(TENANT, { exact: true }) })
    .first();
  // `isVisible()` NO espera —ignora el timeout y contesta al instante—, así que
  // devolvía false antes de que la elección se renderizara y nadie clickeaba.
  const hayEleccion = await elegirMain
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (hayEleccion) await elegirMain.click();

  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 25_000 }).catch(() => {
    /* el chequeo real es la URL de la línea siguiente */
  });
  if (page.url().includes("/login")) return false;

  // El wizard de onboarding tapa la pantalla entera si nunca se completó.
  await page.addInitScript(() => {
    try {
      const slug = localStorage.getItem("active-tenant-slug") ?? "main";
      localStorage.setItem(`onboarding-completed-${slug}`, "1");
    } catch {
      /* modo privado */
    }
  });
  await page.goto("/admin/patio", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Patio" })).toBeVisible({ timeout: 30_000 });
  return true;
}

/** Las anotaciones que esperan subir, leídas de IndexedDB. */
async function cola(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ section: string; metodo?: string; estado: string }[]>((resolve) => {
        const req = indexedDB.open("buleje-patio-ctp");
        req.onsuccess = () => {
          const tx = req.result.transaction("anotaciones", "readonly");
          const all = tx.objectStore("anotaciones").getAll();
          all.onsuccess = () => resolve(all.result ?? []);
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
  );
}

/** Elige la primera corrida y tilda una pieza. `false` = no hay con qué probar. */
async function tildarUnaPieza(page: Page): Promise<boolean> {
  // Las corridas llegan por fetch: contar sin esperar da 0 y el test se saltea
  // creyendo que no hay datos. Es la trampa de este spec — un skip miente más
  // que un fallo, así que cada `count()` va después de su `waitFor`.
  const corrida = page.locator("button").filter({ hasText: /#\d+ ·/ }).first();
  const hay = await corrida
    .waitFor({ state: "visible", timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  if (!hay) return false;
  await corrida.click();
  const piezas = page.locator("button[aria-pressed]");
  await piezas.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {
    /* si no aparece, el count() de abajo devuelve 0 y el test se saltea */
  });
  if ((await piezas.count()) === 0) return false;
  await piezas.first().click();
  return true;
}

test.describe("Modo patio · sin señal", () => {
  test("lo cargado sin red se anota y NO se declara guardado en el libro", async ({ page, context }) => {
    test.skip(!(await entrarAlPatio(page)), "Login admin falló");
    test.skip(!(await tildarUnaPieza(page)), "Sin corridas o piezas — correr `npm run seed:forestal`");

    // Cae la red justo al guardar, que es el caso del patio.
    await context.route("**/api/admin/forestal/trozas/patio", (r) =>
      r.request().method() === "POST" ? r.abort("internetdisconnected") : r.continue(),
    );
    await page.getByRole("button", { name: /Cargar \d+ pieza/ }).click();

    await expect(page.getByText(/anotada[s]? en el equipo/i)).toBeVisible({ timeout: 15_000 });
    // La promesa que importa: NO se afirma que entró al libro.
    await expect(page.getByText(/cargada[s]? a la corrida/i)).toHaveCount(0);

    const pendientes = await cola(page);
    expect(pendientes.filter((a) => a.section === "consumo" && a.estado === "pendiente")).not.toHaveLength(0);
  });

  test("la recepción se encola con PATCH, no con POST", async ({ page, context }) => {
    // Si el verbo no viajara, al sincronizar saldría un POST y el libro lo
    // rechazaría: la recepción quedaría "rechazada" sin que nadie sepa por qué.
    test.skip(!(await entrarAlPatio(page)), "Login admin falló");

    const guia = page.locator("button").filter({ hasText: /\d{3}-\d{7}/ }).first();
    const hayGuia = await guia
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hayGuia, "Sin guías — correr `npm run seed:forestal`");
    await guia.click();

    // `:visible` NO es opcional: el dual-render deja las cards Y la tabla en el
    // DOM, y `.first()` sin filtrar agarra la oculta y muere por timeout.
    const obs = page.locator('input[placeholder*="Rajadura"]:visible').first();
    const hayCampos = await obs
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hayCampos, "La guía no tiene trozas cargadas");
    await obs.fill(`e2e ${Date.now().toString().slice(-5)}`);

    await context.route("**/api/admin/forestal/trozas", (r) =>
      r.request().method() === "PATCH" ? r.abort("internetdisconnected") : r.continue(),
    );
    await page.getByRole("button", { name: /Guardar recepción/ }).click();

    await expect(page.getByText(/anotada en el equipo|Se sube al libro/i)).toBeVisible({ timeout: 15_000 });
    const anotadas = (await cola(page)).filter((a) => a.section === "recepcion");
    expect(anotadas).not.toHaveLength(0);
    expect(anotadas[0].metodo).toBe("PATCH");
  });

  test("lo consultado sale del caché y la pantalla dice de cuándo es", async ({ page, context }) => {
    test.skip(!(await entrarAlPatio(page)), "Login admin falló");

    // Una pasada CON señal para llenar el caché.
    await page.locator("#patio-buscar").fill("118");
    await page.getByRole("button", { name: /^Buscar$/ }).click();
    await page.waitForTimeout(3_000);

    // Modo avión: se cae toda la API forestal.
    await context.route(API_FORESTAL, (r) => r.abort("internetdisconnected"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Patio" })).toBeVisible({ timeout: 30_000 });

    await page.locator("#patio-buscar").fill("118");
    await page.getByRole("button", { name: /^Buscar$/ }).click();

    const aviso = page.getByText(/Sin señal — esto es lo último guardado/i);
    await expect(aviso).toBeVisible({ timeout: 20_000 });
    // El veredicto se sigue dando: un caché que no contesta no sirve de nada.
    await expect(
      page.getByText(/Lista para la sierra|No se puede usar|No llegó al patio/).first(),
    ).toBeVisible();
  });

  test("un dato de más de dos horas avisa que puede haber cambiado", async ({ page, context }) => {
    test.skip(!(await entrarAlPatio(page)), "Login admin falló");

    await page.locator("#patio-buscar").fill("118");
    await page.getByRole("button", { name: /^Buscar$/ }).click();
    await page.waitForTimeout(3_000);

    // Se envejece el caché en vez de esperar dos horas.
    const envejecido = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const req = indexedDB.open("buleje-patio-cache");
          req.onsuccess = () => {
            const tx = req.result.transaction("vistas", "readwrite");
            const store = tx.objectStore("vistas");
            const get = store.get("trozas");
            get.onsuccess = () => {
              if (!get.result) return resolve(false);
              store.put({
                ...get.result,
                guardadoEn: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
              });
              tx.oncomplete = () => resolve(true);
            };
            get.onerror = () => resolve(false);
          };
          req.onerror = () => resolve(false);
        }),
    );
    test.skip(!envejecido, "Nada en caché que envejecer");

    await context.route(API_FORESTAL, (r) => r.abort("internetdisconnected"));
    await page.locator("#patio-buscar").fill("118");
    await page.getByRole("button", { name: /^Buscar$/ }).click();

    await expect(page.getByText(/hace 5 h/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/confirmá antes de aserrar/i)).toBeVisible();
  });
});

test.describe("Modo patio · con señal", () => {
  test("el rechazo del libro se MUESTRA, no se encola", async ({ page }) => {
    test.skip(!(await entrarAlPatio(page)), "Login admin falló");
    test.skip(!(await tildarUnaPieza(page)), "Sin corridas o piezas — correr `npm run seed:forestal`");

    const antes = (await cola(page)).length;

    // 422 = una invariante del libro (mes cerrado, troza ya consumida). Se
    // fabrica en vez de buscar una corrida cerrada real: el spec no puede
    // depender de qué períodos estén cerrados en la base del día.
    await page.route("**/api/admin/forestal/trozas/patio", (r) =>
      r.request().method() === "POST"
        ? r.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({ error: "PERIODO_CERRADO", message: "El período está cerrado." }),
          })
        : r.continue(),
    );
    await page.getByRole("button", { name: /Cargar \d+ pieza/ }).click();

    await expect(page.getByText(/El período está cerrado/)).toBeVisible({ timeout: 15_000 });
    // Encolarlo convertiría un "corregí esto" en un "esperá para siempre".
    expect(await cola(page)).toHaveLength(antes);
  });
});
