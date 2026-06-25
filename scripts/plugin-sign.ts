import { runSignCli } from "@harborclient/plugin-api/signing";

/**
 * Delegates to the plugin-api signing CLI.
 */
const exitCode = await runSignCli(process.argv);
process.exit(exitCode);
