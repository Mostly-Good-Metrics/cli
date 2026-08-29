import { buildProgram } from "./program.js";
import { ApiError } from "./client.js";
import { CliUsageError } from "./runtime.js";

const program = buildProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof ApiError) {
    console.error(`Error: ${err.message} (${err.code})`);
    process.exit(1);
  }
  if (err instanceof CliUsageError) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  throw err;
});
