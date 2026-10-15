// Lunar feel: empty opening road, warm-up singles, barrier saves a crater fall.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/?scene=lunar', { waitUntil: 'load' });
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => window.__sdt.scene.getScene('lunar').state === 'play')) break; await p.waitForTimeout(400); }
  const r = await p.evaluate(async () => {
    const s = window.__sdt.scene.getScene('lunar');
    const first = Math.min(...s.obstacles.map((o) => o.wx), s.nextSpawnX);
    const out = { firstObstacleAt: Math.round(first), roverWorldX: Math.round(s.worldX + s.roverX) };
    // barrier save
    s.power.collect('SHD'); s.tryActivate();
    s.obstacles.forEach((o) => o.sprite?.destroy()); s.obstacles.length = 0; s.nextSpawnX = s.worldX + 1e6;
    s.invuln = 0;
    s.addObstacle('crater', s.worldX + s.roverX - 20, 40);
    await new Promise((res) => setTimeout(res, 400));
    out.afterCrater = { state: s.state, lives: s.lives, shield: s.power.shieldHp };
    return out;
  });
  console.log(JSON.stringify(r));
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
