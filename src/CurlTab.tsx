import { useMemo, useState } from '@harborclient/sdk/react';
import type { PluginContext, RequestTabContext } from '@harborclient/sdk';
import { copyToClipboard } from '@harborclient/sdk/clipboard';
import { Button, CodeEditor, FieldError } from '@harborclient/sdk/components';
import { buildCurlCommand } from './buildCurl';

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
      await copyToClipboard(hc, command, { toast: 'Copied to clipboard' });
    } catch {
      setCopyError('Failed to copy');
    }
  };

  return (
    <div className="flex flex-col gap-2" style={{ minHeight: '320px' }}>
      <div className="flex shrink-0 items-center justify-end">
        <Button
          variant="secondary"
          aria-label="Copy cURL command"
          onClick={() => {
            void handleCopy();
          }}
        >
          Copy
        </Button>
      </div>
      <CodeEditor
        value={command}
        language="shell"
        readOnly
        minHeight="280px"
        className="flex-1"
        aria-label="cURL command"
      />
      <FieldError id="curl-copy-error" roleAlert>
        {copyError}
      </FieldError>
    </div>
  );
}
