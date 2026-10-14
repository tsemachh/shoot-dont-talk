// Lunar flow: jump airtime, obstacle phrases with calm stretches, UFO waves with lulls (autopilot run).
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/?scene=lunar&auto', { waitUntil: 'load' });
  await p.evaluate(() => {
    const log = (window.__flow = { air: [], waves: 0, up: false, t0: 0, obs: [], deaths: 0 });
    let last = 0, airStart = -1, seen = new Set();
    setInterval(() => {
      const s = window.__sdt.scene.getScene('lunar');
      if (!s || !s.sys.isActive()) return;
      if (!s.grounded && airStart < 0) airStart = s.frame;
      if (s.grounded && airStart >= 0) { log.air.push(s.frame - airStart); airStart = -1; }
      const up = s.flyers.some((f) => f.alive && f.kind === 'saucer');
      if (up && !log.up) log.waves++;
      log.up = up;
      for (const o of s.obstacles) if (!seen.has(o)) { seen.add(o); log.obs.push(Math.round(o.wx)); }
      if (s.state === 'dying' && last !== 1) log.deaths++;
      last = s.state === 'dying' ? 1 : 0;
    }, 16);
  });
  await p.waitForTimeout(45000);
  const f = await p.evaluate(() => window.__flow);
  const gaps = f.obs.slice(1).map((x, i) => x - f.obs[i]).filter((g) => g > 0);
  const calm = gaps.filter((g) => g > 250).length;
  console.log('jump airtime (frames):', [...new Set(f.air)].slice(0, 6).join(','), '| median', f.air.sort((a, b) => a - b)[Math.floor(f.air.length / 2)]);
  console.log('obstacles:', f.obs.length, '| spacing min/max', Math.min(...gaps), Math.max(...gaps), '| calm stretches (>250):', calm, '| tight steps (<90):', gaps.filter((g) => g < 90).length);
  console.log('UFO waves:', f.waves, '| autopilot deaths:', f.deaths);
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
