// Final polish check: world Hall of Fame (mocked worker), score submission, adaptive lite glow.
const { chromium } = require('playwright-core');
const OUT = process.env.OUT || '.';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const errors = [];
  const posts = [];
  const mock = async (page, scores) => {
    await page.route('**/arcade-scores.tsemachh-391.workers.dev/**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        posts.push(body);
        scores = [...scores, { name: body.name, score: body.score, wave: body.wave }].sort((a, b) => b.score - a.score);
      }
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ scores }) });
    });
  };
  const newPage = async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
    });
    return p;
  };

  // 1) world board populated
  const a = await newPage();
  await mock(a, [
    { name: 'ACE', score: 88000, wave: 9 },
    { name: 'ZAP', score: 61000, wave: 6 },
    { name: 'TSE', score: 42000, wave: 5 }
  ]);
  await a.goto('http://localhost:8123/', { waitUntil: 'load' });
  await a.waitForTimeout(8200); // title -> scores page
  await a.screenshot({ path: `${OUT}/hof_world.png` });

  // 2) world board empty -> local table with a call to action
  const b = await newPage();
  await mock(b, []);
  await b.goto('http://localhost:8123/', { waitUntil: 'load' });
  await b.waitForTimeout(8200);
  await b.screenshot({ path: `${OUT}/hof_empty.png` });

  // 3) initials entry submits to the world board
  await b.evaluate(() => window.__sdt.scene.getScene('attract').scene.start('initials', { score: 99999, wave: 12 }));
  await b.waitForTimeout(800);
  await b.keyboard.press('KeyG');
  await b.keyboard.press('KeyO');
  await b.keyboard.press('KeyD');
  await b.keyboard.press('Enter');
  await b.waitForTimeout(2500);
  console.log('POSTed to world board:', JSON.stringify(posts));

  // 4) adaptive quality on a slow renderer (swiftshader is slow)
  await b.goto('http://localhost:8123/?scene=warp', { waitUntil: 'load' });
  await b.waitForTimeout(12000);
  const q = await b.evaluate(() => {
    const cam = window.__sdt.scene.getScene('warp').cameras.main;
    const p = cam.getPostPipeline('CrtPipeline');
    return { fps: Math.round(window.__sdt.loop.actualFps), lite: (Array.isArray(p) ? p[0] : p).lite };
  });
  console.log('adaptive quality:', JSON.stringify(q));

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
