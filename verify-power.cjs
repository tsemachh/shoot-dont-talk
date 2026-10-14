// Power-up UX check: first-capsule tip, blinking "PRESS X" hint, X key and X button activate.
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
    });
  };
  // give the run a capsule exactly as a pickup would
  const collect = (page, n) =>
    page.evaluate((n) => {
      const s = window.__sdt.scene.getScene('invasion');
      for (let i = 0; i < n; i++) s.power.collect();
      s.hud.setPowerCursor(s.power.cursor);
    }, n);
  const power = (page) =>
    page.evaluate(() => {
      const p = window.__sdt.scene.getScene('invasion').power;
      return { cursor: p.cursor, speed: p.speedLevel, mode: p.fireMode };
    });

  // desktop: keyboard X
  const desk = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(desk);
  await desk.goto('http://localhost:8123/?scene=invasion', { waitUntil: 'load' });
  await desk.waitForTimeout(3000);
  await collect(desk, 2); // highlight SPR
  await desk.waitForTimeout(250);
  await desk.screenshot({ path: `${OUT}/pw_ready.png` });
  console.log('before X:', JSON.stringify(await power(desk)));
  await desk.keyboard.press('KeyX');
  await desk.waitForTimeout(300);
  console.log('after X key:', JSON.stringify(await power(desk)));

  // mobile: tap the X button
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mob = await ctx.newPage();
  watch(mob);
  await mob.goto('http://localhost:8123/?scene=invasion', { waitUntil: 'load' });
  await mob.waitForTimeout(3000);
  await collect(mob, 1); // highlight SPD
  await mob.waitForTimeout(250);
  await mob.screenshot({ path: `${OUT}/pw_mobile_ready.png` });
  const pt = await mob.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    const g = window.__sdt.scale.gameSize;
    return { x: c.left + ((g.width - 180) * c.width) / g.width, y: c.top + ((g.height - 6) * c.height) / g.height };
  });
  await mob.touchscreen.tap(pt.x, pt.y);
  await mob.waitForTimeout(300);
  console.log('mobile after tapping X button:', JSON.stringify(await power(mob)));

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
