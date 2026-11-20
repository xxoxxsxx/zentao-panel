import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import { apply, Config } from '../index.js';
import { ZenTaoClient } from '../zentao.js';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
// Exercise the shipped pure parser, not a reimplementation or a React/DOM mock.
const parserSource = source.slice(source.indexOf('    function readCommandCard('), source.indexOf('    // End command presentation model.'));
const decode = vm.runInNewContext(`${parserSource}\nreadCommandCard`);
const node = (text, name = 'zentao-mine', kind = 'success') => ({ kind: 'command', name, outcome: { kind, text } });
const record = (id, overrides = {}) => ({ id, title: `Ticket ${id}`, product: '7', status: 'active', stage: 'planned', assignedTo: 'demo-user', pri: '2', ...overrides });
const makeHost = () => {
  const commands = new Map();
  const ctx = {
    effect(fn) { return fn(); },
    webServer: { register() { return () => {}; } },
    connection: { requestRejection() {} }, tools: { register() { return () => {}; } },
    commands: { register(def) { commands.set(def.name, def); return () => commands.delete(def.name); } },
    systemPrompt: { section() { return () => {}; } },
    inject(_keys, fn) { fn(this); },
  };
  apply(ctx, Config['~standard'].validate({ baseURL: 'https://zentao.example.com', account: 'demo-user', password: 'fixture-only', allowWrites: false }).value);
  return commands;
};

test('commands persist structured snapshots that the commandview can decode', async (t) => {
  t.mock.method(ZenTaoClient.prototype, 'allProductBugs', async () => ({ bugs: [record(101), record(102, { assignedTo: 'other', openedBy: 'other' })] }));
  t.mock.method(ZenTaoClient.prototype, 'allProductStories', async () => ({ stories: Array.from({ length: 13 }, (_, i) => record(200 + i)) }));
  const result = await makeHost().get('zentao-mine').handler({});
  const restored = decode(node(result.text));
  assert.equal(restored.state, 'ready');
  assert.equal(restored.data.view, 'mine');
  assert.equal(restored.data.bugTotal, 1);
  assert.equal(restored.data.storyTotal, 13);
  assert.equal(restored.data.stories.length, 13);
  assert.equal(restored.data.bugs[0].pri, '2');
  assert.equal(restored.data.bugs[0].product, '7');
  assert.ok(!result.text.includes('fixture-only'));
});

test('snapshot bounds retain exact totals and omit unrelated raw fields', async (t) => {
  t.mock.method(ZenTaoClient.prototype, 'allProductBugs', async () => ({ bugs: Array.from({ length: 60 }, (_, i) => record(i + 1, { rawCredential: 'never-serialize', steps: '<p>large</p>' })) }));
  t.mock.method(ZenTaoClient.prototype, 'allProductStories', async () => ({ stories: [] }));
  const result = await makeHost().get('zentao-mine').handler({});
  const { data } = decode(node(result.text));
  assert.equal(data.bugTotal, 60);
  assert.equal(data.bugs.length, 50);
  assert.equal(data.storyTotal, 0);
  assert.ok(!result.text.includes('never-serialize'));
  assert.ok(!result.text.includes('large'));
});

test('partial failure is unknown, not a fabricated zero; total failure is an error', async (t) => {
  t.mock.method(ZenTaoClient.prototype, 'allProductBugs', async () => { throw new Error('service unavailable'); });
  const stories = t.mock.method(ZenTaoClient.prototype, 'allProductStories', async () => ({ stories: [] }));
  const commands = makeHost();
  const partial = decode(node((await commands.get('zentao-mine').handler({})).text));
  assert.equal(partial.data.bugTotal, null);
  assert.equal(partial.data.storyTotal, 0);
  assert.equal(partial.data.warnings.length, 1);
  stories.mock.mockImplementation(async () => { throw new Error('offline'); });
  const failed = await commands.get('zentao-mine').handler({});
  assert.equal(failed.kind, 'error');
  assert.equal(decode(node(failed.text, 'zentao-mine', failed.kind)).state, 'error');
});

test('/zentao detail stores a safe record card and validates usage', async (t) => {
  t.mock.method(ZenTaoClient.prototype, 'story', async () => ({ story: record(201, { spec: '<p>Acceptance text</p>' }), richFiles: [{ id: 17 }] }));
  const commands = makeHost();
  const result = await commands.get('zentao').handler({ rawInput: 'story 201' });
  const { data } = decode(node(result.text, 'zentao'));
  assert.equal(data.view, 'record');
  assert.equal(data.entity, 'story');
  assert.equal(data.record.id, 201);
  assert.equal(data.summary, 'Acceptance text');
  assert.equal(data.fileCount, 1);
  assert.equal((await commands.get('zentao').handler({ rawInput: 'abc' })).kind, 'error');
});

test('old text messages preserve counts, types, em-dashes, wrapped lines and omissions', () => {
  const old = 'demo-user 的未完成事项：Bug 2 个，需求 13 个\n'
    + '#101 [Bug] Title — with @mention — active @demo-user\n'
    + '#102 [Bug] Wrapped title\nactive text — active @demo-user\n'
    + '#101 [Story] Same number, different type — active/planned @demo-user\n'
    + '… 另有 12 个需求';
  const { data } = decode(node(old));
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

test('old empty and detail messages have safe fallbacks; unknown schemas retain original', () => {
  assert.equal(decode(node('demo-user：当前没有未完成的 Bug 或需求。')).data.bugTotal, 0);
  const detail = decode(node('#101 [Bug] Title — active @demo-user\n产品 #7 · 优先级 2\n摘要：Some text', 'zentao'));
  assert.equal(detail.data.record.product, 7);
  assert.equal(detail.data.summary, 'Some text');
  assert.equal(detail.data.record.pri, '2');
  const unsupported = JSON.stringify({ format: 'zentao.command', version: 999, view: 'mine' });
  assert.equal(decode(node(unsupported)).state, 'fallback');
  assert.equal(decode(node(unsupported)).text, unsupported);
  assert.equal(decode(node('unrecognizable text')).state, 'fallback');
  assert.equal(decode({ outcome: null }).state, 'pending');
  assert.equal(decode(node('permission denied', 'zentao', 'error')).text, 'permission denied');
});

test('partial per-product reads keep returned rows but expose unknown account totals', async (t) => {
  t.mock.method(ZenTaoClient.prototype, 'products', async () => [{ id: 1 }, { id: 2 }]);
  t.mock.method(ZenTaoClient.prototype, 'getJson', async (path) => {
    if (path.startsWith('/products/2/')) return { status: 'fail' };
    return path.includes('/bugs?') ? { status: 'success', bugs: [record(101)], pager: { recTotal: 1 } }
      : { status: 'success', stories: [record(201)], pager: { recTotal: 1100 } };
  });
  const result = await makeHost().get('zentao-mine').handler({});
  const { data } = decode(node(result.text));
  assert.equal(data.bugTotal, null);
  assert.equal(data.storyTotal, null);
  assert.equal(data.bugs.length, 1);
  assert.equal(data.stories.length, 1);
  assert.equal(data.warnings.length, 2);
});

test('detail summaries explicitly mark truncation and ignore invalid bug responses', async (t) => {
  t.mock.method(ZenTaoClient.prototype, 'bug', async () => ({ bug: {} }));
  t.mock.method(ZenTaoClient.prototype, 'story', async () => ({ story: record(201, { spec: `<p>${'x'.repeat(260)}</p>` }) }));
  const result = await makeHost().get('zentao').handler({ rawInput: '201' });
  const { data } = decode(node(result.text, 'zentao'));
  assert.equal(data.entity, 'story');
  assert.equal(data.summary, 'x'.repeat(240) + '…');
});

test('real client entry registers both command names in the commandview seat and injects navigation', () => {
  let definition;
  // Load only the module registration and apply; no rendering or React emulation.
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(def) { definition = def; } } } });
  const plugin = definition.factory(() => ({}));
  const registrations = [];
  const navigations = [];
  const ctx = {
    effect(fn) { return fn(); },
    locale: { register() {}, bind() { return (key) => key; } },
    layout: { selectPanel(id) { navigations.push(id); } },
    slots: {
      inject(_name, callback) { const value = callback(); if (value?.next) { for (const _ of value) { /* exhaust registrations */ } } },
      register(options) { registrations.push(options); return () => {}; },
    },
  };
  plugin.apply(ctx);
  const commands = registrations.filter((item) => item.name === 'conversation.chat.commandview');
  assert.deepEqual(commands.map((item) => item.key), ['zentao', 'zentao-mine']);
  const tools = registrations.filter((item) => item.name === 'tool.call.toolview');
  assert.equal(tools.length, 4);
  commands[1].inject().openRecord({ entity: 'bug', id: 101, product: 7 });
  assert.deepEqual(navigations, ['zentao']);
  assert.ok(registrations.some((item) => item.name === 'main'));
});
