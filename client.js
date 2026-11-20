window.__ModuleLoader__.load({
  id: '@local/zentao-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'zentao.panel';
    const PANEL_ID = 'zentao';
    const API_URL = '/zentao-api';
    const FILE_PREFIX = '/zentao-api/file/';
    const PAGE_BUG_LIMIT = 200;
    /** Kinds of records browsable in this panel. */
    const ENTITIES = ['bugs', 'stories'];

    /**
     * In-page focus channel shared by the chat tool cards and this panel.
     * A chat card asks the panel to reveal one record; the request survives
     * until the panel mounts, so a card clicked while the panel is closed
     * still lands on the right record.
     */
    const focusChannel = (() => {
      let pending = null;
      const listeners = new Set();
      return {
        request(target) {
          pending = target;
          for (const listener of listeners) {
            try { listener(target); } catch { /* one bad listener must not break others */ }
          }
        },
        peek() { return pending; },
        clear() { pending = null; },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    })();

    const zh = {
      'panel.label': '禅道',
      'title': '禅道',
      'subtitle': '浏览禅道产品、Bug 与研发需求',
      'product.label': '产品',
      'product.all': '全部产品',
      'entity.label': '类型',
      'entity.bugs': 'Bug',
      'entity.stories': '研发需求',
      'statusFilter.label': '范围',
      'statusFilter.unresolved': '未关闭',
      'statusFilter.all': '全部',
      'search.placeholder': '搜索编号或标题…',
      'search.label': '搜索记录',
      'filter.mine.on': '仅我的（{count}）',
      'filter.mine.off': '仅我的（{count}）',
      'card.bug': 'Bug',
      'card.story': '需求',
      'card.total': '共 {total} 条',
      'card.openInPanel': '在面板中打开',
      'card.opened': '已定位到面板',
      'card.assignee': '指派',
      'card.product': '产品',
      'card.files': '{count} 个附件',
      'card.empty': '没有可展示的结构化结果',
      'detail.sendToChat': '发送到对话',
      'detail.sendToChatHint': '已复制命令，粘贴到对话输入框回车即可',
      'detail.sendToChatFailed': '复制失败，请手动输入 /zentao 命令',
      'refresh': '刷新',
      'refreshing': '刷新中…',
      'list.label': '列表',
      'list.count': '共 {total} 条，显示前 {shown} 条',
      'list.loading': '正在加载…',
      'list.empty': '该产品暂无符合条件的记录',
      'list.retry': '重试',
      'detail.empty.title': '选择一条记录查看详情',
      'detail.empty.body': '从左侧列表中选择，或刷新加载最新数据。',
      'detail.loading': '正在加载详情…',
      'detail.error': '加载失败：{message}',
      // connection settings
      'settings.title': '连接设置',
      'settings.open': '连接',
      'settings.baseURL': '服务器地址',
      'settings.baseURL.hint': '例如 https://zentao.example.com/zentao',
      'settings.account': '账号',
      'settings.password': '密码',
      'settings.allowWrites': '允许写操作（指派/解决/关闭/激活/备注）',
      'settings.save': '保存并登录',
      'settings.saving': '正在验证…',
      'settings.connected': '已连接：{account}@{baseURL}',
      'settings.notConfigured': '未配置连接',
      'settings.saved': '连接成功',
      'settings.cancel': '取消',
      'settings.writesOn': '写操作已开启',
      'settings.writesOff': '写操作已关闭',
      // write operations
      'actions.label': '操作',
      'actions.assign': '指派',
      'actions.resolve': '解决',
      'actions.close': '关闭',
      'actions.activate': '激活',
      'actions.comment': '备注',
      'actions.commentPlaceholder': '备注内容（可选）',
      'actions.commentRequired': '备注内容（必填，会记录到工单）',
      'actions.assignedTo': '指派给',
      'actions.resolution': '解决方案',
      'actions.resolution.fixed': '已解决',
      'actions.resolution.wontfix': '不予解决',
      'actions.resolution.duplicate': '重复 Bug',
      'actions.resolution.postponed': '延期处理',
      'actions.resolution.willnotfix': '暂不解决',
      'actions.resolution.notrepro': '无法重现',
      'actions.resolution.bydesign': '设计如此',
      'actions.closedReason': '关闭原因',
      'actions.duplicateBug': '重复 Bug 编号',
      'actions.closedReason.done': '已完成',
      'actions.closedReason.duplicate': '重复',
      'actions.closedReason.postponed': '延期',
      'actions.closedReason.willnotdo': '不做',
      'actions.closedReason.cancel': '已取消',
      'actions.closedReason.bydesign': '设计如此',
      'actions.execute': '确认执行',
      'actions.cancel': '取消',
      'actions.executing': '正在执行…',
      'actions.success': '操作成功，工单已更新',
      'actions.successComment': '备注已提交',
      'actions.writesDisabled': '写操作未开启，请在「连接」设置中开启',
      'actions.failed': '操作失败：{message}',
      'field.status': '状态',
      'field.stage': '阶段',
      'field.severity': '严重程度',
      'field.pri': '优先级',
      'field.type': '类型',
      'field.estimate': '预计工时',
      'field.assignedTo': '当前指派',
      'field.openedBy': '由谁创建',
      'field.openedDate': '创建时间',
      'field.assignedDate': '指派时间',
      'field.deadline': '截止日期',
      'field.resolution': '解决方案',
      'field.closedReason': '关闭原因',
      'field.steps': '描述与复现步骤',
      'field.spec': '需求描述',
      'field.verify': '验收标准',
      'attachments.label': '图片与附件',
      'attachments.empty': '详情中未发现内嵌图片或附件',
      'attachments.count': '{count} 个文件',
      'attachment.open': '打开附件 #{id}',
      'error.title': '无法加载禅道数据',
      'error.notConfigured': '尚未配置禅道连接，请点击右上角「连接」填写地址和账号',
      'meta.status.active': '激活',
      'meta.status.resolved': '已解决',
      'meta.status.closed': '已关闭',
      'meta.status.unclosed': '未关闭',
      'meta.status.draft': '草稿',
      'meta.status.opened': '已创建',
      'meta.status.changing': '变更中',
      'meta.status.reviewing': '评审中',
      'meta.stage.wait': '未开始',
      'meta.stage.planned': '已计划',
      'meta.stage.projected': '已立项',
      'meta.stage.developing': '研发中',
      'meta.stage.developed': '研发完毕',
      'meta.stage.testing': '测试中',
      'meta.stage.tested': '测试完毕',
      'meta.stage.verified': '已验收',
      'meta.stage.released': '已发布',
      'meta.stage.closed': '已关闭',
    };

    const en = {
      'panel.label': 'ZenTao',
      'title': 'ZenTao',
      'subtitle': 'Browse ZenTao products, bugs, and stories',
      'product.label': 'Product',
      'product.all': 'All products',
      'entity.label': 'Type',
      'entity.bugs': 'Bugs',
      'entity.stories': 'Stories',
      'statusFilter.label': 'Scope',
      'statusFilter.unresolved': 'Unresolved',
      'statusFilter.all': 'All',
      'search.placeholder': 'Search id or title…',
      'search.label': 'Search records',
      'filter.mine.on': 'Mine only ({count})',
      'filter.mine.off': 'Mine only ({count})',
      'card.bug': 'Bug',
      'card.story': 'Story',
      'card.total': '{total} records',
      'card.openInPanel': 'Open in panel',
      'card.opened': 'Opened in panel',
      'card.assignee': 'Assignee',
      'card.product': 'Product',
      'card.files': '{count} files',
      'card.empty': 'No structured result to show',
      'detail.sendToChat': 'Send to chat',
      'detail.sendToChatHint': 'Command copied — paste it in the composer and press Enter',
      'detail.sendToChatFailed': 'Copy failed — type the /zentao command manually',
      'refresh': 'Refresh',
      'refreshing': 'Refreshing…',
      'list.label': 'List',
      'list.count': '{total} total, showing first {shown}',
      'list.loading': 'Loading…',
      'list.empty': 'No records match in this product',
      'list.retry': 'Retry',
      'detail.empty.title': 'Select a record to see details',
      'detail.empty.body': 'Pick one from the list, or refresh to load the latest data.',
      'detail.loading': 'Loading detail…',
      'detail.error': 'Failed to load: {message}',
      'settings.title': 'Connection',
      'settings.open': 'Connect',
      'settings.baseURL': 'Server URL',
      'settings.baseURL.hint': 'e.g. https://zentao.example.com/zentao',
      'settings.account': 'Account',
      'settings.password': 'Password',
      'settings.allowWrites': 'Allow write actions (assign/resolve/close/activate/comment)',
      'settings.save': 'Save & sign in',
      'settings.saving': 'Verifying…',
      'settings.connected': 'Connected: {account}@{baseURL}',
      'settings.notConfigured': 'Not configured',
      'settings.saved': 'Connected',
      'settings.cancel': 'Cancel',
      'settings.writesOn': 'Writes enabled',
      'settings.writesOff': 'Writes disabled',
      'actions.label': 'Actions',
      'actions.assign': 'Assign',
      'actions.resolve': 'Resolve',
      'actions.close': 'Close',
      'actions.activate': 'Activate',
      'actions.comment': 'Comment',
      'actions.commentPlaceholder': 'Comment (optional)',
      'actions.commentRequired': 'Comment (required, recorded on the record)',
      'actions.assignedTo': 'Assign to',
      'actions.resolution': 'Resolution',
      'actions.resolution.fixed': 'Fixed',
      'actions.resolution.wontfix': "Won't fix",
      'actions.resolution.duplicate': 'Duplicate',
      'actions.resolution.postponed': 'Postponed',
      'actions.resolution.willnotfix': 'Will not fix',
      'actions.resolution.notrepro': 'Not reproducible',
      'actions.resolution.bydesign': 'By design',
      'actions.closedReason': 'Close reason',
      'actions.duplicateBug': 'Duplicate bug id',
      'actions.closedReason.done': 'Done',
      'actions.closedReason.duplicate': 'Duplicate',
      'actions.closedReason.postponed': 'Postponed',
      'actions.closedReason.willnotdo': 'Will not do',
      'actions.closedReason.cancel': 'Cancelled',
      'actions.closedReason.bydesign': 'By design',
      'actions.execute': 'Confirm',
      'actions.cancel': 'Cancel',
      'actions.executing': 'Executing…',
      'actions.success': 'Done, the record is updated',
      'actions.successComment': 'Comment submitted',
      'actions.writesDisabled': 'Writes are disabled — enable them in the Connect dialog',
      'actions.failed': 'Failed: {message}',
      'field.status': 'Status',
      'field.stage': 'Stage',
      'field.severity': 'Severity',
      'field.pri': 'Priority',
      'field.type': 'Type',
      'field.estimate': 'Estimate',
      'field.assignedTo': 'Assigned to',
      'field.openedBy': 'Opened by',
      'field.openedDate': 'Opened',
      'field.assignedDate': 'Assigned',
      'field.deadline': 'Deadline',
      'field.resolution': 'Resolution',
      'field.closedReason': 'Closed reason',
      'field.steps': 'Description & repro steps',
      'field.spec': 'Description',
      'field.verify': 'Acceptance criteria',
      'attachments.label': 'Images & attachments',
      'attachments.empty': 'No embedded images or attachments found',
      'attachments.count': '{count} files',
      'attachment.open': 'Open attachment #{id}',
      'error.title': 'Cannot load ZenTao data',
      'error.notConfigured': 'No ZenTao connection configured — click "Connect" to fill in the server URL and account',
      'meta.status.active': 'Active',
      'meta.status.resolved': 'Resolved',
      'meta.status.closed': 'Closed',
      'meta.status.unclosed': 'Unclosed',
      'meta.status.draft': 'Draft',
      'meta.status.opened': 'Opened',
      'meta.status.changing': 'Changing',
      'meta.status.reviewing': 'Reviewing',
      'meta.stage.wait': 'Wait',
      'meta.stage.planned': 'Planned',
      'meta.stage.projected': 'Projected',
      'meta.stage.developing': 'Developing',
      'meta.stage.developed': 'Developed',
      'meta.stage.testing': 'Testing',
      'meta.stage.tested': 'Tested',
      'meta.stage.verified': 'Verified',
      'meta.stage.released': 'Released',
      'meta.stage.closed': 'Closed',
    };

    /** One JSON call through the Host proxy route. */
    async function api(action, args) {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, args: args ?? {} }),
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) throw new Error(`代理返回了非 JSON 响应（HTTP ${response.status}）`);
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? String(payload.code ?? '未知错误'));
      return payload;
    }

    const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);

    /** Strip scripts, frames, and inline event handlers from one rich-text field. */
    function sanitizeHtml(html) {
      return String(html ?? '')
        .replace(/<\s*(script|iframe|object|embed|link|meta|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|iframe|object|embed|link|meta|style)[^>]*\/?\s*>/gi, '')
        .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript\s*:/gi, '');
    }

    function formatDateTime(value) {
      if (!value || typeof value !== 'string') return null;
      const parsed = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
      if (Number.isNaN(parsed)) return value;
      return new Date(parsed).toLocaleString();
    }

    /** CSS for the whole panel: theme tokens only. */
    function PanelStyles() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } });
    }

    function Chip({ tone, children }) {
      return h('span', { className: `zentao-chip zentao-chip-${tone}` }, children);
    }

    function statusChip(t, status) {
      const key = `meta.status.${status}`;
      const known = zh[key] !== undefined;
      const label = known ? t(key) : String(status ?? '-');
      const tone = status === 'closed' ? 'idle'
        : status === 'resolved' || status === 'verified' || status === 'released' ? 'success'
        : status === 'draft' ? 'idle'
        : 'warn';
      return h(Chip, { tone }, label);
    }

    function stageChip(t, stage) {
      if (stage === null || stage === undefined || stage === '') return null;
      const key = `meta.stage.${stage}`;
      const known = zh[key] !== undefined;
      const label = known ? t(key) : String(stage);
      const tone = stage === 'closed' ? 'idle' : stage === 'developed' || stage === 'tested' || stage === 'verified' || stage === 'released' ? 'success' : 'warn';
      return h(Chip, { tone }, label);
    }

    function levelChip(t, label, value) {
      if (value === null || value === undefined || value === '') return null;
      const tone = Number(value) === 1 ? 'error' : Number(value) === 2 ? 'warn' : 'idle';
      return h(Chip, { tone }, `${label} ${value}`);
    }

    function ZenTaoIcon({ size }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('circle', { cx: 12, cy: 13.6, r: 5.3 }),
        h('path', { d: 'M9.4 8.6a2.7 2.7 0 1 1 5.2 0' }),
        h('path', { d: 'M10.7 6.2 9.5 4.1M13.3 6.2l1.2-2.1' }),
        h('path', { d: 'M12 8.3v10.6' }),
        h('path', { d: 'M6.7 11.4 4.2 10.2M6.6 14.6H3.8M7 17.3l-2.2 1.8' }),
        h('path', { d: 'M17.3 11.4l2.5-1.2M17.4 14.6h2.8M17 17.3l2.2 1.8' }),
      );
    }

    /** One record row in the list pane. */
    function RecordRow({ t, entity, record, selected, onSelect }) {
      const chips = entity === 'stories'
        ? [statusChip(t, record.status), stageChip(t, record.stage), levelChip(t, t('field.pri'), record.pri)]
        : [statusChip(t, record.status), levelChip(t, t('field.severity'), record.severity), levelChip(t, t('field.pri'), record.pri)];
      return h('button', {
        type: 'button',
        className: `zentao-row${selected ? ' zentao-row-selected' : ''}`,
        'aria-label': `#${record.id} ${record.title}`,
        'aria-pressed': selected,
        onClick: () => onSelect(record.id),
      },
        h('span', { className: 'zentao-row-id' }, `#${record.id}`),
        h('span', { className: 'zentao-row-main' },
          h('span', { className: 'zentao-row-title' }, record.title),
          h('span', { className: 'zentao-row-meta' },
            ...chips,
            record.assignedTo ? h('span', { className: 'zentao-row-assignee' }, `→ ${record.assignedTo}`) : null,
          ),
        ),
      );
    }

    /** Connection settings dialog: server URL, account, password, write switch. */
    function ConnectionDialog({ t, status, onClose, onSaved }) {
      const [baseURL, setBaseURL] = React.useState(status?.baseURL ?? '');
      const [account, setAccount] = React.useState(status?.account ?? '');
      const [password, setPassword] = React.useState('');
      const [allowWrites, setAllowWrites] = React.useState(status?.allowWrites ?? false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      React.useEffect(() => {
        setBaseURL(status?.baseURL ?? '');
        setAccount(status?.account ?? '');
        setPassword('');
        setAllowWrites(status?.allowWrites ?? false);
        setError(null);
      }, [status]);

      const save = () => {
        setBusy(true);
        setError(null);
        api('saveConnection', { baseURL, account, password: password || undefined, allowWrites })
          .then((payload) => {
            setBusy(false);
            onSaved(payload.connection);
          }, (err) => {
            setBusy(false);
            setError(err);
          });
      };

      return h('div', { className: 'zentao-dialog-backdrop', onClick: onClose },
        h('div', { className: 'zentao-dialog', role: 'dialog', 'aria-label': t('settings.title'), onClick: (e) => e.stopPropagation() },
          h('h2', { className: 'zentao-dialog-title' }, t('settings.title')),
          h('label', { className: 'zentao-field' },
            h('span', { className: 'zentao-field-label' }, t('settings.baseURL')),
            h('input', { type: 'text', className: 'zentao-input', value: baseURL, placeholder: t('settings.baseURL.hint'), onChange: (e) => setBaseURL(e.target.value) })),
          h('label', { className: 'zentao-field' },
            h('span', { className: 'zentao-field-label' }, t('settings.account')),
            h('input', { type: 'text', className: 'zentao-input', value: account, autoComplete: 'off', onChange: (e) => setAccount(e.target.value) })),
          h('label', { className: 'zentao-field' },
            h('span', { className: 'zentao-field-label' }, t('settings.password')),
            h('input', { type: 'password', className: 'zentao-input', value: password, autoComplete: 'new-password', placeholder: status?.configured ? '••••••（留空保持不变）' : '', onChange: (e) => setPassword(e.target.value) })),
          h('label', { className: 'zentao-check' },
            h('input', { type: 'checkbox', checked: allowWrites, onChange: (e) => setAllowWrites(e.target.checked) }),
            h('span', null, t('settings.allowWrites'))),
          error !== null
            ? h('div', { className: 'zentao-dialog-error', role: 'alert' }, error.message ?? String(error))
            : null,
          h('div', { className: 'zentao-dialog-actions' },
            h('button', { type: 'button', className: 'zentao-button', onClick: onClose, disabled: busy }, t('settings.cancel')),
            h('button', { type: 'button', className: 'zentao-button zentao-button-primary', onClick: save, disabled: busy || !baseURL.trim() || !account.trim() || (!status?.configured && !password) },
              busy ? t('settings.saving') : t('settings.save'))),
        ),
      );
    }

    /** One write action's inline form inside the detail pane. */
    function ActionForm({ t, entity, record, op, users, onDone, onError }) {
      const [assignedTo, setAssignedTo] = React.useState('');
      const [resolution, setResolution] = React.useState('fixed');
      const [duplicateBug, setDuplicateBug] = React.useState('');
      const [closedReason, setClosedReason] = React.useState('done');
      const [comment, setComment] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const commentRequired = op === 'resolve' || op === 'close' || op === 'activate';

      const execute = () => {
        setBusy(true);
        api('write', {
          kind: entity === 'stories' ? 'story' : 'bug',
          id: record.id,
          op,
          assignedTo: assignedTo || undefined,
          resolution: op === 'resolve' ? resolution : undefined,
          duplicateBug: op === 'resolve' && resolution === 'duplicate' ? (Number(duplicateBug) || undefined) : undefined,
          closedReason: op === 'close' && entity === 'stories' ? closedReason : undefined,
          comment: comment || undefined,
        }).then((payload) => {
          setBusy(false);
          onDone(payload);
        }, (err) => {
          setBusy(false);
          onError(err);
        });
      };

      const inputProps = { disabled: busy };
      return h('div', { className: 'zentao-action-form' },
        op === 'assign' || op === 'activate'
          ? h('label', { className: 'zentao-field' },
              h('span', { className: 'zentao-field-label' }, t('actions.assignedTo')),
              h('select', { className: 'zentao-select', value: assignedTo, ...inputProps, onChange: (e) => setAssignedTo(e.target.value) },
                h('option', { value: '' }, '—'),
                (users ?? []).map((user) => h('option', { key: user.account, value: user.account }, `${user.realname} (${user.account})`))))
          : null,
        op === 'resolve' && entity !== 'stories'
          ? h('label', { className: 'zentao-field' },
              h('span', { className: 'zentao-field-label' }, t('actions.resolution')),
              h('select', { className: 'zentao-select', value: resolution, ...inputProps, onChange: (e) => setResolution(e.target.value) },
                ['fixed', 'notrepro', 'duplicate', 'bydesign', 'postponed', 'willnotfix', 'wontfix'].map((value) => h('option', { key: value, value }, t(`actions.resolution.${value}`)))))
          : null,
        op === 'resolve' && entity !== 'stories' && resolution === 'duplicate'
          ? h('label', { className: 'zentao-field' },
              h('span', { className: 'zentao-field-label' }, t('actions.duplicateBug')),
              h('input', { type: 'number', min: 1, className: 'zentao-input', value: duplicateBug, ...inputProps, onChange: (e) => setDuplicateBug(e.target.value) }))
          : null,
        op === 'close' && entity === 'stories'
          ? h('label', { className: 'zentao-field' },
              h('span', { className: 'zentao-field-label' }, t('actions.closedReason')),
              h('select', { className: 'zentao-select', value: closedReason, ...inputProps, onChange: (e) => setClosedReason(e.target.value) },
                ['done', 'duplicate', 'postponed', 'willnotdo', 'cancel', 'bydesign'].map((value) => h('option', { key: value, value }, t(`actions.closedReason.${value}`)))))
          : null,
        h('label', { className: 'zentao-field' },
          h('span', { className: 'zentao-field-label' }, commentRequired ? t('actions.commentRequired') : t('actions.commentPlaceholder')),
          h('textarea', { className: 'zentao-textarea', rows: 3, value: comment, ...inputProps, onChange: (e) => setComment(e.target.value) })),
        h('div', { className: 'zentao-action-buttons' },
          h('button', { type: 'button', className: 'zentao-button', disabled: busy, onClick: onDone }, t('actions.cancel')),
          h('button', { type: 'button', className: 'zentao-button zentao-button-primary', disabled: busy || (commentRequired && !comment.trim()), onClick: execute },
            busy ? t('actions.executing') : t('actions.execute'))),
      );
    }

    /** Write-action bar of the detail pane (op picker + inline form). */
    function ActionsBar({ t, entity, record, allowWrites, onChanged }) {
      const [openOp, setOpenOp] = React.useState(null);
      const [users, setUsers] = React.useState(null);
      const [feedback, setFeedback] = React.useState(null);

      const open = (op) => {
        setOpenOp(op);
        setFeedback(null);
        if ((op === 'assign' || op === 'activate') && users === null) {
          api('users').then((payload) => setUsers(payload.users), () => setUsers([]));
        }
      };
      const done = () => {
        setOpenOp(null);
        setFeedback({ ok: true, op });
        onChanged();
      };
      const failed = (error) => {
        setFeedback({ ok: false, message: error.message ?? String(error) });
      };

      if (!allowWrites) {
        return h('div', { className: 'zentao-actions zentao-actions-disabled' }, t('actions.writesDisabled'));
      }
      const ops = entity === 'stories'
        ? (['assign', 'close', 'activate', 'comment'])
        : (['assign', 'resolve', 'close', 'activate', 'comment']);
      return h('div', { className: 'zentao-actions' },
        h('div', { className: 'zentao-section-label' }, t('actions.label')),
        h('div', { className: 'zentao-actions-row' },
          ops.map((op) => h('button', {
            key: op, type: 'button',
            className: `zentao-button zentao-action-op${openOp === op ? ' zentao-action-op-active' : ''}`,
            onClick: () => (openOp === op ? setOpenOp(null) : open(op)),
          }, t(`actions.${op}`)))),
        openOp !== null
          ? h(ActionForm, { t, entity, record, op: openOp, users, onDone: done, onError: failed })
          : null,
        feedback !== null
          ? h('div', { className: `zentao-action-feedback${feedback.ok ? ' zentao-action-feedback-ok' : ' zentao-action-feedback-err'}`, role: 'status' },
              feedback.ok ? (feedback.op === 'comment' ? t('actions.successComment') : t('actions.success')) : t('actions.failed', { message: feedback.message }))
          : null,
      );
    }

    /** Attachments section of the detail pane. */
    function Attachments({ t, richFiles }) {
      if (!richFiles || richFiles.length === 0) {
        return h('div', { className: 'zentao-attachments-empty' }, t('attachments.empty'));
      }
      return h('div', { className: 'zentao-attachments' },
        h('div', { className: 'zentao-section-label' }, `${t('attachments.label')} · ${t('attachments.count', { count: richFiles.length })}`),
        h('div', { className: 'zentao-attachment-grid' }, richFiles.map((file) => {
          const ext = String(file.extension ?? '').toLowerCase();
          const isImage = IMAGE_EXTENSIONS.has(ext);
          const url = `${FILE_PREFIX}${file.id}`;
          const name = file.title || (ext ? `#${file.id} .${ext}` : `#${file.id}`);
          return h('div', { className: 'zentao-attachment', key: file.id },
            isImage
              ? h('a', { href: url, target: '_blank', rel: 'noreferrer', className: 'zentao-attachment-frame', title: name },
                  h('img', { src: url, alt: name, loading: 'lazy' }))
              : h('a', { href: url, target: '_blank', rel: 'noreferrer', className: 'zentao-attachment-link' },
                  `${t('attachment.open', { id: file.id })}`),
            h('span', { className: 'zentao-attachment-name', title: name }, name),
          );
        })),
      );
    }

    /** Right pane: one record's detail (bug or story) with write actions. */
    function RecordDetail({ t, entity, recordId, allowWrites, onLoad, onChanged }) {
      const [state, setState] = React.useState({ status: 'loading', detail: null, error: null });
      const reload = React.useCallback(() => {
        setState({ status: 'loading', detail: null, error: null });
        api(entity === 'stories' ? 'story' : 'bug', entity === 'stories' ? { storyId: recordId } : { bugId: recordId }).then((payload) => {
          setState({ status: 'ready', detail: payload, error: null });
        }, (error) => {
          setState({ status: 'error', detail: null, error });
        });
      }, [entity, recordId]);
      React.useEffect(() => { reload(); }, [reload]);

      if (state.status === 'error') {
        return h('div', { className: 'zentao-detail', role: 'status' },
          h('h2', { className: 'zentao-error-title' }, t('detail.error', { message: state.error?.message ?? 'unknown' })),
          h('button', { type: 'button', className: 'zentao-button', onClick: onLoad }, t('list.retry')),
        );
      }
      if (state.status !== 'ready' || !state.detail) {
        return h('div', { className: 'zentao-detail', role: 'status' }, t('detail.loading'));
      }
      if (entity === 'stories') {
        const { story, richFiles } = state.detail;
        const rows = [
          [t('field.status'), h('span', { key: 's' }, statusChip(t, story.status))],
          [t('field.stage'), h('span', { key: 'g' }, stageChip(t, story.stage) ?? '-')],
          [t('field.type'), story.type ?? '-'],
          [t('field.pri'), story.pri ?? '-'],
          [t('field.estimate'), story.estimate ?? '-'],
          [t('field.assignedTo'), story.assignedTo ?? '-'],
          [t('field.openedBy'), story.openedBy ?? '-'],
          [t('field.openedDate'), formatDateTime(story.openedDate) ?? '-'],
          [t('field.assignedDate'), formatDateTime(story.assignedDate) ?? '-'],
          [t('field.closedReason'), story.closedReason || '-'],
        ];
        return h('div', { className: 'zentao-detail' },
          h('div', { className: 'zentao-detail-head' },
            h('h2', { className: 'zentao-detail-title' }, `#${story.id} ${story.title}`),
            h(SendToChat, { t, entity, recordId: story.id }),
          ),
          h('div', { className: 'zentao-meta-grid' }, rows.map(([label, value]) => (
            h('div', { className: 'zentao-meta-row', key: label },
              h('span', { className: 'zentao-meta-label' }, label),
              h('span', { className: 'zentao-meta-value' }, value),
            )
          ))),
          story.spec ? h('div', { className: 'zentao-section' },
            h('div', { className: 'zentao-section-label' }, t('field.spec')),
            h('div', { className: 'zentao-steps', dangerouslySetInnerHTML: { __html: sanitizeHtml(story.spec) } }),
          ) : null,
          story.verify ? h('div', { className: 'zentao-section' },
            h('div', { className: 'zentao-section-label' }, t('field.verify')),
            h('div', { className: 'zentao-steps', dangerouslySetInnerHTML: { __html: sanitizeHtml(story.verify) } }),
          ) : null,
          h(ActionsBar, { t, entity, record: story, allowWrites, onChanged: () => { reload(); onChanged(); } }),
          h(Attachments, { t, richFiles }),
        );
      }
      const { bug, richFiles } = state.detail;
      const rows = [
        [t('field.status'), h('span', { key: 's' }, statusChip(t, bug.status))],
        [t('field.assignedTo'), bug.assignedTo ?? '-'],
        [t('field.openedBy'), bug.openedBy ?? '-'],
        [t('field.openedDate'), formatDateTime(bug.openedDate) ?? '-'],
        [t('field.assignedDate'), formatDateTime(bug.assignedDate) ?? '-'],
        [t('field.deadline'), bug.deadline || '-'],
        [t('field.resolution'), bug.resolution || '-'],
      ];
      return h('div', { className: 'zentao-detail' },
        h('div', { className: 'zentao-detail-head' },
          h('h2', { className: 'zentao-detail-title' }, `#${bug.id} ${bug.title}`),
          h(SendToChat, { t, entity, recordId: bug.id }),
        ),
        h('div', { className: 'zentao-meta-grid' }, rows.map(([label, value]) => (
          h('div', { className: 'zentao-meta-row', key: label },
            h('span', { className: 'zentao-meta-label' }, label),
            h('span', { className: 'zentao-meta-value' }, value),
          )
        ))),
        bug.steps ? h('div', { className: 'zentao-section' },
          h('div', { className: 'zentao-section-label' }, t('field.steps')),
          h('div', { className: 'zentao-steps', dangerouslySetInnerHTML: { __html: sanitizeHtml(bug.steps) } }),
        ) : null,
        h(ActionsBar, { t, entity, record: bug, allowWrites, onChanged: () => { reload(); onChanged(); } }),
        h(Attachments, { t, richFiles }),
      );
    }

    /** The global ZenTao page: connection, entity switch, filters, list, and detail. */
    function ZenTaoPage({ t }) {
      const [connection, setConnection] = React.useState(null);
      const [showSettings, setShowSettings] = React.useState(false);
      const [products, setProducts] = React.useState(null);
      const [productId, setProductId] = React.useState(null);
      const [entity, setEntity] = React.useState('bugs');
      const [browseType, setBrowseType] = React.useState('unresolved');
      const [search, setSearch] = React.useState('');
      const [mineOnly, setMineOnly] = React.useState(false);
      const [records, setRecords] = React.useState(null);
      const [total, setTotal] = React.useState(0);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [selectedId, setSelectedId] = React.useState(null);

      const configured = connection?.configured === true;

      const loadConnection = React.useCallback(() => {
        api('connection').then((payload) => setConnection(payload.connection), () => setConnection(null));
      }, []);
      React.useEffect(() => { loadConnection(); }, [loadConnection]);

      // Reveal a record requested by a chat card (or waiting from before mount).
      React.useEffect(() => {
        const reveal = (target) => {
          if (!target) return;
          setEntity(target.entity === 'story' ? 'stories' : 'bugs');
          setMineOnly(false);
          setSearch('');
          if (target.product !== null && target.product !== undefined) setProductId(Number(target.product));
          setSelectedId(Number(target.id));
        };
        const pending = focusChannel.peek();
        if (pending !== null) { reveal(pending); focusChannel.clear(); }
        return focusChannel.subscribe((target) => { reveal(target); focusChannel.clear(); });
      }, []);

      const loadProducts = React.useCallback(() => {
        if (!configured) return;
        api('products').then((payload) => {
          setProducts(payload.products);
          setProductId((current) => current ?? 'all');
        }, (err) => setError(err));
      }, [configured]);
      React.useEffect(() => { loadProducts(); }, [loadProducts]);

      const loadRecords = React.useCallback(() => {
        if (!configured || productId === null) return;
        setLoading(true);
        setError(null);
        const action = entity === 'stories' ? 'productStories' : 'productBugs';
        const browse = entity === 'stories'
          ? (browseType === 'all' ? 'all' : 'unclosed')
          : (browseType === 'all' ? 'all' : 'unresolved');
        api(action, { productId, browseType: browse }).then((payload) => {
          setRecords(entity === 'stories' ? payload.stories : payload.bugs);
          setTotal(payload.total);
          setLoading(false);
        }, (err) => {
          setError(err);
          setLoading(false);
        });
      }, [configured, productId, entity, browseType]);
      React.useEffect(() => { loadRecords(); }, [loadRecords]);

      const onConnectionSaved = (next) => {
        setConnection(next);
        setShowSettings(false);
        setError(null);
        setProducts(null);
        setProductId('all');
        setRecords(null);
        setSelectedId(null);
      };

      const switchEntity = (next) => {
        if (next === entity) return;
        setEntity(next);
        setSelectedId(null);
        setRecords(null);
      };

      const rows = React.useMemo(() => {
        if (!records) return [];
        const account = connection?.account ?? '';
        let list = records;
        if (mineOnly && account) {
          list = list.filter((record) => record.assignedTo === account || record.openedBy === account);
        }
        const query = search.trim().toLowerCase();
        if (!query) return list.slice(0, PAGE_BUG_LIMIT);
        return list.filter((record) => String(record.id).includes(query) || record.title.toLowerCase().includes(query)).slice(0, PAGE_BUG_LIMIT);
      }, [records, search, mineOnly, connection]);

      /** Count of records involving the logged-in account, shown on the toggle. */
      const mineCount = React.useMemo(() => {
        if (!records) return 0;
        const account = connection?.account ?? '';
        if (!account) return 0;
        return records.filter((record) => record.assignedTo === account || record.openedBy === account).length;
      }, [records, connection]);

      /** Per-product count of records involving the logged-in account. */
      const mineCountByProduct = React.useMemo(() => {
        const map = new Map();
        if (!records) return map;
        const account = connection?.account ?? '';
        if (!account) return map;
        for (const record of records) {
          if (record.assignedTo === account || record.openedBy === account) {
            map.set(Number(record.product), (map.get(Number(record.product)) ?? 0) + 1);
          }
        }
        return map;
      }, [records, connection]);

      const statusLabel = connection === null
        ? t('settings.notConfigured')
        : connection.configured
          ? t('settings.connected', { account: connection.account ?? '', baseURL: connection.baseURL ?? '' })
          : t('settings.notConfigured');

      return h('section', { className: 'zentao-page', 'aria-label': t('title') },
        h(PanelStyles),
        h('div', { className: 'zentao-head' },
          h('div', { className: 'zentao-head-text' },
            h('h1', null, t('title')),
            h('p', { className: 'zentao-subtitle' }, t('subtitle')),
          ),
          h('div', { className: 'zentao-head-actions' },
            h('span', {
              className: `zentao-conn-status${configured ? ' zentao-conn-ok' : ' zentao-conn-off'}`,
              title: statusLabel,
            }, configured ? `● ${connection.account}` : `● ${t('settings.notConfigured')}`),
            h('button', { type: 'button', className: 'zentao-button', onClick: () => setShowSettings(true) }, t('settings.open')),
            h('button', { type: 'button', className: 'zentao-button', onClick: loadRecords, disabled: loading || !configured || productId === null },
              loading ? t('refreshing') : t('refresh')),
          ),
        ),
        showSettings
          ? h(ConnectionDialog, { t, status: connection, onClose: () => setShowSettings(false), onSaved: onConnectionSaved })
          : null,
        !configured
          ? h('div', { className: 'zentao-error', role: 'alert' },
              h('strong', null, t('error.title')),
              h('span', null, t('error.notConfigured')),
              h('button', { type: 'button', className: 'zentao-button', onClick: () => setShowSettings(true) }, t('settings.open')))
          : h('div', { className: 'zentao-filters' },
              h('div', { className: 'zentao-field' },
                h('span', { className: 'zentao-field-label' }, t('entity.label')),
                h('div', { className: 'zentao-seg', role: 'group', 'aria-label': t('entity.label') },
                  ENTITIES.map((value) => h('button', {
                    key: value, type: 'button', className: `zentao-seg-item${entity === value ? ' zentao-seg-active' : ''}`,
                    'aria-pressed': entity === value,
                    onClick: () => switchEntity(value),
                  }, t(`entity.${value}`))))),
              h('label', { className: 'zentao-field' },
                h('span', { className: 'zentao-field-label' }, t('product.label')),
                products === null
                  ? h('span', { className: 'zentao-field-value' }, t('list.loading'))
                  : h('select', {
                      className: 'zentao-select', value: String(productId ?? 'all'), 'aria-label': t('product.label'),
                      onChange: (event) => {
                        const value = event.target.value;
                        setProductId(value === 'all' ? 'all' : Number(value));
                        setSelectedId(null);
                      },
                    },
                    h('option', { key: 'all', value: 'all' }, mineOnly
                      ? `${t('product.all')}（${rows.length}）`
                      : t('product.all')),
                    products.map((product) => {
                      const mine = mineCountByProduct.get(Number(product.id)) ?? 0;
                      const label = mineOnly && mine > 0
                        ? `${product.name} (#${product.id}) · ${mine}`
                        : `${product.name} (#${product.id})`;
                      return h('option', { key: product.id, value: product.id }, label);
                    }))),
              h('div', { className: 'zentao-field' },
                h('span', { className: 'zentao-field-label' }, t('statusFilter.label')),
                h('div', { className: 'zentao-seg', role: 'group', 'aria-label': t('statusFilter.label') },
                  ['unresolved', 'all'].map((value) => h('button', {
                    key: value, type: 'button', className: `zentao-seg-item${browseType === value ? ' zentao-seg-active' : ''}`,
                    'aria-pressed': browseType === value,
                    onClick: () => { setBrowseType(value); setSelectedId(null); },
                  }, t(`statusFilter.${value}`))))),
              h('button', {
                type: 'button',
                className: `zentao-mine-toggle${mineOnly ? ' zentao-mine-active' : ''}`,
                'aria-pressed': mineOnly,
                title: mineOnly ? t('filter.mine.on', { count: mineCount }) : t('filter.mine.off', { count: mineCount }),
                onClick: () => { setMineOnly(!mineOnly); setSelectedId(null); },
              }, mineOnly
                ? `◉ ${t('filter.mine.on', { count: mineCount })}`
                : `○ ${t('filter.mine.off', { count: mineCount })}`),
              h('input', {
                type: 'search', className: 'zentao-input', placeholder: t('search.placeholder'),
                'aria-label': t('search.label'), value: search, onChange: (event) => setSearch(event.target.value),
              }),
            ),
        configured && error !== null
          ? h('div', { className: 'zentao-error', role: 'alert' },
              h('strong', null, t('error.title')),
              h('span', null, error.message ?? ''),
              h('button', { type: 'button', className: 'zentao-button', onClick: () => { setError(null); loadProducts(); loadRecords(); } }, t('list.retry')))
          : configured
            ? h('div', { className: 'zentao-body' },
                h('div', { className: 'zentao-list' },
                  h('div', { className: 'zentao-list-head', role: 'status' },
                    records === null || loading
                      ? t('list.loading')
                      : t('list.count', { total, shown: rows.length })),
                  h('div', { className: 'zentao-list-rows', role: 'list' },
                    !loading && records !== null && rows.length === 0
                      ? h('div', { className: 'zentao-list-empty' }, t('list.empty'))
                      : rows.map((record) => h('div', { role: 'listitem', key: record.id },
                          h(RecordRow, { t, entity, record, selected: selectedId === record.id, onSelect: setSelectedId })))),
                ),
                h('div', { className: 'zentao-detail-pane' },
                  selectedId === null
                    ? h('div', { className: 'zentao-detail-empty' },
                        h('h2', null, t('detail.empty.title')),
                        h('p', null, t('detail.empty.body')))
                    : h(RecordDetail, { t, entity, recordId: selectedId, allowWrites: connection?.allowWrites === true, onLoad: loadRecords, onChanged: loadRecords })),
              )
            : null,
      );
    }

    /**
     * Parse one settled tool result's JSON text. The host renders tool results
     * as a single text block holding `JSON.stringify(value, null, 2)`.
     */
    function parseToolJson(block) {
      try {
        const content = Array.isArray(block?.content) ? block.content : [];
        const text = content
          .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('');
        if (!text) return null;
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }

    /** One clickable record row inside a chat card. */
    function CardRecord({ t, entity, record }) {
      const [opened, setOpened] = React.useState(false);
      const chips = entity === 'story'
        ? [statusChip(t, record.status), stageChip(t, record.stage), levelChip(t, t('field.pri'), record.pri)]
        : [statusChip(t, record.status), levelChip(t, t('field.severity'), record.severity), levelChip(t, t('field.pri'), record.pri)];
      return h('div', { className: 'zentao-card-row' },
        h('div', { className: 'zentao-card-row-main' },
          h('span', { className: 'zentao-card-row-title' }, `#${record.id} ${record.title}`),
          h('span', { className: 'zentao-card-row-meta' },
            ...chips,
            record.assignedTo ? h('span', { className: 'zentao-card-dim' }, `${t('card.assignee')} ${record.assignedTo}`) : null,
            record.product != null ? h('span', { className: 'zentao-card-dim' }, `${t('card.product')} #${record.product}`) : null,
          ),
        ),
        h('button', {
          type: 'button',
          className: 'zentao-card-btn',
          onClick: () => {
            focusChannel.request({ entity, id: Number(record.id), product: record.product ?? null });
            setOpened(true);
          },
        }, opened ? t('card.opened') : t('card.openInPanel')),
      );
    }

    /** Chat-side card for the ZenTao read tools; replaces the raw JSON row. */
    function ZentaoToolCard(props) {
      const { t, toolName, phase, block } = props;
      const data = phase === 'result' ? parseToolJson(block) : null;
      const kindKey = { zentao_bug: 'card.bug', zentao_bugs: 'card.bug', zentao_story: 'card.story', zentao_stories: 'card.story' }[toolName];
      const totals = data && Array.isArray(data.bugs) ? data.total ?? data.bugs.length
        : data && Array.isArray(data.stories) ? data.total ?? data.stories.length : null;
      const header = h('div', { className: 'zentao-card-head' },
        h('span', { className: 'zentao-card-brand' }, '禅道'),
        kindKey ? h('span', { className: 'zentao-card-kind' }, t(kindKey)) : null,
        totals !== null ? h('span', { className: 'zentao-card-dim' }, t('card.total', { total: totals })) : null,
      );

      if (phase !== 'result') return h('div', { className: 'zentao-card' }, header);
      if (data === null || data.ok === false) {
        return h('div', { className: 'zentao-card' }, header,
          h('div', { className: 'zentao-card-error' }, data?.message ?? t('card.empty')));
      }

      if (data.bug || data.story) {
        const entity = data.story ? 'story' : 'bug';
        const record = data.story ?? data.bug;
        const files = Array.isArray(data.richFiles) ? data.richFiles.length : 0;
        return h('div', { className: 'zentao-card' }, header,
          h('div', { className: 'zentao-card-body' },
            h(CardRecord, { t, entity, record }),
            files > 0 ? h('div', { className: 'zentao-card-dim' }, t('card.files', { count: files })) : null,
          ));
      }

      const listEntity = Array.isArray(data.stories) ? 'story' : Array.isArray(data.bugs) ? 'bug' : null;
      if (listEntity !== null) {
        const list = (listEntity === 'story' ? data.stories : data.bugs).slice(0, 5);
        return h('div', { className: 'zentao-card' }, header,
          h('div', { className: 'zentao-card-body' },
            list.map((record) => h(CardRecord, { t, entity: listEntity, record, key: record.id })),
            totals !== null && totals > list.length ? h('div', { className: 'zentao-card-dim' }, '…') : null,
          ));
      }

      return h('div', { className: 'zentao-card' }, header, h('div', { className: 'zentao-card-dim' }, t('card.empty')));
    }

    /** Copy this record's /zentao command so the user can paste it into the composer. */
    function SendToChat({ t, entity, recordId }) {
      const [hint, setHint] = React.useState(null);
      const send = () => {
        const line = `/zentao ${entity === 'stories' ? 'story' : 'bug'} ${recordId}`;
        const done = () => setHint(t('detail.sendToChatHint'));
        const fail = () => setHint(t('detail.sendToChatFailed'));
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(line).then(done, fail);
          } else {
            fail();
          }
        } catch {
          fail();
        }
      };
      return h('div', { className: 'zentao-send-chat' },
        h('button', { type: 'button', className: 'zentao-button', onClick: send }, t('detail.sendToChat')),
        hint !== null ? h('span', { className: 'zentao-send-chat-hint' }, hint) : null,
      );
    }

    const CSS = `
.zentao-page { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 20px 24px 16px; gap: 14px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); overflow: auto; }
.zentao-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-top: var(--dsh-frame-top-clearance, 0px); }
.zentao-head-text h1 { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 600; }
.zentao-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.zentao-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.zentao-field { display: flex; flex-direction: column; gap: 4px; }
.zentao-field-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.zentao-field-value { font-size: 13px; color: var(--dsw-alias-label-secondary); }
.zentao-select, .zentao-input { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 7px 10px; font-size: 13px; min-width: 220px; }
.zentao-input { min-width: 200px; }
.zentao-mine-toggle { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); padding: 7px 14px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.zentao-mine-toggle:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.zentao-mine-active { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.zentao-mine-active:hover { color: var(--dsw-alias-bg-base); }
.zentao-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; }
.zentao-seg-item { border: none; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); padding: 7px 14px; font-size: 13px; cursor: pointer; }
.zentao-seg-item + .zentao-seg-item { border-left: 1px solid var(--dsw-alias-border-l1); }
.zentao-seg-active { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.zentao-button { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 7px 14px; font-size: 13px; cursor: pointer; }
.zentao-button:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.zentao-button:disabled { opacity: 0.55; cursor: default; }
.zentao-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
.zentao-list { width: 380px; min-width: 280px; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.zentao-list-head { padding: 8px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.zentao-list-rows { overflow: auto; flex: 1; min-height: 0; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.zentao-list-empty { padding: 24px 12px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.zentao-row { display: flex; gap: 8px; align-items: flex-start; text-align: left; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; padding: 8px 10px; cursor: pointer; font-size: 13px; }
.zentao-row:hover { background: var(--dsw-alias-bg-layer-2); }
.zentao-row-selected { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
.zentao-row-id { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); font-size: 12px; padding-top: 2px; }
.zentao-row-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.zentao-row-title { overflow-wrap: anywhere; line-height: 1.35; }
.zentao-row-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.zentao-row-assignee { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.zentao-chip { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 1.5; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.zentao-chip-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.zentao-chip-error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.zentao-chip-success { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.zentao-detail-pane { flex: 1; min-width: 0; overflow: auto; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.zentao-detail { padding: 18px 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.zentao-detail-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--dsw-alias-label-secondary); text-align: center; padding: 24px; }
.zentao-detail-empty h2 { margin: 0; font-size: 15px; color: var(--dsw-alias-label-primary); font-weight: 600; }
.zentao-detail-empty p { margin: 0; font-size: 13px; }
.zentao-detail-title { margin: 0; font-size: 16px; line-height: 1.4; font-weight: 600; overflow-wrap: anywhere; }
.zentao-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.zentao-detail-head .zentao-detail-title { flex: 1; min-width: 200px; }
.zentao-meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px 20px; }
.zentao-meta-row { display: flex; gap: 8px; font-size: 13px; }
.zentao-meta-label { color: var(--dsw-alias-label-secondary); flex: none; }
.zentao-meta-value { color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.zentao-section { display: flex; flex-direction: column; gap: 6px; }
.zentao-section-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.zentao-steps { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; background: var(--dsw-alias-bg-layer-2); }
.zentao-steps img { max-width: 100%; height: auto; border-radius: 6px; }
.zentao-attachments { display: flex; flex-direction: column; gap: 8px; }
.zentao-attachments-empty { color: var(--dsw-alias-label-secondary); font-size: 13px; }
.zentao-attachment-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.zentao-attachment { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.zentao-attachment-frame { display: block; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.zentao-attachment-frame img { display: block; width: 100%; height: 110px; object-fit: cover; }
.zentao-attachment-link { color: var(--dsw-alias-brand-primary); font-size: 13px; overflow-wrap: anywhere; }
.zentao-attachment-name { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.zentao-error { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 16px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 10px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.zentao-error-title { margin: 0; font-size: 14px; color: var(--dsw-alias-state-error-primary); }
.zentao-detail .zentao-error { align-self: stretch; }
.zentao-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.zentao-conn-status { font-size: 12px; color: var(--dsw-alias-label-secondary); max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zentao-conn-ok { color: var(--dsw-alias-state-success-primary); }
.zentao-conn-off { color: var(--dsw-alias-state-warn-primary); }
.zentao-dialog-backdrop { position: fixed; inset: 0; background: color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent); display: flex; align-items: center; justify-content: center; z-index: 60; }
.zentao-dialog { display: flex; flex-direction: column; gap: 12px; width: 420px; max-width: calc(100vw - 48px); max-height: calc(100vh - 48px); overflow: auto; padding: 20px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 12px 40px rgb(0 0 0 / 0.25); }
.zentao-dialog-title { margin: 0; font-size: 15px; font-weight: 600; }
.zentao-dialog .zentao-input { min-width: 0; width: 100%; }
.zentao-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.zentao-dialog-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.zentao-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.zentao-button-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.zentao-button-primary:hover:not(:disabled) { color: var(--dsw-alias-bg-base); filter: brightness(1.08); }
.zentao-textarea { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 60px; }
.zentao-actions { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 12px 14px; background: var(--dsw-alias-bg-layer-2); }
.zentao-actions-disabled { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.zentao-actions-row { display: flex; flex-wrap: wrap; gap: 8px; }
.zentao-action-op { padding: 5px 12px; font-size: 12px; }
.zentao-action-op-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.zentao-action-form { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
.zentao-action-form .zentao-select { min-width: 0; width: 100%; }
.zentao-action-buttons { display: flex; justify-content: flex-end; gap: 8px; }
.zentao-action-feedback { font-size: 12px; }
.zentao-action-feedback-ok { color: var(--dsw-alias-state-success-primary); }
.zentao-action-feedback-err { color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.zentao-card { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); font-size: 13px; color: var(--dsw-alias-label-primary); }
.zentao-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.zentao-card-brand { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--dsw-alias-brand-primary); }
.zentao-card-kind { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.zentao-card-dim { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.zentao-card-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.zentao-card-body { display: flex; flex-direction: column; gap: 8px; }
.zentao-card-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.zentao-card-row-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.zentao-card-row-title { font-weight: 500; overflow-wrap: anywhere; line-height: 1.35; }
.zentao-card-row-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.zentao-card-btn { flex: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); padding: 3px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; }
.zentao-card-btn:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.zentao-send-chat { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.zentao-send-chat-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
`;

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zentao-panel: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, ZenTaoPage));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => t('panel.label'),
        }, ZenTaoIcon));

        // Replace the generic chat row for each ZenTao read tool with a card.
        ctx.slots.inject('tool.call.toolview', function* () {
          for (const key of ['zentao_bug', 'zentao_bugs', 'zentao_story', 'zentao_stories']) {
            yield ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS }, ZentaoToolCard);
          }
        });
      },
    };
  },
});
