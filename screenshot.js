const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/cassu/.cache/puppeteer/chrome/linux-145.0.7632.46/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 2 });

  // Screenshot 1: Empty state
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: '/tmp/reguscape-empty.png', fullPage: true });
  console.log('Screenshot 1: empty state saved');

  // Click the gush/helka tab
  const tabs = await page.$$('button');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('גוש')) {
      await tab.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 500));

  // Fill gush and helka
  await page.type('#gush', '6166');
  await page.type('#helka', '35');

  // Click search button
  const buttons = await page.$$('button[type="submit"]');
  if (buttons.length > 0) {
    await buttons[0].click();
  }

  // Wait for results
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: '/tmp/reguscape-gush-results.png', fullPage: true });
  console.log('Screenshot 2: gush/helka results saved');

  await browser.close();
})().catch(e => console.error(e));
