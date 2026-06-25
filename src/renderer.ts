import type { PluginContext } from "@harborclient/plugin-api";
import { createCurlTab } from "./CurlTab";

/**
 * Registers the cURL request editor tab when the plugin activates.
 *
 * @param hc - Plugin API surface from HarborClient.
 */
export function activate(hc: PluginContext): void {
  const showToast = hc.ui.showToast.bind(hc.ui);
  const CurlTab = createCurlTab(hc.react);
  const { createElement: h } = hc.react;

  hc.subscriptions.push(
    hc.ui.registerRequestTab({
      id: "curl",
      title: "cURL",
      order: 45,
      Component: ({ context }) => h(CurlTab, { context, showToast }),
    })
  );
}
