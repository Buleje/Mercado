#!/usr/bin/env node
// Crea el usuario «claude» (rol admin, «Claude») en un negocio, o le renueva la clave si ya existe, y lo deja
// guardado en ~/.config/buleje-mcp/credenciales.json. Para entrar UNA vez usa el admin de Brandon, que escribe
// usuario y clave en una ventana de Windows con la clave oculta: no se guarda, no se imprime y Claude no la ve.
// Brandon 29-10-2026: «Activar a Claude en Blas». Uso: node tools/mcp-buleje/crear-usuario.mjs blas
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { crearCliente } from "./src/cliente.mjs";
import { RUTA_CREDENCIALES, leerCredenciales, validarConfig } from "./src/credenciales.mjs";
import { guardar } from "./configurar.mjs";

const NEGOCIOS = {
  blas: { slug: "inversiones-agroforestales-blas-sociedad-anonima", tenantId: "cmpxiv6p4000bohvzwl6bnfpv", titulo: "Blas", usuario: "blasadmin" },
  bodega: { slug: "main", titulo: "la bodega", usuario: "" },
};

/** Ventana de Windows con usuario y clave oculta. Devuelve {u, p} o null si Brandon cancela. */
function pedirAdminEnWindows(titulo, usuarioSugerido) {
  const b64 = (t) => Buffer.from(t, "utf8").toString("base64");
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$txt = { param($b) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) }
$f = New-Object Windows.Forms.Form -Property @{ Text = (& $txt '${b64("Claude pide tu clave de ADMIN")}'); Width = 470; Height = 270; TopMost = $true; StartPosition = 'CenterScreen'; FormBorderStyle = 'FixedDialog'; MaximizeBox = $false; MinimizeBox = $false }
$f.Font = New-Object Drawing.Font('Segoe UI', 10)
$l = New-Object Windows.Forms.Label -Property @{ Left = 16; Top = 12; Width = 430; Height = 58; Text = (& $txt '${b64(`Para crear el usuario «Claude» en ${titulo}, entra una sola vez con TU usuario de administrador. La clave no se guarda ni la ve Claude.`)}') }
$lu = New-Object Windows.Forms.Label -Property @{ Left = 16; Top = 78; Width = 90; Text = 'Usuario' }
$u = New-Object Windows.Forms.TextBox -Property @{ Left = 110; Top = 75; Width = 320; Text = (& $txt '${b64(usuarioSugerido)}') }
$lp = New-Object Windows.Forms.Label -Property @{ Left = 16; Top = 116; Width = 90; Text = 'Clave' }
$p = New-Object Windows.Forms.TextBox -Property @{ Left = 110; Top = 113; Width = 320; UseSystemPasswordChar = $true }
$ok = New-Object Windows.Forms.Button -Property @{ Left = 230; Top = 165; Width = 100; Height = 34; Text = 'Entrar'; DialogResult = 'OK' }
$no = New-Object Windows.Forms.Button -Property @{ Left = 340; Top = 165; Width = 90; Height = 34; Text = 'Cancelar'; DialogResult = 'Cancel' }
$f.Controls.AddRange(@($l, $lu, $u, $lp, $p, $ok, $no)); $f.AcceptButton = $ok; $f.CancelButton = $no
$f.Add_Shown({ $f.Activate(); $p.Focus() })
if ($f.ShowDialog() -eq 'OK') { [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((@{ u = $u.Text; p = $p.Text } | ConvertTo-Json -Compress)))) }
`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")],
    { encoding: "utf8", timeout: 5 * 60_000, windowsHide: false });
  const salida = (r.stdout || "").trim();
  if (!salida) return null;
  try { return JSON.parse(Buffer.from(salida, "base64").toString("utf8")); } catch { return null; }
}

async function principal() {
  const nombre = process.argv[2];
  const n = NEGOCIOS[nombre];
  if (!n) { console.error(`Uso: node tools/mcp-buleje/crear-usuario.mjs <${Object.keys(NEGOCIOS).join("|")}>`); process.exit(2); }
  const admin = pedirAdminEnWindows(n.titulo, n.usuario);
  if (!admin?.u || !admin?.p) { console.log("Cancelado: no se escribió usuario o clave."); return; }

  const v = validarConfig({ base: "http://localhost:3000", seco: false, negocios: { admin: { slug: n.slug, usuario: admin.u, clave: admin.p } } });
  if (!v.ok) { console.log("Datos inválidos:", v.errores.join("; ")); return; }
  const cliAdmin = crearCliente({ config: v.config, dirEstado: null });
  const lista = await cliAdmin.pedir("admin", { metodo: "GET", ruta: "/api/admin-users" });
  if (!lista.ok) { console.log(`No pude entrar como ${admin.u} en ${n.titulo}: ${lista.error?.codigo} — ${lista.error?.mensaje}`); return; }
  const filas = Array.isArray(lista.datos) ? lista.datos : [];
  const yaEsta = filas.find((x) => x.username === "claude");

  const clave = "Cl-" + randomBytes(18).toString("base64url") + "9!";
  const r = yaEsta
    ? await cliAdmin.pedir("admin", { metodo: "PATCH", ruta: "/api/admin-users", cuerpo: { id: yaEsta.id, password: clave, active: true } })
    : await cliAdmin.pedir("admin", { metodo: "POST", ruta: "/api/admin-users", cuerpo: { username: "claude", password: clave, role: "admin", name: "Claude" } });
  if (!r.ok) { console.log(`No se pudo ${yaEsta ? "renovar" : "crear"} el usuario claude: ${r.status} ${r.error?.codigo} — ${r.error?.mensaje}`); return; }

  const config = existsSync(RUTA_CREDENCIALES) ? JSON.parse(readFileSync(RUTA_CREDENCIALES, "utf8")) : { base: "http://localhost:3000", porDefecto: nombre, seco: true, negocios: {} };
  config.negocios[nombre] = { slug: n.slug, ...(n.tenantId ? { tenantId: n.tenantId } : {}), usuario: "claude", clave };
  guardar(config);

  const me = await crearCliente({ config: leerCredenciales(), dirEstado: null }).pedir(nombre, { metodo: "GET", ruta: "/api/auth/me" });
  const d = /** @type {any} */ (me.datos) ?? {};
  console.log(`✔ Usuario claude ${yaEsta ? "renovado" : "creado"} en ${n.titulo} (${r.status}) · login de Claude: ${me.ok ? `ok como ${d.username ?? d.user?.username} (${d.role ?? d.user?.role})` : `${me.error?.codigo} — ${me.error?.mensaje}`}`);
}

principal().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
