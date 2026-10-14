// Toggle bar check: visible on desktop + mobile, tap toggles without starting the game,
// keyboard letters work, settings persist across scenes.
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const errors = [];
  const watch = (page, tag) => {
    page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push(`${tag} console: ${m.text()}`);
    });
  };
  const state = (page) =>
    page.evaluate(() => ({
      settings: JSON.parse(localStorage.getItem('sdt-settings') || '{}'),
      scenes: window.__sdt.scene.getScenes(true).map((s) => s.sys.settings.key)
    }));

  // desktop: keyboard letters
  const desk = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(desk, 'desktop');
  await desk.goto('http://localhost:8123/?scene=invasion', { waitUntil: 'load' });
  await desk.waitForTimeout(2500);
  await desk.screenshot({ path: `${OUT}/tg_desktop_on.png` });
  await desk.keyboard.press('KeyC');
  await desk.keyboard.press('KeyN');
  await desk.waitForTimeout(400);
  await desk.screenshot({ path: `${OUT}/tg_desktop_off.png` });
  console.log('desktop after C,N:', JSON.stringify(await state(desk)));
  await desk.keyboard.press('KeyC');
  await desk.keyboard.press('KeyN');

  // mobile: tap the CRT button on the title screen; game must NOT start
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mob = await ctx.newPage();
  watch(mob, 'mobile');
  await mob.goto('http://localhost:8123/', { waitUntil: 'load' });
  await mob.waitForTimeout(1500);
  await mob.screenshot({ path: `${OUT}/tg_mobile_title.png` });
  // button geometry in game px -> CSS px (canvas fills the viewport)
  const pt = await mob.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    const g = window.__sdt;
    const sx = c.width / g.scale.gameSize.width;
    const sy = c.height / g.scale.gameSize.height;
    // CRT button: x = 38 + 1*(38+3) .. +38, y centre = GAME_H - 6
    return { x: c.left + (38 + 41 + 19) * sx, y: c.top + (g.scale.gameSize.height - 6) * sy };
  });
  await mob.touchscreen.tap(pt.x, pt.y);
  await mob.waitForTimeout(800);
  await mob.screenshot({ path: `${OUT}/tg_mobile_after_tap.png` });
  console.log('mobile after tapping CRT:', JSON.stringify(await state(mob)));

  // persistence: setting survives a scene change
  await mob.goto('http://localhost:8123/?scene=warp', { waitUntil: 'load' });
  await mob.waitForTimeout(2500);
  await mob.screenshot({ path: `${OUT}/tg_mobile_warp.png` });
  console.log('mobile in warp:', JSON.stringify(await state(mob)));

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
