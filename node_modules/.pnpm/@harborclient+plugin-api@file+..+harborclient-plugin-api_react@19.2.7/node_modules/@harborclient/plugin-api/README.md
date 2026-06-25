# @harborclient/plugin-api

TypeScript definitions for [HarborClient](https://harborclient.com/) plugin development.

This package ships `.d.ts` only — install it as a **dev dependency** for type-checking your plugin project. It tracks HarborClient releases.

## Install

```bash
pnpm add -D @harborclient/plugin-api
```

## Usage

### Renderer entry

Import types in your renderer entry module:

```tsx
import type { PluginContext } from '@harborclient/plugin-api';

export function activate(hc: PluginContext): void {
  // ...
}

export function deactivate(): void {
  // optional cleanup
}
```

Your plugin should mark `react` and `react-dom` as external in your bundler and use `hc.react` at runtime instead of bundling React.

### Main entry

Main entries run in the SES utilityProcess for HTTP hooks and custom IPC — not for React UI. Import `MainPluginContext` from the root package or `@harborclient/plugin-api/main` for main-only plugins:

```typescript
import type { MainPluginContext } from '@harborclient/plugin-api/main';

export function activate(hc: MainPluginContext): void {
  hc.subscriptions.push(
    hc.http.onBeforeSend((request) => {
      request.headers['X-Trace'] = '1';
    })
  );
}
```

## License

MIT
