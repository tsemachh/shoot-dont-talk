// Phone browser tab: first title tap = fullscreen only (stays on title), next tap starts; no request mid-game.
const { chromium, devices } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const ctx = await b.newContext({ ...devices['Pixel 7 landscape'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    window.__fsCalls = 0;
    const orig = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (o) { window.__fsCalls++; return orig.call(this, o); };
  });
  await p.goto('http://localhost:8123/', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const st = () => p.evaluate(() => ({ scenes: window.__sdt.scene.getScenes(true).map((s) => s.sys.settings.key).join(','), fs: !!document.fullscreenElement, calls: window.__fsCalls, text: window.__sdt.scene.getScene('attract').coinText?.text }));
  console.log('title       ', JSON.stringify(await st()));
  await p.touchscreen.tap(420, 260); await p.waitForTimeout(1200);
  console.log('tap 1       ', JSON.stringify(await st()));
  await p.touchscreen.tap(420, 260); await p.waitForTimeout(2500);
  console.log('tap 2       ', JSON.stringify(await st()));
  await p.evaluate(() => document.exitFullscreen?.().catch(() => {})); await p.waitForTimeout(500);
  await p.touchscreen.tap(420, 260); await p.waitForTimeout(800);
  console.log('in-game tap after leaving fullscreen', JSON.stringify(await st()));
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
