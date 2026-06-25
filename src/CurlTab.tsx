import { useMemo, useState } from "@harborclient/sdk/react";
import type {
  PluginContext,
  RequestTabContext,
} from "@harborclient/sdk";
import { copyToClipboard } from "@harborclient/sdk/clipboard";
import { buildCurlCommand } from "./buildCurl";

interface Props {
  /**
   * Read-only request tab context from HarborClient.
   */
  context: RequestTabContext;

  /**
   * Renderer plugin context for clipboard and toast feedback.
   */
  hc: PluginContext;
}

/**
 * Displays the equivalent curl command for the active request with a copy action.
 */
export function CurlTab({ context, hc }: Props) {
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
      await copyToClipboard(hc, command, { toast: "Copied to clipboard" });
    } catch {
      setCopyError("Failed to copy");
    }
  };

  return (
    <div className="flex flex-col gap-2" style={{ minHeight: "320px" }}>
      <div className="flex shrink-0 items-center justify-end">
        <button
          type="button"
          className="rounded-md bg-control px-3 py-1.5 text-[14px] text-text hover:bg-control-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Copy cURL command"
          onClick={() => {
            void handleCopy();
          }}
        >
          Copy
        </button>
      </div>
      <textarea
        readOnly
        rows={14}
        aria-label="cURL command"
        aria-invalid={copyError != null}
        aria-describedby={copyError != null ? "curl-copy-error" : undefined}
        className="w-full flex-1 resize-y rounded-md border border-separator bg-control p-3 font-mono text-[14px] text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ minHeight: "280px", width: "100%" }}
        value={command}
      />
      {copyError != null ? (
        <p
          id="curl-copy-error"
          className="text-[14px] text-danger"
          role="status"
        >
          {copyError}
        </p>
      ) : null}
    </div>
  );
}
