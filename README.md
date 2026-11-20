# ZenTao Panel for DeepSeek Harness

A sidebar panel plugin for the DeepSeek Harness web UI that browses and manages [ZenTao](https://www.zentao.net/) (禅道) products, bugs, and stories over the REST v2 API.

![icon](icon.svg)

## Features

- **Configurable connection** — sign in from the panel with your own server URL, account, and password. Credentials are persisted through the harness profile config and never exposed to the browser.
- **Bug & story browsing** — switch between bugs and development stories per product, or across **all products** at once (merged, newest first).
- **Filters** — unresolved/all scope, a "mine only" toggle (records assigned to or created by the signed-in account, with per-product counts), and id/title search.
- **Detail view** — status/stage/priority metadata, sanitized rich-text descriptions and acceptance criteria, inline previews for embedded images, and download links for attachments.
- **Write actions** (opt-in via the "allow writes" switch): assign, resolve, close, activate, and comment — each verified by reading the record back after the write.
- **In-chat record cards** — `zentao_bug` / `zentao_story` / list results render as structured cards in the conversation (status, priority, stage, assignee, attachment count) instead of raw JSON, with an **Open in panel** button that focuses the matching record.
- **Slash command cards** — `/zentao <id>`, `/zentao bug <id>`, `/zentao story <id>`, and `/zentao-mine` display cards through DSH's dedicated `conversation.chat.commandview` slot. My work is grouped into Bugs and Stories with status, priority, assignee, and panel navigation. Commands do not start a model turn.
- **Panel → chat** — a record's **Send to chat** button copies a ready-to-run `/zentao …` command for the composer.
- **Agent tools** — `zentao_products`, `zentao_bugs`, `zentao_bug`, `zentao_stories`, `zentao_story`, `zentao_connection`, and `zentao_file` are registered so the assistant can query the same data in conversation. A system-prompt section tells the agent when to use them and that writes stay panel-only.

## Requirements

- A running DeepSeek Harness installation (desktop)
- A ZenTao instance (tested against ZenTao 22.5) with REST v2 enabled and an account that can see the target products

## Install

### From source (link install)

1. Clone this repository anywhere on the machine running DeepSeek Harness:

   ```powershell
   git clone https://github.com/xxoxxsxx/zentao-panel.git D:\dsh-plugin\zentao-panel
   ```

2. Link it into the harness profile by adding it to the profile's `package.json` (found under `~/.dsh/profiles/<profile>/`):

   ```json
   {
     "dependencies": {
       "@local/zentao-panel": "link:D:/dsh-plugin/zentao-panel"
     },
     "dsh": {
       "profile": {
         "bundles": ["@local/zentao-panel"]
       }
     }
   }
   ```

   If a `bundles` array already exists, append `"@local/zentao-panel"` instead of replacing it.

3. Install dependencies so the link resolves:

   ```powershell
   pnpm install --dir <profile-dir>
   ```

4. Restart DeepSeek Harness. The panel appears in the web UI sidebar; click **Connect** (连接) to fill in the server URL, account, and password.

### Enable write actions

Write operations are disabled by default. In the Connect dialog, check **允许写操作** (allow writes) before saving. Every write is confirmed by re-reading the record from ZenTao; a write that does not stick raises an error instead of silently succeeding.

## Usage notes

- **Chat integration**: tool calls use `tool.call.toolview`; slash commands use `conversation.chat.commandview`. Both have their own styles and do not require opening the panel first. **Open in panel** switches to ZenTao and selects the record.
- **Saved command results**: new commands save versioned record snapshots in the ordinary command result text, so reopening a conversation restores cards without re-querying ZenTao. Each category initially shows five rows and can expand its saved rows (up to 50 per category). Missing or failed product reads are explicitly marked as incomplete with unknown totals.
- **Older messages**: version 1.2.0 command text is restored into cards where possible. Those old lists saved only ten records per category; cards report saved/total counts and do not invent missing metadata or fetch current records to replace historical results. Unrecognized formats retain their original text.
- **Send to chat** copies the command to the clipboard; the panel does not inject messages into a session directly, because message admission belongs to the session/agent layer.
- **Comments**: ZenTao's REST v2 has no dedicated comment endpoint on this instance (the `comment` route returns 403), so comments are submitted through an assign action that keeps the current assignee unchanged. ZenTao records it as an "Assigned" action carrying the comment.
- **Write routes** require the record id as a query parameter (`?bugID=` / `?storyID=`) in addition to the path; the client handles this automatically.
- **Resolve with "duplicate"** requires a duplicate bug id; the panel prompts for it.
- **Story changes** (title/spec editing with review flow) are intentionally not exposed — they involve reviewer state and optimistic locking that deserve a dedicated UI.
- The `size` field returned by `GET /files/:id` is unreliable on some ZenTao instances and is never surfaced by this plugin.

## Architecture

```
index.js    host half: config schema, /zentao-api proxy routes, write actions, agent tools
zentao.js   REST v2 client: token auth, reads, writes, file download, post-write verification
client.js   browser panel: connection dialog, filters, list/detail panes, action bar
```

The host half holds the credentials and proxies every request, so the browser never sees the token or password. Client code is served per-request with a content-hash revision; host code reloads through the harness HMR watcher.

## Development

```powershell
node --check index.js    # syntax-check each file after edits
node --check client.js
node --check zentao.js
node --test test/*.test.mjs  # command protocol, history decoding, and slot/navigation contracts
```

The tests use synthetic tickets and no ZenTao credentials. They cover command snapshots, legacy text, partial failures, truncation and registration/navigation. They do not emulate React/DOM or establish visual correctness; check the running DSH page for layout, light/dark themes and click behavior.

Client-side changes take effect after refreshing the web UI; host-side changes are picked up by HMR (restart the app if a profile-level reload was needed).

## Contributing

1. Fork the repository and create a feature branch from `main`.
2. Keep credentials and server addresses out of the code — the connection is user-configured by design.
3. Run the syntax checks above and test against a ZenTao instance before opening a pull request.
4. Keep commits small and descriptive (Conventional Commits style: `feat:`, `fix:`, `docs:` …).

## License

MIT
