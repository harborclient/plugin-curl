# HarborClient cURL Plugin

Adds a **cURL** tab to the request editor that shows an equivalent `curl` command for the configured request. The command is editable — change it and click **Update** to apply the parsed request back to the active tab. A **Copy** button copies the current editor text.

![Screenshot](screenshot.png)

## Install

Build the plugin, then install the `.hcp` package or load the project folder unpacked:

```bash
pnpm install
pnpm build
```

In HarborClient: **Settings → Plugins → Load unpacked…** and select this directory.

Requires HarborClient with `hc.host.applyRequestDraft` support (SDK `@harborclient/sdk` ≥ 1.1.31).

## Development

```bash
pnpm dev
```

Rebuilds `dist/renderer.js` on change when HarborClient file watching is enabled for unpacked plugins.

## Bidirectional editing

1. Open a request and switch to the **cURL** tab to see the generated command.
2. Edit the command in the editor (method, URL, headers, body flags).
3. Click **Update** to parse the command and replace the active request’s method, URL, headers, and body.
4. Click **Copy** to copy the current editor contents.

The editor resyncs when you edit the request in other tabs (Params, Headers, Body, etc.).

## Limitations

| Aspect            | Behavior                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| Variables         | Resolved from collection + active environment (environment wins on dupes) |
| Cookie jar        | Not included unless a `Cookie` header is set manually                     |
| Pre/post scripts  | Do not affect displayed cURL; Update does not modify scripts              |
| Multipart files   | Uses stored file paths (`@/path`) on the local machine                    |
| Auth tab          | Generated Authorization headers round-trip as headers, not Auth tab mode  |
| Unsupported flags | Common browser “Copy as cURL” noise flags are ignored; unknown flags skip |

## License

MIT
