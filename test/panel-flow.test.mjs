import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');

// Extract the pure helpers verbatim from the shipped source, then exercise
// them directly. No React, DOM, or panel rendering is emulated here.
const slice = (name) => {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n    }\n', start);
  assert.ok(start >= 0 && end > start, `helper ${name} found`);
  return source.slice(start, end + 8);
};
const module = vm.runInNewContext(`
  ${slice('listNoticeText')}
  ${slice('parseToolJson')}
  ${slice('readCommandCard')}
  ({ listNoticeText, parseToolJson, readCommandCard });
`);

test('list truncation notice shows only when loaded rows fall below total', () => {
  const t = (key, vars) => `${key} shown=${vars?.shown}`;
  assert.equal(module.listNoticeText(1731, 200, false, true, t), 'list.truncated shown=200');
  assert.equal(module.listNoticeText(1731, 200, true, true, t), null, 'loading hides the notice');
  assert.equal(module.listNoticeText(1731, 0, false, false, t), null, 'absent records hide the notice');
  assert.equal(module.listNoticeText(200, 200, false, true, t), null, 'complete list has no notice');
  assert.equal(module.listNoticeText(0, 0, false, true, t), null, 'empty product has no notice');
});

test('old command messages decode to mine/record cards with omissions explicit', () => {
  const old = 'demo-user 的未完成事项：Bug 2 个，需求 13 个\n'
    + '#101 [Bug] Title — with @mention — active @demo-user\n'
    + '#102 [Bug] Wrapped title\nactive text — active @demo-user\n'
    + '#101 [Story] Same number, different type — active/planned @demo-user\n'
    + '… 另有 12 个需求';
  const { data } = module.readCommandCard({ name: 'zentao-mine', outcome: { kind: 'success', text: old } });
  assert.equal(data.legacy, true);
  assert.equal(data.bugs.length, 2);
  assert.equal(data.bugs[0].title, 'Title — with @mention');
  assert.equal(data.bugs[1].title, 'Wrapped title active text');
  assert.equal(data.stories.length, 1);
  assert.equal(data.storyTotal, 13);
  assert.equal(data.stories[0].stage, 'planned');
  assert.equal(data.stories[0].pri, undefined);
  assert.equal(data.bugs[0].product, undefined);
});

test('old detail messages restore saved metadata; unknown formats fall back', () => {
  const detail = module.readCommandCard({
    name: 'zentao',
    outcome: { kind: 'success', text: '#101 [Bug] Title — active @demo-user\n产品 #7 · 优先级 2\n附件与内嵌图片 3 个\n摘要：Some text' },
  });
  assert.equal(detail.data.record.product, 7);
  assert.equal(detail.data.record.pri, '2');
  assert.equal(detail.data.fileCount, 3);
  assert.equal(detail.data.summary, 'Some text');
  assert.equal(module.readCommandCard({ name: 'zentao', outcome: { kind: 'success', text: 'demo-user：当前没有未完成的 Bug 或需求。' } }).data.bugTotal, 0);
  const unsupported = JSON.stringify({ format: 'zentao.command', version: 999, view: 'mine' });
  const fallback = module.readCommandCard({ name: 'zentao', outcome: { kind: 'success', text: unsupported } });
  assert.equal(fallback.state, 'fallback');
  assert.equal(fallback.text, unsupported);
  assert.equal(module.readCommandCard({ outcome: null }).state, 'pending');
  assert.equal(module.readCommandCard({ name: 'zentao', outcome: { kind: 'error', text: 'permission denied' } }).text, 'permission denied');
});

test('tool result JSON parses permissively and rejects non-JSON output', () => {
  const block = { content: [{ type: 'text', text: JSON.stringify({ ok: true, bugs: [{ id: 1 }] }) }] };
  const parsed = module.parseToolJson(block);
  // VM realm objects fail deepStrictEqual; compare structurally instead.
  assert.equal(parsed.ok, true);
  assert.equal(parsed.bugs.length, 1);
  assert.equal(parsed.bugs[0].id, 1);
  // A result whose text blocks don't join into valid JSON is rejected as a
  // whole — matching the real host, which always emits exactly one text block.
  const mixed = { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }, { type: 'text', text: ' trailer' }] };
  assert.equal(module.parseToolJson(mixed), null);
  assert.equal(module.parseToolJson({ content: [{ type: 'text', text: '<html>login page</html>' }] }), null);
  assert.equal(module.parseToolJson({ content: [] }), null);
  assert.equal(module.parseToolJson(null), null);
});
