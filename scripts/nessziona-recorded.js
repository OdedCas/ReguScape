const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://mg2.gis-net.co.il/NessZionaGis/#/');
  await page.locator('#messageOnStartup').click();
  await page.getByText('אישור').click();
  await page.getByRole('banner').getByText('חיפושים').click();
  await page.locator('div').filter({ hasText: 'ג גוש חלקה' }).nth(2).click();
  await page.getByText('ג גוש חלקה').click();
  await page.getByRole('textbox', { name: 'גוש' }).click();
  await page.getByRole('textbox', { name: 'גוש' }).fill('3636');
  await page.getByText('3636').click();
  await page.getByText('3636').click();
  await page.getByRole('textbox', { name: 'חלקה' }).fill('208');
  await page.getByRole('textbox', { name: 'חלקה' }).click();
  await page.getByRole('button', { name: 'חיפוש' }).click();
  await page.getByText('מ מידע תכנוני').dblclick();
  const page1Promise = page.waitForEvent('popup');
  await page.getByText('ז דף מידע', { exact: true }).click();
  const page1 = await page1Promise;
  await page1.close();
  await page.close();

  // ---------------------
  await context.close();
  await browser.close();
})();