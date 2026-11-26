'use strict';
const { chromium } = require('patchright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const image = path.resolve(__dirname, '..', 'entry.png');
const output = path.resolve(__dirname, '..', 'thumb.png');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 300, height: 300 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(image).href, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'html,body{margin:0!important;width:300px!important;height:300px!important;background:#F7F2E6!important;overflow:hidden!important}img{display:block!important;width:300px!important;height:300px!important;margin:0!important}' });
    await page.screenshot({ path: output, type: 'png', fullPage: false });
    console.log(`thumb.png: 300x300`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
