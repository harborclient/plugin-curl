import { useEffect, useMemo, useState } from '@harborclient/sdk/react';
import type { PluginContext, RequestTabContext } from '@harborclient/sdk';
import { copyToClipboard } from '@harborclient/sdk/clipboard';
import { Button, CodeEditor, FieldError } from '@harborclient/sdk/components';
import { buildCurlCommand } from './buildCurl';
import { CurlParseError, parseCurl } from './parseCurl';

interface Props {
  /**
   * Read-only request tab context from HarborClient.
   */
  context: RequestTabContext;

  /**
   * Renderer plugin context for clipboard, toast, and draft updates.
   */
  hc: PluginContext;
}

/**
 * Displays an editable curl command for the active request with copy and update actions.
 *
 * The editor stays in sync when the request changes elsewhere. Clicking Update parses the
 * edited command and applies it to the active request via `hc.host.applyRequestDraft`.
 */
export function CurlTab({ context, hc }: Props) {
  /**
   * Equivalent curl command derived from the active request context.
   */
  const command = useMemo(() => buildCurlCommand(context), [context]);

  const [draftText, setDraftText] = useState(command);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  /**
   * Resyncs the editor when the generated command changes (request edited in other tabs).
   */
  useEffect(() => {
    setDraftText(command);
    setUpdateError(null);
  }, [command]);

  /**
   * Copies the current editor contents to the clipboard.
   */
  const handleCopy = async (): Promise<void> => {
    setCopyError(null);
    try {
      await copyToClipboard(hc, draftText, { toast: 'Copied to clipboard' });
    } catch {
      setCopyError('Failed to copy');
    }
  };

  /**
   * Parses the edited curl command and applies it to the active request draft.
   */
  const handleUpdate = async (): Promise<void> => {
    setUpdateError(null);
    setUpdating(true);
    try {
      const payload = parseCurl(draftText);
      await hc.host.applyRequestDraft(payload);
      hc.ui.showToast('Request updated from cURL');
    } catch (error) {
      const message =
        error instanceof CurlParseError
          ? error.message
          : error instanceof Error
          ? error.message
          : 'Failed to update request from cURL';
      setUpdateError(message);
    } finally {
      setUpdating(false);
    }
  };

  const dirty = draftText !== command;
  const errorMessage = updateError ?? copyError;
  const errorId = updateError ? 'curl-update-error' : 'curl-copy-error';

  return (
    <div className="flex flex-col gap-2" style={{ minHeight: '320px' }}>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          variant="secondary"
          aria-label="Update request from cURL command"
          disabled={updating || !dirty}
          onClick={() => {
            void handleUpdate();
          }}
        >
          {updating ? 'Updating…' : 'Update'}
        </Button>
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
        value={draftText}
        onChange={setDraftText}
        language="shell"
        minHeight="280px"
        className="flex-1"
        aria-label="cURL command"
        aria-invalid={Boolean(updateError)}
        aria-describedby={errorMessage ? errorId : undefined}
      />
      <FieldError id={errorId} roleAlert>
        {errorMessage}
      </FieldError>
    </div>
  );
}
