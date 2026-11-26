'use strict';
const { chromium } = require('patchright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const source = path.resolve(__dirname, '..', 'src', 'entry.html');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(() => {
      const describe = (el) => {
        const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal || '';
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls.trim().split(/\s+/).join('.') : ''}`;
      };
      const textOverflow = [];
      const outside = [];
      const widthOverflow = [];
      for (const el of document.querySelectorAll('body *')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1) {
          textOverflow.push(`${describe(el)}: scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}; ${JSON.stringify(el.textContent.trim().slice(0, 90))}`);
        }
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.top < -0.5 || r.right > 1024.5 || r.bottom > 1024.5) {
          outside.push(`${describe(el)}: (${r.left.toFixed(1)}, ${r.top.toFixed(1)})–(${r.right.toFixed(1)}, ${r.bottom.toFixed(1)})`);
        }
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
          widthOverflow.push(`${describe(el)}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}; ${JSON.stringify(el.textContent.trim().slice(0, 90))}`);
        }
      }
      return { textOverflow, outside, widthOverflow };
    });
    for (const line of report.textOverflow) console.log(`TEXT OVERFLOW ${line}`);
    for (const line of report.outside) console.log(`OUTSIDE FRAME ${line}`);
    for (const line of report.widthOverflow) console.log(`WIDTH OVERFLOW ${line}`);
    if (report.textOverflow.length || report.outside.length || report.widthOverflow.length) {
      console.log(`LAYOUT FAILED: ${report.textOverflow.length} vertical, ${report.outside.length} outside, ${report.widthOverflow.length} horizontal`);
      process.exitCode = 1;
    } else {
      console.log('LAYOUT OK');
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
