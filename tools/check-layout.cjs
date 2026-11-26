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
      // Explicit ALSO REPORTED strip assertions.
      const stripProblems = [];
      const briefs = document.querySelector('section.briefs');
      const footer = document.querySelector('.footer');
      if (briefs && footer) {
        const fb = briefs.getBoundingClientRect();
        const ft = footer.getBoundingClientRect();
        stripProblems.push(`briefs block (${fb.left.toFixed(1)}, ${fb.top.toFixed(1)})–(${fb.right.toFixed(1)}, ${fb.bottom.toFixed(1)})`);
        stripProblems.push(`footer block (${ft.left.toFixed(1)}, ${ft.top.toFixed(1)})–(${ft.right.toFixed(1)}, ${ft.bottom.toFixed(1)})`);
        if (ft.top - fb.bottom < 6) stripProblems.push(`briefs bottom is only ${(ft.top - fb.bottom).toFixed(1)}px above footer top`);
        for (const cell of briefs.querySelectorAll('.brief')) {
          const gb = briefs.querySelector('.brief-grid').getBoundingClientRect();
          const ib = cell.getBoundingClientRect();
          if (ib.bottom > gb.bottom + 0.5) stripProblems.push(`brief cell exceeds the grid: ${JSON.stringify(cell.textContent.trim().slice(0, 60))} bottom ${ib.bottom.toFixed(1)} > grid bottom ${gb.bottom.toFixed(1)}`);
        }
        const items = [...briefs.querySelectorAll('.brief')];
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i].getBoundingClientRect();
            const b = items[j].getBoundingClientRect();
            const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
            if (overlap) stripProblems.push(`brief items overlap: ${JSON.stringify(items[i].textContent.trim().slice(0, 40))} and ${JSON.stringify(items[j].textContent.trim().slice(0, 40))}`);
          }
        }
      } else {
        stripProblems.push('briefs block or footer not found');
      }
      return { textOverflow, outside, widthOverflow, stripProblems };
    });
    for (const line of report.stripProblems) console.log(`STRIP ${line}`);
    const stripOk = report.stripProblems.length === 2 && report.stripProblems[0].startsWith('briefs block') && report.stripProblems[1].startsWith('footer block');
    for (const line of report.outside) console.log(`OUTSIDE FRAME ${line}`);
    for (const line of report.widthOverflow) console.log(`WIDTH OVERFLOW ${line}`);
    if (report.textOverflow.length || report.outside.length || report.widthOverflow.length || !stripOk) {
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
