import { ZenTaoClient, ROUTE_PREFIX } from './zentao.js';

const name = 'zentao-panel';

/** The route carrier, the trust fence guarding every route, and the tool registry. */
const inject = ['webServer', 'connection', 'tools', 'configEditor'];

/** Connection-setting defaults applied when the user has not configured anything. */
const CONNECTION_DEFAULTS = {
  baseURL: '',
  account: '',
  password: '',
  allowWrites: false,
};

/**
 * Minimal Standard-Schema wrapper validated by the cordis runtime: fills
 * defaults and enforces field types without pulling in schemastery. Config
 * edits reload the plugin (non-volatile), which re-applies the connection.
 */
const Config = {
  '~standard': {
    version: 1,
    vendor: 'zentao-panel',
    validate(value) {
      const input = typeof value === 'object' && value !== null ? value : {};
      const out = { ...CONNECTION_DEFAULTS };
      if (typeof input.baseURL === 'string') out.baseURL = input.baseURL;
      if (typeof input.account === 'string') out.account = input.account;
      if (typeof input.password === 'string') out.password = input.password;
      if (typeof input.allowWrites === 'boolean') out.allowWrites = input.allowWrites;
      return { value: out };
    },
  },
};

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGE_BUGS = 200;
/** Per-account tool call budget per process hour (write operations stay out of scope). */
const TOOL_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 240 };

/** JSON response helper (no-store: bug data is live). */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** 405 with the route's supported methods. */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader('allow', allow);
  res.end();
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling. */
async function readBoundedBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

/** Parse one proxy-request body; null when malformed or oversized in shape. */
function parseProxyBody(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  if (typeof body.action !== 'string') return null;
  const args = body.args;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) return null;
  return { action: body.action, args: args ?? {} };
}

/** Bounded 5xx text for proxy/image failures; never echo credentials or tokens. */
function describeError(error) {
  const status = typeof error?.status === 'number' ? ` (HTTP ${error.status})` : '';
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('token') ? '禅道请求失败：认证信息异常' : `${message}${status}`;
}

/** Host half: proxy routes for the browser panel plus read-only agent tools. */
function apply(ctx, config) {
  const client = new ZenTaoClient();

  /** Push the resolved config snapshot into the client. */
  const snapshot = {
    baseURL: config.baseURL,
    account: config.account,
    password: config.password,
  };
  if (snapshot.baseURL && snapshot.account && snapshot.password) {
    try { client.configure(snapshot); } catch { /* surfaced through connection status */ }
  }

  /** Connection state for the panel (never includes the password). */
  const connectionStatus = () => ({
    configured: client.configured,
    baseURL: client.displayBase,
    account: client.credentials?.account ?? null,
    allowWrites: Boolean(config.allowWrites),
  });

  /** Sliding-window per-process rate limit for agent tool calls. */
  const callTimes = [];
  function toolBudgetExceeded() {
    const now = Date.now();
    while (callTimes.length > 0 && now - callTimes[0] > TOOL_RATE_LIMIT.windowMs) callTimes.shift();
    if (callTimes.length >= TOOL_RATE_LIMIT.max) return true;
    callTimes.push(now);
    return false;
  }

  /** One proxy action resolved against the ZenTao client. */
  async function runAction(action, args) {
    switch (action) {
      case 'connection':
        return { ok: true, connection: connectionStatus() };
      case 'saveConnection': {
        const candidate = { baseURL: String(args.baseURL ?? ''), account: String(args.account ?? ''), password: String(args.password ?? '') };
        // Prove the candidate credentials on a scratch client first; only then
        // commit them (and optionally persist) so a failed save never poisons
        // the working connection.
        const probe = new ZenTaoClient();
        try {
          probe.configure(candidate);
          await probe.token();
        } catch (error) {
          return { ok: false, code: 'login-failed', message: describeError(error) };
        }
        client.configure(candidate);
        // Persist the new connection through the host config editor when available.
        // `inherited` holds values from lower layers; keep them where the form left a field blank.
        const editor = ctx.configEditor;
        if (editor !== undefined && ctx.fiber?.entry !== undefined) {
          try {
            await editor.edit(ctx.fiber.entry, (current, inherited) => {
              const next = { ...inherited, ...current };
              next.baseURL = candidate.baseURL;
              next.account = candidate.account;
              next.allowWrites = Boolean(args.allowWrites);
              if (candidate.password !== '') next.password = candidate.password;
              return next;
            });
          } catch (error) {
            return { ok: false, code: 'save-failed', message: `连接已生效但配置保存失败：${describeError(error)}` };
          }
        }
        return { ok: true, connection: { ...connectionStatus(), allowWrites: Boolean(args.allowWrites) } };
      }
      case 'users': {
        if (!client.configured) return { ok: false, code: 'not-configured', message: '尚未配置禅道连接' };
        return { ok: true, users: await client.users() };
      }
      case 'products':
        return { ok: true, products: await client.products() };
      case 'productBugs': {
        const browseType = args.browseType === 'all' ? 'all' : 'unresolved';
        if (args.productId === 'all') {
          const page = await client.allProductBugs(browseType);
          return { ok: true, total: page.total, bugs: page.bugs.slice(0, MAX_PAGE_BUGS) };
        }
        const productId = Number(args.productId);
        if (!Number.isInteger(productId) || productId <= 0) return { ok: false, code: 'bad-request', message: 'productId 必须是正整数或 "all"' };
        const page = await client.productBugs(productId, browseType);
        return { ok: true, total: page.total, bugs: page.bugs.slice(0, MAX_PAGE_BUGS) };
      }
      case 'bug': {
        const bugId = Number(args.bugId);
        if (!Number.isInteger(bugId) || bugId <= 0) return { ok: false, code: 'bad-request', message: 'bugId 必须是正整数' };
        const detail = await client.bug(bugId);
        return { ok: true, ...detail };
      }
      case 'productStories': {
        const browseType = args.browseType === 'all' ? 'all' : 'unclosed';
        if (args.productId === 'all') {
          const page = await client.allProductStories(browseType);
          return { ok: true, total: page.total, stories: page.stories.slice(0, MAX_PAGE_BUGS) };
        }
        const productId = Number(args.productId);
        if (!Number.isInteger(productId) || productId <= 0) return { ok: false, code: 'bad-request', message: 'productId 必须是正整数或 "all"' };
        const page = await client.productStories(productId, browseType);
        return { ok: true, total: page.total, stories: page.stories.slice(0, MAX_PAGE_BUGS) };
      }
      case 'story': {
        const storyId = Number(args.storyId);
        if (!Number.isInteger(storyId) || storyId <= 0) return { ok: false, code: 'bad-request', message: 'storyId 必须是正整数' };
        const detail = await client.story(storyId);
        return { ok: true, ...detail };
      }
      case 'fileMeta': {
        const fileId = Number(args.fileId);
        if (!Number.isInteger(fileId) || fileId <= 0) return { ok: false, code: 'bad-request', message: 'fileId 必须是正整数' };
        return { ok: true, file: await client.fileMeta(fileId) };
      }
      // --- Write operations (guarded by the allowWrites switch) ---
      case 'write': {
        if (!client.configured) return { ok: false, code: 'not-configured', message: '尚未配置禅道连接' };
        if (!config.allowWrites) return { ok: false, code: 'writes-disabled', message: '写操作未启用：请在连接设置中开启「允许写操作」后保存' };
        const kind = args.kind === 'story' ? 'story' : args.kind === 'bug' ? 'bug' : null;
        const recordId = Number(args.id);
        if (!kind || !Number.isInteger(recordId) || recordId <= 0) return { ok: false, code: 'bad-request', message: 'kind 必须是 bug 或 story，id 必须是正整数' };
        const op = String(args.op ?? '');
        const comment = typeof args.comment === 'string' ? args.comment.trim() : '';
        const requireCommentFor = new Set(['resolve', 'close', 'activate']);
        if (requireCommentFor.has(op) && !comment) return { ok: false, code: 'bad-request', message: '该操作需要填写备注说明原因' };
        try {
          let snapshot;
          if (kind === 'bug') {
            if (op === 'assign') {
              const assignedTo = String(args.assignedTo ?? '').trim();
              if (!assignedTo) return { ok: false, code: 'bad-request', message: 'assign 需要 assignedTo 账号' };
              snapshot = await client.assignBug(recordId, assignedTo, comment || undefined);
            } else if (op === 'resolve') {
              snapshot = await client.resolveBug(recordId, {
                resolution: String(args.resolution ?? 'fixed'),
                duplicateBug: args.duplicateBug !== undefined ? Number(args.duplicateBug) : undefined,
                comment,
              });
            } else if (op === 'close') {
              snapshot = await client.closeBug(recordId, comment);
            } else if (op === 'activate') {
              snapshot = await client.activateBug(recordId, { assignedTo: args.assignedTo ? String(args.assignedTo).trim() : undefined, comment });
            } else if (op === 'comment') {
              await client.addComment('bug', recordId, comment);
              snapshot = null;
            } else {
              return { ok: false, code: 'bad-request', message: `未知 Bug 操作：${op}` };
            }
          } else {
            if (op === 'assign') {
              const assignedTo = String(args.assignedTo ?? '').trim();
              if (!assignedTo) return { ok: false, code: 'bad-request', message: 'assign 需要 assignedTo 账号' };
              snapshot = await client.assignStory(recordId, assignedTo, comment || undefined);
            } else if (op === 'close') {
              snapshot = await client.closeStory(recordId, { closedReason: String(args.closedReason ?? 'done'), comment });
            } else if (op === 'activate') {
              snapshot = await client.activateStory(recordId, { assignedTo: args.assignedTo ? String(args.assignedTo).trim() : undefined, comment });
            } else if (op === 'comment') {
              await client.addComment('story', recordId, comment);
              snapshot = null;
            } else {
              return { ok: false, code: 'bad-request', message: `未知需求操作：${op}` };
            }
          }
          return { ok: true, snapshot };
        } catch (error) {
          return { ok: false, code: 'write-failed', message: describeError(error) };
        }
      }
      default:
        return { ok: false, code: 'unknown-action', message: `未知操作：${action}` };
    }
  }

  // --- Browser proxy routes (behind the connection trust fence) ---

  /** Answer an untrusted/unauthenticated request; true when it was rejected. */
  const rejected = (req, res) => {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection === undefined) return false;
    res.statusCode = rejection;
    res.end();
    return true;
  };

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      if (rejected(req, res)) return;
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST');
        return;
      }
      if (String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        sendJson(res, 415, { ok: false, code: 'unsupported-media-type', message: 'content-type 必须是 application/json' });
        return;
      }
      let text;
      try {
        text = await readBoundedBody(req);
      } catch {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: '请求体不可读' });
        return;
      }
      if (text === null) {
        sendJson(res, 413, { ok: false, code: 'payload-too-large', message: '请求体过大' });
        return;
      }
      const parsed = parseProxyBody(text);
      if (parsed === null) {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: '请求体必须是 { action, args? } JSON' });
        return;
      }
      try {
        sendJson(res, 200, await runAction(parsed.action, parsed.args));
      } catch (error) {
        sendJson(res, 502, { ok: false, code: 'upstream-failed', message: describeError(error) });
      }
    },
  }), 'zentao-panel: POST /zentao-api');

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: `${ROUTE_PREFIX}/file/`,
    handler: async (req, res) => {
      if (rejected(req, res)) return;
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET');
        return;
      }
      const id = new URL(String(req.url), 'http://localhost').pathname.slice(ROUTE_PREFIX.length + '/file/'.length);
      if (!/^\d+$/.test(id)) {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: '文件 ID 必须是数字' });
        return;
      }
      const meta = await client.fileMeta(id).catch(() => null);
      const ext = meta?.extension ? String(meta.extension).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) : '';
      const kind = ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'bmp' ? 'preview' : 'download';
      try {
        const file = kind === 'preview'
          ? await client.getBinary(`/files/${id}/preview?fileID=${id}`)
          : await client.getBinary(`/files/${id}/download`);
        res.statusCode = 200;
        res.setHeader('content-type', file.contentType);
        res.setHeader('cache-control', 'private, max-age=600');
        if (file.fileName) res.setHeader('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
        res.end(file.bytes);
      } catch (error) {
        sendJson(res, 502, { ok: false, code: 'upstream-failed', message: describeError(error) });
      }
    },
  }), 'zentao-panel: GET /zentao-api/file/<id>');

  // --- Agent tools: one operation, same client, read-only ---

  const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];
  const presentCall = (title) => () => ({ card: 'generic', kind: 'read', title });

  ctx.effect(() => ctx.tools.register({
    name: 'zentao_connection',
    description: '查看禅道面板的连接状态：已配置的服务器地址、账号、是否允许写操作。配置在面板的连接设置里维护。',
    parameters: {},
    output: { schema: { description: '禅道连接状态' }, render: renderJson },
    async execute() {
      if (toolBudgetExceeded()) throw new Error('禅道工具调用超出本小时限额，请稍后再试');
      const result = runAction('connection', {});
      return result;
    },
    presentCall: presentCall('Check ZenTao connection'),
    isConcurrencySafe: () => true,
  }), 'zentao-panel: tool zentao_connection');

  ctx.effect(() => ctx.tools.register({
    name: 'zentao_products',
    description: '列出禅道上当前账号可见的全部产品（id、名称、代号、状态）。查询禅道 Bug 前先调用本工具获取产品列表。',
    parameters: {},
    output: { schema: { description: '禅道产品列表查询结果' }, render: renderJson },
    async execute() {
      if (toolBudgetExceeded()) throw new Error('禅道工具调用超出本小时限额，请稍后再试');
      const result = await runAction('products', {});
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    presentCall: presentCall('List ZenTao products'),
    isConcurrencySafe: () => true,
  }), 'zentao-panel: tool zentao_products');

  ctx.effect(() => ctx.tools.register({
    name: 'zentao_bugs',
    description: '列出一个禅道产品下的 Bug（默认未关闭），返回编号、标题、状态、严重程度、优先级、负责人等摘要字段。需要 productId；可选 browseType: "unresolved"(默认) 或 "all"。',
    parameters: {
      productId: { type: 'integer', description: '产品 ID，来自 zentao_products', required: true },
      browseType: { type: 'string', enum: ['unresolved', 'all'], description: '查询范围：未关闭或全部' },
    },
    output: { schema: { description: '禅道 Bug 列表查询结果' }, render: renderJson },
    async execute(args) {
      if (toolBudgetExceeded()) throw new Error('禅道工具调用超出本小时限额，请稍后再试');
      const result = await runAction('productBugs', args);
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    presentCall: presentCall('List ZenTao bugs'),
    isConcurrencySafe: () => true,
  }), 'zentao-panel: tool zentao_bugs');

  ctx.effect(() => ctx.tools.register({
    name: 'zentao_bug',
    description: '读取一个禅道 Bug 的完整详情：描述与复现步骤（HTML）、状态流转字段，以及内嵌图片和正式附件的文件 ID 列表（embeddedFileIds）。之后可用 zentao_file 元数据接口确认文件名，或通过面板图片代理 /zentao-api/file/<fileId> 下载查看。',
    parameters: {
      bugId: { type: 'integer', description: 'Bug 编号', required: true },
    },
    output: { schema: { description: '禅道 Bug 详情' }, render: renderJson },
    async execute(args) {
      if (toolBudgetExceeded()) throw new Error('禅道工具调用超出本小时限额，请稍后再试');
      const result = await runAction('bug', args);
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    presentCall: presentCall('Read ZenTao bug detail'),
    isConcurrencySafe: () => true,
  }), 'zentao-panel: tool zentao_bug');

  ctx.effect(() => ctx.tools.register({
    name: 'zentao_stories',
    description: '列出一个禅道产品下的研发需求（默认未关闭），返回编号、标题、状态、阶段、优先级、类型、负责人等摘要字段。需要 productId；可选 browseType: "unclosed"(默认) 或 "all"。',
    parameters: {
      productId: { type: 'integer', description: '产品 ID，来自 zentao_products', required: true },
      browseType: { type: 'string', enum: ['unclosed', 'all'], description: '查询范围：未关闭或全部' },
    },
    output: { schema: { description: '禅道研发需求列表查询结果' }, render: renderJson },
    async execute(args) {
      if (toolBudgetExceeded()) throw new Error('禅道工具调用超出本小时限额，请稍后再试');
      const result = await runAction('productStories', args);
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    presentCall: presentCall('List ZenTao stories'),
    isConcurrencySafe: () => true,
  }), 'zentao-panel: tool zentao_stories');

  ctx.effect(() => ctx.tools.register({
    name: 'zentao_story',
    description: '读取一个禅道研发需求的完整详情：需求描述（spec，HTML）、验收标准（verify，HTML）、状态流转字段，以及内嵌图片和正式附件的文件 ID 列表（embeddedFileIds）。之后可用 zentao_file 元数据接口确认文件名，或通过面板图片代理 /zentao-api/file/<fileId> 下载查看。',
    parameters: {
      storyId: { type: 'integer', description: '需求编号', required: true },
    },
    output: { schema: { description: '禅道研发需求详情' }, render: renderJson },
    async execute(args) {
      if (toolBudgetExceeded()) throw new Error('禅道工具调用超出本小时限额，请稍后再试');
      const result = await runAction('story', args);
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    presentCall: presentCall('Read ZenTao story detail'),
    isConcurrencySafe: () => true,
  }), 'zentao-panel: tool zentao_story');

  ctx.effect(() => ctx.tools.register({
    name: 'zentao_file',
    description: '读取一个禅道附件/图片的元数据（文件名、扩展名、所属对象）。注意：本实例该接口的 size 字段含义不可靠，工具永远不返回它。',
    parameters: {
      fileId: { type: 'integer', description: '文件 ID（来自 Bug 详情的 embeddedFileIds）', required: true },
    },
    output: { schema: { description: '禅道文件元数据' }, render: renderJson },
    async execute(args) {
      if (toolBudgetExceeded()) throw new Error('禅道工具调用超出本小时限额，请稍后再试');
      const result = await runAction('fileMeta', args);
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    presentCall: presentCall('Read ZenTao file metadata'),
    isConcurrencySafe: () => true,
  }), 'zentao-panel: tool zentao_file');
}

export { name, inject, apply, Config };
