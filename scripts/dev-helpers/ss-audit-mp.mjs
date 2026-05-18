import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUT = '/home/usuario/proyectos/Mercado/reports/visual-verify/audit-mp';
fs.mkdirSync(OUT, { recursive: true });

const EXEC = '/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const BASE = 'http://localhost:3000';

const shots = [
  { url: '/tiendas',          name: 'tiendas-desktop-light', w: 1440, h: 900,  dark: false },
  { url: '/tiendas',          name: 'tiendas-desktop-dark',  w: 1440, h: 900,  dark: true  },
  { url: '/tiendas',          name: 'tiendas-mobile-light',  w: 390,  h: 844,  dark: false },
  { url: '/tiendas',          name: 'tiendas-mobile-dark',   w: 390,  h: 844,  dark: true  },
  { url: '/marketplace/main', name: 'mp-main-desktop-light', w: 1440, h: 900,  dark: false },
  { url: '/marketplace/main', name: 'mp-main-desktop-dark',  w: 1440, h: 900,  dark: true  },
  { url: '/marketplace/main', name: 'mp-main-mobile-light',  w: 390,  h: 844,  dark: false },
  { url: '/marketplace/main', name: 'mp-main-mobile-dark',   w: 390,  h: 844,  dark: true  },
];

const browser = await chromium.launch({ executablePath: EXEC, headless: true });

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    colorScheme: s.dark ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  if (s.dark) {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('onboarding-completed-main', '1');
    });
  } else {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'light');
      localStorage.setItem('onboarding-completed-main', '1');
    });
  }
  await page.goto(BASE + s.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  if (s.dark) {
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(OUT, s.name + '.png'), fullPage: false });
  await ctx.close();
  console.log('OK', s.name);
}

await browser.close();
console.log('DONE');
