import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loaderSource() {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script>\s*(globalThis\.__FRONTLINE_RELEASE__[\s\S]*?)<\/script>/u);
  assert.ok(match, 'asset loader script must exist');
  return match[1];
}

function loaderContext(pathname, loadDecision) {
  const requested = [];
  const context = {
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    location: {
      href: `https://example.com${pathname}`,
      origin: 'https://example.com',
      pathname
    },
    document: {
      querySelector() { return null; },
      createElement() {
        return {
          dataset: {},
          remove() {},
          set href(value) { this._href = value; },
          get href() { return this._href; }
        };
      },
      head: {
        appendChild(link) {
          requested.push(link.href);
          queueMicrotask(() => loadDecision(link.href) ? link.onload?.() : link.onerror?.());
        }
      }
    }
  };
  context.globalThis = context;
  return { context, requested };
}

test('asset loader starts with the current application-relative stylesheet', async () => {
  const source = await loaderSource();
  const { context, requested } = loaderContext('/Mypractice/frontline-roads/', () => true);
  vm.runInNewContext(source, context);
  await context.__FRONTLINE_STYLES_READY__;
  context.__FRONTLINE_BOOT_COMPLETE__();
  assert.equal(requested.length, 1);
  assert.equal(requested[0], 'https://example.com/Mypractice/frontline-roads/src/styles/app.css?v=0.33.3');
});

test('asset loader recovers a legacy fr path through the canonical frontline-roads directory', async () => {
  const source = await loaderSource();
  const { context, requested } = loaderContext('/Mypractice/fr/', href => href.includes('/frontline-roads/'));
  vm.runInNewContext(source, context);
  await context.__FRONTLINE_STYLES_READY__;
  context.__FRONTLINE_BOOT_COMPLETE__();
  assert.deepEqual(requested, [
    'https://example.com/Mypractice/fr/src/styles/app.css?v=0.33.3',
    'https://example.com/Mypractice/frontline-roads/src/styles/app.css?v=0.33.3'
  ]);
});
