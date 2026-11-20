import { join } from 'node:path';

/** Prefix all proxy routes live under. */
const ROUTE_PREFIX = '/zentao-api';

/** Default connection, used until the user configures their own in the panel. */
const DEFAULT_BASE = '';

/**
 * Build the REST v2 base URL from a user-facing server root. Accepts forms like
 * `zentao.example.com/zentao`, `http://host/zentao/`, or a full api.php/v2 URL.
 */
function normalizeBase(input) {
  const raw = String(input ?? '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('禅道地址不能为空');
  if (/\/api\.php\/v\d+$/.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return `${raw}/api.php/v2`;
  return `http://${raw}/api.php/v2`;
}

/** Merge one rich-text field's file-read references into an id→info map. */
function extractRichFiles(map, html) {
  for (const m of String(html ?? '').matchAll(/(?:\/zentao)?\/file-read-(\d+)\.([A-Za-z0-9]+)/gi)) {
    const id = Number(m[1]);
    if (!map.has(id)) map.set(id, { id, extension: m[2].toLowerCase(), title: null });
  }
}

/**
 * ZenTao REST v2 client driven by user-configured credentials: one cached
 * short-lived token, GET reads, JSON writes, and binary file downloads.
 */
class ZenTaoClient {
  constructor() {
    this.base = DEFAULT_BASE;
    this.credentials = null;
    this.tokenPromise = null;
    this.tokenIssuedAt = 0;
    this.tokenMaxAgeMs = 8 * 60 * 1000;
    this.maxPayloadBytes = 20 * 1024 * 1024;
  }

  /** Apply a new connection config; drops the cached token when the target changed. */
  configure({ baseURL, account, password } = {}) {
    const base = normalizeBase(baseURL);
    const nextCredentials = { account: String(account ?? '').trim(), password: String(password ?? '') };
    if (!nextCredentials.account || !nextCredentials.password) {
      throw new Error('禅道账号和密码不能为空');
    }
    const changed = base !== this.base
      || this.credentials?.account !== nextCredentials.account
      || this.credentials?.password !== nextCredentials.password;
    this.base = base;
    this.credentials = nextCredentials;
    if (changed) this.invalidateToken();
  }

  /** Whether usable credentials are configured. */
  get configured() {
    return Boolean(this.credentials?.account && this.credentials?.password);
  }

  /** The connected server root (without the api.php/v2 suffix) for display. */
  get displayBase() {
    return this.base.replace(/\/api\.php\/v\d+$/, '');
  }

  /** Ensure credentials and a fresh token; single-flight, invalidate once on 401. */
  async token() {
    if (!this.configured) throw new Error('尚未配置禅道连接：请在面板设置中填写地址、账号和密码');
    if (this.tokenPromise && Date.now() - this.tokenIssuedAt < this.tokenMaxAgeMs) return this.tokenPromise;
    this.tokenPromise = (async () => {
      const response = await fetch(`${this.base}/users/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ account: this.credentials.account, password: this.credentials.password }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`禅道登录失败：HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.status !== 'success' || typeof payload.token !== 'string') {
        throw new Error('禅道登录失败：账号或密码不正确');
      }
      this.tokenIssuedAt = Date.now();
      return payload.token;
    })();
    try {
      return await this.tokenPromise;
    } catch (error) {
      this.tokenPromise = null;
      throw error;
    }
  }

  /** Invalidate the cached token after a 401 so the next call re-authenticates once. */
  invalidateToken() {
    this.tokenPromise = null;
    this.tokenIssuedAt = 0;
  }

  /** One authenticated GET returning parsed JSON; re-authenticates once on 401. */
  async getJson(path) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.token();
      const response = await fetch(`${this.base}${path}`, {
        headers: { token, accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 401 && attempt === 0) {
        this.invalidateToken();
        continue;
      }
      if (!response.ok) {
        const error = new Error(`禅道请求失败：GET ${path} → HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const contentType = String(response.headers.get('content-type') ?? '');
      if (!contentType.includes('json')) {
        throw new Error(`禅道返回了非 JSON 响应（${contentType || '未知类型'}），已按规则拒绝网页回退`);
      }
      return response.json();
    }
    throw new Error(`禅道请求失败：GET ${path} → 401（重新认证后仍失败）`);
  }

  /** One authenticated JSON write (POST) returning parsed JSON; re-authenticates once on 401. */
  async postJson(path, body) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.token();
      const response = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: { token, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 401 && attempt === 0) {
        this.invalidateToken();
        continue;
      }
      if (!response.ok) {
        const error = new Error(`禅道请求失败：POST ${path} → HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const contentType = String(response.headers.get('content-type') ?? '');
      if (!contentType.includes('json')) {
        throw new Error(`禅道返回了非 JSON 响应（${contentType || '未知类型'}）`);
      }
      const payload = await response.json();
      if (payload && payload.status === 'fail') {
        throw new Error(`禅道操作失败：${Array.isArray(payload.message) ? payload.message.join('；') : payload.message ?? '未知错误'}`);
      }
      return payload;
    }
    throw new Error(`禅道请求失败：POST ${path} → 401（重新认证后仍失败）`);
  }

  /** One authenticated GET returning binary bytes plus the upstream content type. */
  async getBinary(path) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.token();
      const response = await fetch(`${this.base}${path}`, {
        headers: { token, accept: '*/*' },
        signal: AbortSignal.timeout(60000),
      });
      if (response.status === 401 && attempt === 0) {
        this.invalidateToken();
        continue;
      }
      if (!response.ok) {
        const error = new Error(`禅道文件读取失败：GET ${path} → HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > this.maxPayloadBytes) {
        throw new Error(`附件超过 ${Math.round(this.maxPayloadBytes / 1024 / 1024)}MB 上限，未下载`);
      }
      const disposition = String(response.headers.get('content-disposition') ?? '');
      const nameMatch = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
      let fileName = null;
      if (nameMatch?.[1]) {
        const raw = nameMatch[1].trim();
        try {
          fileName = decodeURIComponent(raw);
        } catch {
          fileName = raw;
        }
      }
      return {
        bytes: buffer,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        fileName,
      };
    }
    throw new Error(`禅道文件读取失败：GET ${path} → 401（重新认证后仍失败）`);
  }

  /** Every visible product (paged, up to a sane cap). */
  async products() {
    const page = await this.getJson('/products?recPerPage=1000&pageID=1');
    const products = Array.isArray(page.products) ? page.products : [];
    return products.map((p) => ({ id: p.id, name: p.name, code: p.code ?? null, status: p.status ?? null, order: p.order ?? null }));
  }

  /** Bugs of one product (browseType: unresolved | all). */
  async productBugs(productId, browseType = 'unresolved') {
    const type = browseType === 'all' ? 'all' : 'unresolved';
    const page = await this.getJson(`/products/${encodeURIComponent(String(productId))}/bugs?browseType=${type}&orderBy=id_desc&recPerPage=1000&pageID=1`);
    return this.bugList(page);
  }

  /** Bugs across every visible product, merged newest-first. */
  async allProductBugs(browseType = 'unresolved') {
    const type = browseType === 'all' ? 'all' : 'unresolved';
    const products = await this.products();
    const pages = await Promise.all(products.map(async (product) => {
      try {
        const page = await this.getJson(`/products/${encodeURIComponent(String(product.id))}/bugs?browseType=${type}&orderBy=id_desc&recPerPage=1000&pageID=1`);
        if (page?.status === 'fail' || !Array.isArray(page.bugs)) throw new Error('Invalid product result');
        const normalized = this.bugList(page);
        return { ...normalized, incompleteProductId: Number(page.pager?.recTotal ?? normalized.total) > normalized.bugs.length ? product.id : null };
      } catch {
        // Preserve partial results and expose their incompleteness to callers.
        return { total: 0, bugs: [], failedProductId: product.id };
      }
    }));
    const bugs = pages.flatMap((page) => page.bugs).sort((a, b) => Number(b.id) - Number(a.id));
    return {
      total: pages.reduce((sum, page) => sum + Number(page.total), 0), bugs,
      failedProductIds: pages.flatMap((page) => page.failedProductId == null ? [] : [page.failedProductId]),
      incompleteProductIds: pages.flatMap((page) => page.incompleteProductId == null ? [] : [page.incompleteProductId]),
    };
  }

  /** Stories of one product (browseType: unclosed | all; "unresolved" is a bug-only value). */
  async productStories(productId, browseType = 'unclosed') {
    const type = browseType === 'all' ? 'all' : 'unclosed';
    const page = await this.getJson(`/products/${encodeURIComponent(String(productId))}/stories?browseType=${type}&orderBy=id_desc&recPerPage=1000&pageID=1`);
    if (page && page.status === 'fail') throw new Error(`禅道请求失败：${page.message ?? '产品不存在'}`);
    const stories = Array.isArray(page.stories) ? page.stories : [];
    return {
      total: page.pager?.recTotal ?? stories.length,
      stories: stories.map((story) => this.storySummary(story)),
    };
  }

  /** Stories across every visible product, merged newest-first. */
  async allProductStories(browseType = 'unclosed') {
    const type = browseType === 'all' ? 'all' : 'unclosed';
    const products = await this.products();
    const pages = await Promise.all(products.map(async (product) => {
      try {
        const page = await this.getJson(`/products/${encodeURIComponent(String(product.id))}/stories?browseType=${type}&orderBy=id_desc&recPerPage=1000&pageID=1`);
        if (page?.status === 'fail' || !Array.isArray(page.stories)) throw new Error('Invalid product result');
        const stories = page.stories;
        const total = Number(page.pager?.recTotal ?? stories.length);
        return { total, stories: stories.map((story) => this.storySummary(story)), incompleteProductId: total > stories.length ? product.id : null };
      } catch {
        return { total: 0, stories: [], failedProductId: product.id };
      }
    }));
    const stories = pages.flatMap((page) => page.stories).sort((a, b) => Number(b.id) - Number(a.id));
    return {
      total: pages.reduce((sum, page) => sum + Number(page.total), 0), stories,
      failedProductIds: pages.flatMap((page) => page.failedProductId == null ? [] : [page.failedProductId]),
      incompleteProductIds: pages.flatMap((page) => page.incompleteProductId == null ? [] : [page.incompleteProductId]),
    };
  }

  /** One story's full detail, with embedded file ids extracted from rich text. */
  async story(storyId) {
    const payload = await this.getJson(`/stories/${encodeURIComponent(String(storyId))}`);
    if (payload && payload.status === 'fail') throw new Error(`禅道请求失败：${payload.message ?? '需求不存在'}`);
    const story = payload.story ?? payload;
    const richFiles = new Map();
    for (const field of ['spec', 'verify', 'comment']) {
      if (typeof story[field] === 'string') extractRichFiles(richFiles, story[field]);
    }
    const attachments = [];
    const files = story.files && typeof story.files === 'object' && !Array.isArray(story.files) ? story.files : {};
    for (const key of Object.keys(files)) {
      if (!/^\d+$/.test(key)) continue;
      const file = files[key] ?? {};
      attachments.push({ id: Number(key), title: file.title ?? file.name ?? null, extension: file.extension ?? null });
      richFiles.set(Number(key), { id: Number(key), extension: file.extension != null ? String(file.extension).toLowerCase() : null, title: file.title ?? file.name ?? null });
    }
    return {
      story: {
        ...this.storySummary(story),
        spec: typeof story.spec === 'string' ? story.spec : null,
        verify: typeof story.verify === 'string' ? story.verify : null,
      },
      embeddedFileIds: [...richFiles.keys()].sort((a, b) => a - b),
      attachments,
      richFiles: [...richFiles.values()],
    };
  }

  /** One bug's full detail, with embedded file ids extracted from rich text. */
  async bug(bugId) {
    const payload = await this.getJson(`/bugs/${encodeURIComponent(String(bugId))}`);
    const bug = payload.bug ?? payload;
    const richFiles = new Map();
    for (const field of ['steps', 'description', 'comment', 'result', 'feedback']) {
      if (typeof bug[field] === 'string') extractRichFiles(richFiles, bug[field]);
    }
    const attachments = [];
    const files = bug.files && typeof bug.files === 'object' ? bug.files : {};
    for (const key of Object.keys(files)) {
      if (!/^\d+$/.test(key)) continue;
      const file = files[key] ?? {};
      attachments.push({ id: Number(key), title: file.title ?? null, extension: file.extension ?? null });
      richFiles.set(Number(key), { id: Number(key), extension: file.extension != null ? String(file.extension).toLowerCase() : null, title: file.title ?? null });
    }
    return {
      bug: this.bugSummary(bug),
      embeddedFileIds: [...richFiles.keys()].sort((a, b) => a - b),
      attachments,
      richFiles: [...richFiles.values()],
    };
  }

  /** File metadata (never expose the `size` field of this instance). */
  async fileMeta(fileId) {
    const payload = await this.getJson(`/files/${encodeURIComponent(String(fileId))}`);
    const file = payload.file ?? payload;
    return {
      id: file.id ?? Number(fileId),
      title: file.title ?? null,
      extension: file.extension ?? null,
      objectType: file.objectType ?? null,
      objectID: file.objectID ?? null,
    };
  }

  /** One bug record projected to summary fields. */
  bugSummary(bug) {
    const account = (value) => (typeof value === 'string' ? value : value?.account ?? null);
    return {
      id: bug.id,
      product: bug.product ?? null,
      title: bug.title ?? '',
      status: bug.status ?? null,
      severity: bug.severity ?? null,
      pri: bug.pri ?? null,
      assignedTo: account(bug.assignedTo),
      assignedDate: bug.assignedDate ?? null,
      deadline: bug.deadline ?? null,
      openedBy: account(bug.openedBy) ?? null,
      openedDate: bug.openedDate ?? null,
      resolution: bug.resolution ?? null,
      closedBy: account(bug.closedBy) ?? null,
      steps: typeof bug.steps === 'string' ? bug.steps : null,
    };
  }

  /** One story record projected to summary fields. */
  storySummary(story) {
    const account = (value) => (typeof value === 'string' ? value : value?.account ?? null);
    return {
      id: story.id,
      product: story.product ?? null,
      title: story.title ?? '',
      status: story.status ?? null,
      stage: story.stage ?? null,
      pri: story.pri ?? null,
      type: story.type ?? null,
      category: story.category ?? null,
      estimate: story.estimate ?? null,
      assignedTo: account(story.assignedTo),
      assignedDate: story.assignedDate ?? null,
      openedBy: account(story.openedBy) ?? null,
      openedDate: story.openedDate ?? null,
      closedBy: account(story.closedBy) ?? null,
      closedReason: story.closedReason ?? null,
      version: story.version ?? null,
    };
  }

  /** Normalize one paginated bug-list payload. */
  bugList(page) {
    const bugs = Array.isArray(page.bugs) ? page.bugs : [];
    return {
      total: page.total ?? bugs.length,
      bugs: bugs.map((bug) => this.bugSummary(bug)),
    };
  }

  // --- Write operations (bug & story) -------------------------------------

  /** Visible users for assignment pickers ({ account, realname }). */
  async users() {
    const page = await this.getJson('/users?recPerPage=1000&pageID=1');
    const users = Array.isArray(page.users) ? page.users : [];
    return users
      .filter((user) => !user.deleted || user.deleted === '0' || user.deleted === 0)
      .map((user) => ({ account: user.account, realname: user.realname ?? user.account }));
  }

  /** Bug status snapshot before a write, for post-write verification. */
  async bugSnapshot(bugId) {
    const payload = await this.getJson(`/bugs/${encodeURIComponent(String(bugId))}`);
    const bug = payload.bug ?? payload;
    return { status: bug.status ?? null, assignedTo: bug.assignedTo ?? null, resolution: bug.resolution ?? null, closedReason: bug.closedReason ?? null };
  }

  /** Story status snapshot before a write. */
  async storySnapshot(storyId) {
    const payload = await this.getJson(`/stories/${encodeURIComponent(String(storyId))}`);
    const story = payload.story ?? payload;
    return { status: story.status ?? null, stage: story.stage ?? null, assignedTo: story.assignedTo ?? null, closedReason: story.closedReason ?? null };
  }

  /** Escape one plain-text paragraph into an HTML <p> block for comments. */
  static commentHtml(text) {
    const escaped = String(text ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped
      .split(/\r?\n/)
      .map((line) => `<p>${line || '<br />'}</p>`)
      .join('');
  }

  /** Re-verify one record after a write; throws when the effect did not stick. */
  async verifyAfter(kind, id, expect) {
    const snapshot = kind === 'story' ? await this.storySnapshot(id) : await this.bugSnapshot(id);
    for (const [field, expected] of Object.entries(expect)) {
      const actual = typeof expected === 'function' ? expected(snapshot[field]) : snapshot[field];
      if (actual !== true) {
        throw new Error(`禅道操作已提交但回读未确认（${field} 预期 ${JSON.stringify(expected) ?? ''}，实际 ${JSON.stringify(snapshot[field]) ?? ''}），请刷新后核对`);
      }
    }
    return snapshot;
  }

  /**
   * One bug or story write through the shared POST shape. Every write route
   * on this instance requires the record id as a query parameter as well
   * (`?bugID=` / `?storyID=`); omitting it fails with "Missing required
   * parameter" even though the path already carries the id.
   */
  async writeRecord(kind, id, action, body) {
    const table = kind === 'story' ? 'stories' : 'bugs';
    const key = kind === 'story' ? 'storyID' : 'bugID';
    const encoded = encodeURIComponent(String(id));
    const path = action == null
      ? `/${table}/${encoded}?${key}=${encoded}`
      : `/${table}/${encoded}/${action}?${key}=${encoded}`;
    const payload = await this.postJson(path, body);
    return payload?.[kind] ?? payload;
  }

  /** Extract an account string from a string-or-object assignedTo value. */
  static accountOf(value) {
    return typeof value === 'string' ? value : value?.account ?? null;
  }

  /**
   * Assign a bug. Preserves the original mailto list; verifies assignedTo after.
   */
  async assignBug(bugId, assignedTo, comment) {
    const payload = await this.getJson(`/bugs/${encodeURIComponent(String(bugId))}`);
    const bug = payload.bug ?? payload;
    const mailto = Array.isArray(bug.mailto)
      ? bug.mailto
      : typeof bug.mailto === 'string' && bug.mailto ? bug.mailto.split(/[,\s]+/).filter(Boolean) : [];
    const body = { assignedTo, mailto };
    if (comment) body.comment = ZenTaoClient.commentHtml(comment);
    await this.writeRecord('bug', bugId, 'assignTo', body);
    return this.verifyAfter('bug', bugId, { assignedTo: (v) => ZenTaoClient.accountOf(v) === assignedTo });
  }

  /** Resolve a bug (status → resolved). Verifies status+resolution after. */
  async resolveBug(bugId, { resolution = 'fixed', resolvedBuild = 'trunk', duplicateBug, comment } = {}) {
    const body = { resolution, resolvedBuild };
    if (resolution === 'duplicate') {
      const dup = Number(duplicateBug);
      if (!Number.isInteger(dup) || dup <= 0) throw new Error('duplicate 解决方案需要填写重复 Bug 编号');
      body.duplicateBug = dup;
    }
    if (comment) body.comment = ZenTaoClient.commentHtml(comment);
    await this.writeRecord('bug', bugId, 'resolve', body);
    return this.verifyAfter('bug', bugId, {
      status: (v) => v === 'resolved',
      resolution: (v) => v === resolution,
    });
  }

  /** Close a bug (status → closed). Verifies status after. */
  async closeBug(bugId, comment) {
    const body = comment ? { comment: ZenTaoClient.commentHtml(comment) } : {};
    await this.writeRecord('bug', bugId, 'close', body);
    return this.verifyAfter('bug', bugId, { status: (v) => v === 'closed' });
  }

  /** Activate a resolved/closed bug (status → active). Verifies status after. */
  async activateBug(bugId, { assignedTo, comment } = {}) {
    // The model requires a non-empty openedBuild on activation.
    const body = { openedBuild: 'trunk' };
    if (assignedTo) body.assignedTo = assignedTo;
    if (comment) body.comment = ZenTaoClient.commentHtml(comment);
    await this.writeRecord('bug', bugId, 'activate', body);
    return this.verifyAfter('bug', bugId, { status: (v) => v === 'active' });
  }

  /**
   * Append a comment to a bug or story. This instance's REST v2 has no
   * dedicated comment endpoint (`/comment` routes return 403), so the comment
   * rides along a re-assignment that keeps the current assignee unchanged;
   * ZenTao records it as an "Assigned" action carrying the comment.
   */
  async addComment(kind, id, comment) {
    const text = String(comment ?? '').trim();
    if (!text) throw new Error('备注内容不能为空');
    const detail = kind === 'story' ? await this.storySnapshot(id) : await this.bugSnapshot(id);
    const current = ZenTaoClient.accountOf(detail.assignedTo);
    if (!current) throw new Error('该记录当前没有负责人，无法附加备注；请先指派');
    if (kind === 'story') {
      await this.writeRecord('story', id, 'assignTo', { assignedTo: current, comment: ZenTaoClient.commentHtml(text) });
    } else {
      const payload = await this.getJson(`/bugs/${encodeURIComponent(String(id))}`);
      const bug = payload.bug ?? payload;
      const mailto = Array.isArray(bug.mailto)
        ? bug.mailto
        : typeof bug.mailto === 'string' && bug.mailto ? bug.mailto.split(/[,\s]+/).filter(Boolean) : [];
      await this.writeRecord('bug', id, 'assignTo', { assignedTo: current, mailto, comment: ZenTaoClient.commentHtml(text) });
    }
    return true;
  }

  /** Assign a story to an account. Verifies assignedTo after. */
  async assignStory(storyId, assignedTo, comment) {
    const body = { assignedTo };
    if (comment) body.comment = ZenTaoClient.commentHtml(comment);
    await this.writeRecord('story', storyId, 'assignTo', body);
    return this.verifyAfter('story', storyId, { assignedTo: (v) => ZenTaoClient.accountOf(v) === assignedTo });
  }

  /** Close a story (status → closed). Verifies status after. */
  async closeStory(storyId, { closedReason = 'done', comment } = {}) {
    const body = { closedReason, comment: comment ? ZenTaoClient.commentHtml(comment) : undefined };
    await this.writeRecord('story', storyId, 'close', body);
    return this.verifyAfter('story', storyId, { status: (v) => v === 'closed' });
  }

  /** Activate a closed story (status → active). Verifies status after. */
  async activateStory(storyId, { assignedTo, comment } = {}) {
    const body = {};
    if (assignedTo) body.assignedTo = assignedTo;
    if (comment) body.comment = ZenTaoClient.commentHtml(comment);
    await this.writeRecord('story', storyId, 'activate', body);
    return this.verifyAfter('story', storyId, { status: (v) => v === 'active' });
  }
}

export { ZenTaoClient, ROUTE_PREFIX, normalizeBase, DEFAULT_BASE };
