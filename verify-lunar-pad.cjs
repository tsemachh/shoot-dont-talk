// Lunar fixed touch controller on an emulated phone: stick = speed, JUMP, FIRE, multi-touch.
const { chromium, devices } = require('playwright-core');
const OUT = process.env.OUT || '.';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const ctx = await b.newContext({ ...devices['iPhone 13 landscape'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/?scene=lunar', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/lunar_pad.png` });
  const st = () => p.evaluate(() => { const s = window.__sdt.scene.getScene('lunar'); return { state: s.state, spd: +s.speed.toFixed(2), rx: Math.round(s.roverX), air: !s.grounded, cd: Math.round(s.fireCooldown), pool: s.fwdBullets.length + s.upBullets.length }; });
  const scr = (gx, gy) => p.evaluate(([gx, gy]) => { const c = window.__sdt.canvas.getBoundingClientRect(); const g = window.__sdt.scale; return { x: c.left + gx * c.width / g.width, y: c.top + gy * c.height / g.height }; }, [gx, gy]);
  const cdp = await ctx.newCDPSession(p);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const W = await p.evaluate(() => window.__sdt.scale.width);
  // keep the rover alive so the controls can be measured
  await p.evaluate(() => setInterval(() => { const s = window.__sdt.scene.getScene('lunar'); if (s) { s.invuln = 1e6; s.nextSpawnX = s.worldX + 1e6; for (const o of s.obstacles) { o.sprite?.setVisible(false); } s.obstacles.length = 0; } }, 50));
  // wait for play
  for (let i = 0; i < 10 && (await st()).state !== 'play'; i++) await p.waitForTimeout(500);
  console.log('start'.padEnd(26), JSON.stringify(await st()));
  const stickR = await scr(32 + 18, 128);
  await T('touchStart', [{ ...stickR, id: 1 }]); await p.waitForTimeout(1500);
  console.log('stick right -> faster'.padEnd(26), JSON.stringify(await st()));
  await p.screenshot({ path: `${OUT}/lunar_pad_held.png` });
  const jump = await scr(W - 30, 142);
  await T('touchStart', [{ ...stickR, id: 1 }, { ...jump, id: 2 }]); await p.waitForTimeout(120);
  console.log('+ JUMP (2nd thumb)'.padEnd(26), JSON.stringify(await st()));
  await T('touchEnd', []); await T('touchStart', [{ ...stickR, id: 1 }]); await p.waitForTimeout(600);
  const fire = await scr(W - 72, 118);
  await T('touchStart', [{ ...stickR, id: 1 }, { ...fire, id: 3 }]);
  let shots = 0, last = -1;
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(50); const c = (await st()).cd; if (c > last && c > 0) shots++; last = c; }
  console.log('+ FIRE held'.padEnd(26), 'shots fired ~', shots, JSON.stringify(await st()));
  await T('touchEnd', []); await p.waitForTimeout(100);
  const stickL = await scr(32 - 18, 128);
  await T('touchStart', [{ ...stickL, id: 4 }]); await p.waitForTimeout(1500);
  console.log('stick left -> brake'.padEnd(26), JSON.stringify(await st()));
  await T('touchEnd', []);
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
