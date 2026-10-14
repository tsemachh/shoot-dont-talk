// Lunar: stick = throttle; fast carries the rover to screen centre, slow lets it drift left, never backwards over the ground (emulated Android phone).
const { chromium, devices } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const ctx = await b.newContext({ ...devices['Pixel 7 landscape'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/?scene=lunar', { waitUntil: 'load' });
  await p.evaluate(() => setInterval(() => { const s = window.__sdt.scene.getScene('lunar'); if (s) { s.invuln = 1e6; s.nextSpawnX = s.worldX + 1e6; s.obstacles.length = 0; } }, 50));
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => window.__sdt.scene.getScene('lunar').state === 'play')) break; await p.waitForTimeout(400); }
  const st = () => p.evaluate(() => { const s = window.__sdt.scene.getScene('lunar'); return { rx: Math.round(s.roverX), spd: +s.speed.toFixed(2), center: Math.round(window.__sdt.scale.width / 2), groundX: Math.round(s.worldX + s.roverX) }; });
  const scr = (gx, gy) => p.evaluate(([gx, gy]) => { const c = window.__sdt.canvas.getBoundingClientRect(); const g = window.__sdt.scale; return { x: c.left + gx * c.width / g.width, y: c.top + gy * c.height / g.height }; }, [gx, gy]);
  const cdp = await ctx.newCDPSession(p);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const y = 216 - 34;
  console.log('start         ', JSON.stringify(await st()));
  await T('touchStart', [{ ...(await scr(30 + 17, y)), id: 1 }]); await p.waitForTimeout(3000);
  console.log('stick right   ', JSON.stringify(await st()));
  await T('touchEnd', []); await p.waitForTimeout(2500);
  console.log('released      ', JSON.stringify(await st()));
  await T('touchStart', [{ ...(await scr(30 - 17, y)), id: 2 }]); await p.waitForTimeout(3000);
  console.log('stick left    ', JSON.stringify(await st()));
  await T('touchEnd', []);
  // keyboard on desktop works the same
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
