import type { RequestTabContext } from "@harborclient/plugin-api";
import { buildCurlCommand } from "./buildCurl";

type ReactModule = typeof import("react");

interface CurlTabProps {
  /**
   * Read-only request tab context from HarborClient.
   */
  context: RequestTabContext;

  /**
   * Shows non-blocking success feedback after copy.
   */
  showToast: (message: string) => void;
}

/**
 * Creates the cURL tab component using the host React instance (no bundled react import).
 *
 * @param React - React namespace from `hc.react`.
 */
export function createCurlTab(
  React: ReactModule
): ReactModule.ComponentType<CurlTabProps> {
  const { createElement: h, useMemo, useState } = React;

  /**
   * Displays the equivalent curl command for the active request with a copy action.
   */
  function CurlTab({
    context,
    showToast,
  }: CurlTabProps): ReactModule.ReactElement {
    /**
     * Equivalent curl command derived from the active request context.
     */
    const command = useMemo(() => buildCurlCommand(context), [context]);

    const [copyError, setCopyError] = useState<string | null>(null);

    /**
     * Copies the generated curl command to the clipboard.
     */
    const handleCopy = async (): Promise<void> => {
      setCopyError(null);
      try {
        await navigator.clipboard.writeText(command);
        showToast("Copied to clipboard");
      } catch {
        setCopyError("Failed to copy");
      }
    };

    return h(
      "div",
      { className: "flex flex-col gap-2", style: { minHeight: "320px" } },
      h(
        "div",
        { className: "flex shrink-0 items-center justify-end" },
        h(
          "button",
          {
            type: "button",
            className:
              "rounded-md bg-control px-3 py-1.5 text-[14px] text-text hover:bg-control-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            "aria-label": "Copy cURL command",
            onClick: () => {
              void handleCopy();
            },
          },
          "Copy"
        )
      ),
      h("textarea", {
        readOnly: true,
        rows: 14,
        "aria-label": "cURL command",
        "aria-invalid": copyError != null,
        "aria-describedby": copyError != null ? "curl-copy-error" : undefined,
        className:
          "w-full flex-1 resize-y rounded-md border border-separator bg-control p-3 font-mono text-[14px] text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        style: { minHeight: "280px", width: "100%" },
        value: command,
      }),
      copyError != null
        ? h(
            "p",
            {
              id: "curl-copy-error",
              className: "text-[14px] text-danger",
              role: "status",
            },
            copyError
          )
        : null
    );
  }

  return CurlTab;
}
