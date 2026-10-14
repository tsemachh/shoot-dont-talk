const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  // emulate a phone in portrait
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36'
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8123/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const portraitShown = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
  await page.screenshot({ path: 'rotate_portrait.png' });
  // rotate to landscape
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  const landscapeShown = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
  await page.screenshot({ path: 'rotate_landscape.png' });
  await browser.close();
  console.log(`portrait overlay: ${portraitShown} (want flex) | landscape overlay: ${landscapeShown} (want none)`);
})();
