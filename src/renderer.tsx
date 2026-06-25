import { installReact } from "@harborclient/plugin-api";
import type { PluginContext } from "@harborclient/plugin-api";
import { CurlTab } from "./CurlTab";

/**
 * Registers the cURL request editor tab when the plugin activates.
 *
 * @param hc - Plugin API surface from HarborClient.
 */
export function activate(hc: PluginContext): void {
  installReact(hc.react);

  hc.subscriptions.push(
    hc.ui.registerRequestTab({
      id: "curl",
      title: "cURL",
      order: 45,
      Component: ({ context }) => <CurlTab context={context} hc={hc} />,
    })
  );
}
