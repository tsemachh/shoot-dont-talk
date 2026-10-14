// M5 Warp Ring check: jump from the moon, ring play, demo pilot, banner placement.
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
  });
  const go = (q) => page.goto(`http://localhost:8123/?${q}`, { waitUntil: 'load' });

  // lunar -> warp transition (rover folds back into the fighter)
  await go('scene=jump&to=warp');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/m5_jump_a.png` });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/m5_jump_b.png` });

  // warp ring: intro banner, then fly around the ring firing
  await go('scene=warp');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/m5_intro.png` });
  await page.keyboard.down('Space');
  const dirs = [['ArrowLeft'], ['ArrowUp'], ['ArrowRight'], ['ArrowDown'], ['ArrowLeft', 'ArrowUp']];
  for (let i = 0; i < 10; i++) {
    const keys = dirs[i % dirs.length];
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(900);
    for (const k of keys) await page.keyboard.up(k);
    if (i === 4) await page.screenshot({ path: `${OUT}/m5_play_a.png` });
  }
  await page.screenshot({ path: `${OUT}/m5_play_b.png` });
  await page.keyboard.up('Space');

  // demo pilot over a longer stretch (waves, satellites, warps)
  await go('scene=warp&demo');
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/m5_demo_${i}.png` });
  }

  // banners now sit below the formations
  await go('scene=invasion');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/m5_inv_banner.png` });
  await go('scene=swarm');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/m5_swarm_banner.png` });

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
