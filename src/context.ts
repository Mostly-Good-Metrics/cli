import fs from "node:fs";
import path from "node:path";

const CONTEXT_FILE = ".mgm.json";

interface ProjectContext {
  project_id: string;
  org_slug: string;
}

export function findContextFile(): string | null {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, CONTEXT_FILE);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadContext(): ProjectContext | null {
  const file = findContextFile();
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as ProjectContext;
  } catch {
    return null;
  }
}

export function saveContext(projectId: string, orgSlug: string): void {
  const data: ProjectContext = { project_id: projectId, org_slug: orgSlug };
  fs.writeFileSync(
    path.join(process.cwd(), CONTEXT_FILE),
    JSON.stringify(data, null, 2) + "\n",
  );
}

export function requireProjectId(projectFlag?: string): string {
  if (projectFlag) return projectFlag;
  const ctx = loadContext();
  if (ctx?.project_id) return ctx.project_id;
  console.error("No project context. Run `mgm init` or pass --project <id>.");
  process.exit(1);
}
