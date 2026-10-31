(() => {
  const H = innerHeight, W = innerWidth;
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 2 && b.height > 2 && b.right > 0 && b.left < innerWidth && b.bottom + scrollY > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0" && !el.closest("[aria-hidden=true],[inert],[role=dialog][data-state=closed]"); };
  const main = document.querySelector("main") || document.body;
  const hdr = document.querySelector("[data-admin-header]");
  const hb = hdr ? Math.round(hdr.getBoundingClientRect().bottom + scrollY) : 0;
  /* primer contenido: tabla, lista, tarjeta, imagen grande, video, stat */
  const cand = [...main.querySelectorAll("table, [role=table], [role=grid], [draggable=true], article, video, canvas, [data-stat-card], [data-contenido], ul > li, ol > li, img")]
    .filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 120 && r.height > 28; });
  const ys = cand.map((e) => Math.round(e.getBoundingClientRect().top + scrollY)).filter((y) => y > hb);
  const primerY = ys.length ? Math.min(...ys) : null;
  const primerEl = primerY == null ? null : cand.find((e) => Math.round(e.getBoundingClientRect().top + scrollY) === primerY);
  /* franjas: filas distintas de controles (botones/inputs/tabs) antes del primer contenido */
  const ctrls = [...document.querySelectorAll("button, a, input, select, [role=tab], [role=button]")].filter(vis)
    .map((e) => { const r = e.getBoundingClientRect(); return { t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY) }; })
    .filter((r) => primerY == null || r.b <= primerY);
  ctrls.sort((a, b) => a.t - b.t);
  const filas = [];
  for (const c of ctrls) { const f = filas.find((f) => c.t < f.b - 4 && c.b > f.t + 4); if (f) { f.t = Math.min(f.t, c.t); f.b = Math.max(f.b, c.b); } else filas.push({ ...c }); }
  /* botones/inputs < 44 px dentro de la vista */
  const toc = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, [role=tab], [role=button], [role=checkbox], [role=switch]")].filter(vis)
    .filter((e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < W; });
  const chicos = toc.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; });
  const ejChicos = chicos.slice(0, 8).map((e) => { const r = e.getBoundingClientRect(); return `${(e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || e.tagName).trim().slice(0, 18)} ${Math.round(r.width)}x${Math.round(r.height)}`; });
  /* letra < 14 */
  let letraChica = 0; const ejLetra = [];
  for (const el of [...document.querySelectorAll("main *, [data-admin-header] *, nav[aria-label=\"Navegación rápida\"] *")]) {
    if (!vis(el)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 14) { letraChica++; if (ejLetra.length < 6) ejLetra.push(`${el.textContent.trim().slice(0, 16)} ${fs}`); }
  }
  /* desborde horizontal: página y elementos que se salen */
  const sale = [...main.querySelectorAll("*")].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); if (r.right <= W + 1) return false; let p = e.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false; p = p.parentElement; } return true; });
  /* barras fijas arriba/abajo */
  const fijos = [...document.querySelectorAll("body *")].filter((e) => { const p = getComputedStyle(e).position; return (p === "fixed" || p === "sticky") && vis(e); })
    .map((e) => { const r = e.getBoundingClientRect(); return { tag: (e.getAttribute("aria-label") || e.getAttribute("data-qa") || e.className?.toString?.() || e.tagName).slice(0, 30), top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), pos: getComputedStyle(e).position }; })
    .filter((f) => f.w > W * 0.5 && f.h > 20);
  const abajo = fijos.filter((f) => f.top + f.h >= H - 2 && f.top > H / 2);
  const arriba = fijos.filter((f) => f.top <= 2);
  return {
    W, H, pantallas: +(document.documentElement.scrollHeight / H).toFixed(2), desborde: document.documentElement.scrollWidth - W,
    seSalen: sale.length, ejSale: sale.slice(0, 3).map((e) => (e.textContent || e.tagName).trim().slice(0, 20)),
    cabeceraPanel: hb, primerContenidoY: primerY, primerContenido: primerEl ? (primerEl.tagName + " " + (primerEl.textContent || "").trim().slice(0, 25)) : null,
    filasDeControlesAntes: filas.length, filas: filas.map((f) => `${f.t}-${f.b}`).join(" "),
    tocables: toc.length, menos44: chicos.length, ejMenos44: ejChicos, letraMenos14: letraChica, ejLetra,
    fijosArriba: arriba.map((f) => `${f.tag}:${f.h}`), fijosAbajo: abajo.map((f) => `${f.tag}:${f.h}`),
    errores: (window.__qaErrores || []).length,
  };
})()
