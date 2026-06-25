import { installReact } from "@harborclient/sdk";
import type { PluginContext } from "@harborclient/sdk";
import { CurlTab } from "./CurlTab";

/**
 * Registers the cURL request editor tab when the plugin activates.
 *
 * @param hc - SDK surface from HarborClient.
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
