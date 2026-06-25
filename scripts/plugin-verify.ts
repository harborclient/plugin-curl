import { runVerifyCli } from "@harborclient/plugin-api/signing";

/**
 * Delegates to the plugin-api verification CLI.
 */
const exitCode = await runVerifyCli(process.argv);
process.exit(exitCode);
