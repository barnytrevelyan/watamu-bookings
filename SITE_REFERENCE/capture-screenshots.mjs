#!/usr/bin/env node
/**
 * Capture screenshots of every public page on watamubookings.com.
 *
 * The Cowork sandbox can't install chromium, so this runs locally:
 *
 *   cd /Volumes/BTJ_ONE/Projects/watamu-bookings-fresh
 *   npx playwright install chromium   # first time only
 *   node SITE_REFERENCE/capture-screenshots.mjs
 *
 * Output: SITE_REFERENCE/screenshots/*.png (desktop + mobile).
 * Private routes (host dashboard, admin) require SITE_EMAIL + SITE_PASSWORD env vars:
 *
 *   SITE_EMAIL=your@email SITE_PASSWORD=... node SITE_REFERENCE/capture-screenshots.mjs
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots');
const BASE = process.env.SITE_URL || 'https://watamubookings.com';

const PUBLIC_PAGES = [
  ['home', '/'],
  ['about', '/about'],
  ['activities', '/activities'],
  ['properties', '/properties'],
  ['boats', '/boats'],
  ['map', '/map'],
  ['tides', '/tides'],
  ['contact', '/contact'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['become-a-host', '/become-a-host'],
  ['auth-login', '/auth/login'],
  ['auth-register', '/auth/register'],
];

const PRIVATE_PAGES = [
  ['dashboard', '/dashboard'],
  ['dashboard-properties', '/dashboard/properties'],
  ['dashboard-boats', '/dashboard/boats'],
  ['dashboard-bookings', '/dashboard/bookings'],
  ['dashboard-reviews', '/dashboard/reviews'],
  ['dashboard-billing', '/dashboard/billing'],
  ['dashboard-import', '/dashboard/import'],
];

async function shoot(page, slug, url, viewport) {
  await page.setViewportSize(viewport);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (err) {
    console.warn(`  ! ${slug} (${viewport.width}x${viewport.height}): ${err.message}`);
    return;
  }
  // Wait a beat for lazy-loaded images / maps.
  await page.waitForTimeout(1500);
  const label = viewport.width < 500 ? 'mobile' : 'desktop';
  const file = path.join(OUT, `${slug}.${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${path.basename(file)}`);
}

(async () => {
  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`\nBase URL: ${BASE}\n`);

  console.log('Public pages:');
  for (const [slug, route] of PUBLIC_PAGES) {
    await shoot(page, slug, BASE + route, { width: 1440, height: 900 });
    await shoot(page, slug, BASE + route, { width: 390, height: 844 });
  }

  if (process.env.SITE_EMAIL && process.env.SITE_PASSWORD) {
    console.log('\nLogging in for host routes...');
    await page.goto(BASE + '/auth/login');
    await page.fill('input[type=email]', process.env.SITE_EMAIL);
    await page.fill('input[type=password]', process.env.SITE_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL(/dashboard/, { timeout: 15_000 }).catch(() => {});

    console.log('\nHost dashboard pages:');
    for (const [slug, route] of PRIVATE_PAGES) {
      await shoot(page, slug, BASE + route, { width: 1440, height: 900 });
      await shoot(page, slug, BASE + route, { width: 390, height: 844 });
    }
  } else {
    console.log(
      '\n(Skipping host dashboard — set SITE_EMAIL + SITE_PASSWORD to include them.)'
    );
  }

  await browser.close();
  console.log(`\nDone. Screenshots in ${OUT}/`);
})();
