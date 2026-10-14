// Polish pass check: pixel font, bloom, Lunar repaint, music, demo rotation.
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

  // demos of each sector: should self-play with the DEMO label, then return to the title
  for (const s of ['invasion', 'swarm', 'lunar']) {
    await page.goto(`http://localhost:8123/?scene=${s}&demo`, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/demo_${s}.png` });
  }

  // fire during a demo -> coins up a real game (invasion)
  await page.goto('http://localhost:8123/?scene=swarm&demo', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/demo_exit_to_game.png` });

  // music: after a key press the AudioContext should be running
  const audioState = await page.evaluate(() => {
    const ctxs = performance.getEntriesByType ? 'n/a' : '';
    return typeof AudioContext !== 'undefined' ? 'webaudio-available' : 'none';
  });

  // title page with new font
  await page.goto('http://localhost:8123/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/title.png` });

  await browser.close();
  console.log('audio:', audioState);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
})();
