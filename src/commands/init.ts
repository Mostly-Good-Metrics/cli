import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import { saveContext } from "../context.js";
import readline from "node:readline";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Set up a project in the current directory")
    .option("--project <name>", "Project name (skip prompt)")
    .option("--org <slug>", "Organization slug")
    .option("--sdk <type>", "SDK type (js, react-native, swift, android, flutter)")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; org?: string; sdk?: string; json?: boolean }) => {
      auth.requireToken();

      const { user, organizations } = await client.getMe();
      if (organizations.length === 0) {
        console.error("No organizations found. Create one at app.mostlygoodmetrics.com first.");
        process.exit(1);
      }

      let orgSlug = opts.org;
      if (!orgSlug) {
        if (organizations.length === 1) {
          orgSlug = organizations[0].slug;
        } else {
          console.log("Organizations:");
          organizations.forEach((o, i) => console.log(`  ${i + 1}. ${o.name} (${o.slug})`));
          const choice = await prompt("Select organization [1]: ");
          const idx = (parseInt(choice) || 1) - 1;
          orgSlug = organizations[idx]?.slug ?? organizations[0].slug;
        }
      }

      const projectName = opts.project ?? (await prompt("Project name: "));
      if (!projectName) {
        console.error("Project name is required.");
        process.exit(1);
      }

      console.log(`Creating project "${projectName}" in ${orgSlug}...`);
      const { project } = await client.createProject(orgSlug, projectName);

      console.log("Creating API key...");
      const { api_key } = await client.createApiKey(project.id, "Development");

      saveContext(project.id, orgSlug);

      if (opts.json) {
        const { json } = await import("../output.js");
        json({ project, api_key });
        return;
      }

      console.log();
      console.log("Project initialized!");
      console.log(`  Project: ${project.name} (${project.id})`);
      console.log(`  API Key: ${api_key.key}`);
      console.log();
      console.log("A .mgm.json file has been created in this directory.");
      console.log();

      if (opts.sdk) {
        printSdkInstructions(opts.sdk, api_key.key);
      } else {
        console.log("Install an SDK to start tracking events:");
        console.log("  npm install @mostly-good-metrics/javascript");
        console.log("  npm install @mostly-good-metrics/react-native");
        console.log();
        console.log("See https://docs.mostlygoodmetrics.com for all platforms.");
      }
    });
}

function printSdkInstructions(sdk: string, apiKey: string): void {
  console.log("SDK setup:");
  console.log();

  switch (sdk) {
    case "js":
    case "javascript":
      console.log("  npm install @mostly-good-metrics/javascript");
      console.log();
      console.log("  import MostlyGoodMetrics from '@mostly-good-metrics/javascript';");
      console.log(`  MostlyGoodMetrics.init('${apiKey}');`);
      break;
    case "react-native":
      console.log("  npm install @mostly-good-metrics/react-native");
      console.log();
      console.log("  import MostlyGoodMetrics from '@mostly-good-metrics/react-native';");
      console.log(`  MostlyGoodMetrics.init('${apiKey}');`);
      break;
    case "swift":
      console.log("  // Add to Package.swift:");
      console.log('  .package(url: "https://github.com/Mostly-Good-Metrics/mostly-good-metrics-swift-sdk.git", from: "1.0.0")');
      console.log();
      console.log("  import MostlyGoodMetrics");
      console.log(`  MostlyGoodMetrics.configure(apiKey: "${apiKey}")`);
      break;
    case "android":
    case "kotlin":
      console.log('  implementation("io.github.mostly-good-metrics:mgm-sdk:1.0.0")');
      console.log();
      console.log(`  MostlyGoodMetrics.configure(context, "${apiKey}")`);
      break;
    case "flutter":
    case "dart":
      console.log("  # pubspec.yaml:");
      console.log("  mostly_good_metrics_flutter: ^1.0.0");
      console.log();
      console.log(`  MostlyGoodMetrics.configure(apiKey: '${apiKey}');`);
      break;
    default:
      console.log(`  Unknown SDK type: ${sdk}`);
      console.log("  Supported: js, react-native, swift, android, flutter");
  }
}
