// Lunar: rover mid-screen, saucers hover over it dropping missiles (blast fx), clean restart at phase start.
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8123/?scene=lunar', { waitUntil: 'load' });
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => window.__sdt.scene.getScene('lunar').state === 'play')) break; await p.waitForTimeout(400); }
  await p.evaluate(() => { const s = window.__sdt.scene.getScene('lunar'); s.__keep = setInterval(() => { s.invuln = 1e6; s.obstacles.forEach((o) => { if (o.kind === 'crater') o.alive = false; }); }, 50); s.saucerTimer = 1; });
  await p.waitForTimeout(6000);
  const st = await p.evaluate(() => { const s = window.__sdt.scene.getScene('lunar'); const sc = s.flyers.filter((f) => f.alive && f.kind === 'saucer').map((f) => Math.round(f.sprite.x)); return { W: window.__sdt.scale.width, rover: Math.round(s.roverX), saucersX: sc, missiles: s.bombs.filter((m) => m.active).length }; });
  console.log('mid-wave', JSON.stringify(st));
  // freeze a frame with a missile blast
  await p.evaluate(() => { const s = window.__sdt.scene.getScene('lunar'); s.bombImpact(s.roverX + 70); });
  await p.waitForTimeout(80);
  await p.screenshot({ path: `${OUT}/lunar_missiles.png` });
  // death -> restart at phase start
  const r = await p.evaluate(async () => {
    const s = window.__sdt.scene.getScene('lunar'); clearInterval(s.__keep); s.invuln = 0;
    const seg = s.lastSeg;
    s.killRover(false, 'test');
    await new Promise((res) => setTimeout(res, 4500));
    return { state: s.state, worldX: Math.round(s.worldX), phaseStart: seg * 1500, rover: Math.round(s.roverX), firstObstacleAhead: Math.round(s.nextSpawnX - s.worldX - s.roverX), saucersUp: s.flyers.some((f) => f.alive), saucerTimer: s.saucerTimer };
  });
  console.log('after death', JSON.stringify(r));
  await b.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'NO PAGE ERRORS');
})();
