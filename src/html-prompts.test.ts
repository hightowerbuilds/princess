import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { getPaths } from "./paths.ts";
import {
  addHtmlPromptAsset,
  addHtmlPromptSource,
  compileHtmlPromptWorkspace,
  createHtmlPromptWorkspace,
  getHtmlPromptSection,
  importHtmlPromptTable,
  listHtmlPromptResources,
  listHtmlPromptSections,
  lintHtmlPromptWorkspace,
  moveHtmlPromptSection,
  readHtmlPromptSource,
  readHtmlPromptManifest,
  removeHtmlPromptResource,
  removeHtmlPromptSection,
  upsertHtmlPromptSection,
  withWorkspaceLock,
} from "./html-prompts.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "princess-html-prompts-"));

try {
  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "home"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      const fixtureDir = path.join(tempRoot, "fixtures");
      await mkdir(fixtureDir, { recursive: true });

      section("createHtmlPromptWorkspace");

      const workspace = await createHtmlPromptWorkspace("Landing Page Build", { category: "web" });
      const paths = getPaths();
      assertEq(workspace.path, path.join(paths.inboxDir, "web", "landing-page-build"), "creates workspace under category");
      assert((await readFile(path.join(workspace.path, "prompt.html"), "utf8")).includes("data-princess-prompt"), "writes prompt.html");
      assert((await readFile(path.join(workspace.path, "manifest.json"), "utf8")).includes('"format": "html"'), "writes manifest");
      const secondWorkspace = await createHtmlPromptWorkspace("Landing Page Build", { category: "web" });
      assertEq(secondWorkspace.path, path.join(paths.inboxDir, "web", "landing-page-build-2"), "auto-suffixes colliding workspaces");

      section("addHtmlPromptSource");

      const requirementsPath = path.join(fixtureDir, "requirements.md");
      await writeFile(requirementsPath, "# Requirements\n\nUse the existing design system.\n", "utf8");
      const source = await addHtmlPromptSource("web/landing-page-build", requirementsPath, {
        name: "requirements",
        trust: "trusted",
      });
      assertEq(source.id, "requirements", "uses requested source id");
      assertEq(source.path, "sources/requirements.md", "copies source into workspace");
      assertEq(source.trust, "trusted", "stores trust level");

      const promptAfterSource = await readFile(path.join(workspace.path, "prompt.html"), "utf8");
      assert(promptAfterSource.includes('data-princess-include="requirements"'), "adds source include to prompt.html");

      section("addHtmlPromptAsset");

      const imagePath = path.join(fixtureDir, "wireframe.png");
      await writeFile(imagePath, "fake png bytes", "utf8");
      const asset = await addHtmlPromptAsset("web/landing-page-build", imagePath, {
        name: "wireframe",
        alt: "Mobile wireframe",
      });
      assertEq(asset.id, "wireframe", "uses requested asset id");
      assertEq(asset.path, "assets/wireframe.png", "copies asset into workspace");
      assertEq(asset.alt, "Mobile wireframe", "stores model-facing alt text");

      section("importHtmlPromptTable");

      const pricingPath = path.join(fixtureDir, "pricing.csv");
      await writeFile(pricingPath, "Plan,Price\nStarter,$10\nPro,$30\n", "utf8");
      const table = await importHtmlPromptTable("web/landing-page-build", pricingPath, {
        name: "pricing",
        trust: "untrusted",
      });
      assertEq(table.id, "pricing", "uses requested table id");
      assertEq(table.path, "partials/pricing.table.html", "writes table partial");
      const tableHtml = await readFile(path.join(workspace.path, table.path), "utf8");
      assert(tableHtml.includes("<table>"), "generates HTML table");
      assert(tableHtml.includes("<th>Plan</th>"), "generates table header");

      const malformedCsvPath = path.join(fixtureDir, "malformed.csv");
      await writeFile(malformedCsvPath, "feature,notes\n\"Search,Unclosed quote\n", "utf8");
      let malformedTableThrew = false;
      try {
        await importHtmlPromptTable("web/landing-page-build", malformedCsvPath, {
          name: "malformed",
          trust: "untrusted",
        });
      } catch (error) {
        malformedTableThrew =
          error instanceof Error &&
          error.message.includes("Failed to import table") &&
          error.message.includes("unterminated quoted field");
      }
      assertEq(malformedTableThrew, true, "rejects malformed CSV before adding a table resource");
      const resourcesAfterMalformed = await listHtmlPromptResources("web/landing-page-build");
      assert(!resourcesAfterMalformed.some((resource) => resource.id === "malformed"), "malformed CSV does not update manifest");

      section("upsertHtmlPromptSection");

      await upsertHtmlPromptSection("web/landing-page-build", "constraints", "Use <button> styles from the repo.");
      await upsertHtmlPromptSection("web/landing-page-build", "instructions", "<ul><li>Build the page.</li></ul>", {
        heading: "Task",
        mode: "html",
      });
      const promptSource = await readHtmlPromptSource("web/landing-page-build");
      assert(promptSource.includes('data-princess-role="constraints"'), "adds new semantic section");
      assert(promptSource.includes("Use &lt;button&gt; styles from the repo."), "escapes text sections");
      assert(promptSource.includes("<ul><li>Build the page.</li></ul>"), "allows explicit HTML sections");
      assert(promptSource.includes("<h2>Task</h2>"), "uses custom section heading");

      section("manifest");

      const manifest = await readHtmlPromptManifest(workspace.path);
      assertEq(manifest.resources.length, 3, "tracks three resources");
      assertEq(manifest.resources.map((resource) => resource.type), ["source", "asset", "table"], "tracks resource types");

      section("compileHtmlPromptWorkspace");

      const compiledHtml = await compileHtmlPromptWorkspace("web/landing-page-build");
      assertEq(compiledHtml.target, "html", "defaults to HTML compile target");
      assert(compiledHtml.content.includes("Use the existing design system."), "expands source content into compiled HTML");
      assert(compiledHtml.content.includes("<table>"), "expands table partial into compiled HTML");
      assert((await readFile(compiledHtml.path, "utf8")).includes("Compiled by Princess"), "writes compiled HTML to dist");

      const compiledMarkdown = await compileHtmlPromptWorkspace("web/landing-page-build", { target: "markdown" });
      assert(compiledMarkdown.path.endsWith("compiled.md"), "writes markdown compile target");
      assert(compiledMarkdown.content.includes("## Asset Attachments"), "markdown compile lists assets");
      assert(compiledMarkdown.content.includes("Mobile wireframe"), "markdown compile includes asset alt text");

      const compiledJson = await compileHtmlPromptWorkspace("web/landing-page-build", { target: "json" });
      const parsedJson = JSON.parse(compiledJson.content);
      assertEq(parsedJson.format, "princess-html-compiled", "writes structured compiled package");
      assertEq(parsedJson.attachments[0].id, "wireframe", "structured package lists asset attachments");
      assert(parsedJson.prompt.content.includes("Use the existing design system."), "structured package includes compiled HTML content");

      section("listHtmlPromptResources");

      const resources = await listHtmlPromptResources("web/landing-page-build");
      assertEq(resources.map((resource) => resource.id), ["requirements", "wireframe", "pricing"], "lists resources in manifest order");

      section("removeHtmlPromptResource");

      const removed = await removeHtmlPromptResource("web/landing-page-build", "pricing", { deleteFile: true });
      assertEq(removed?.id, "pricing", "removes requested resource");
      const afterRemove = await listHtmlPromptResources("web/landing-page-build");
      assertEq(afterRemove.map((resource) => resource.id), ["requirements", "wireframe"], "updates manifest after remove");
      const promptAfterRemove = await readFile(path.join(workspace.path, "prompt.html"), "utf8");
      assert(!promptAfterRemove.includes('data-princess-id="pricing"'), "removes resource snippet from prompt.html");

      section("lintHtmlPromptWorkspace");

      const issues = await lintHtmlPromptWorkspace("web/landing-page-build");
      assertEq(issues.filter((issue) => issue.severity === "error").length, 0, "valid workspace has no lint errors");

      await writeFile(path.join(workspace.path, "prompt.html"), "<script>alert('x')</script>", "utf8");
      const unsafeIssues = await lintHtmlPromptWorkspace("web/landing-page-build");
      assert(unsafeIssues.some((issue) => issue.code === "forbidden-tag"), "lint catches forbidden tags");

      section("section operations");

      const sectionsWs = await createHtmlPromptWorkspace("Sections Demo");
      await upsertHtmlPromptSection("sections-demo", "context", "Background notes.");
      await upsertHtmlPromptSection("sections-demo", "constraints", "Avoid frameworks.");
      await upsertHtmlPromptSection("sections-demo", "output-format", "Plain text.");

      const listed = await listHtmlPromptSections("sections-demo");
      const roles = listed.map((s) => s.role);
      assert(roles.includes("instructions"), "list includes default instructions section");
      assert(roles.includes("context"), "list includes added context section");
      assert(roles.includes("constraints"), "list includes added constraints section");
      assert(roles.includes("output-format"), "list includes added output-format section");
      assert(roles.includes("resources"), "list includes resources section");

      let invalidRoleThrew = false;
      try {
        await upsertHtmlPromptSection("sections-demo", "!!!", "This role should fail.");
      } catch (error) {
        invalidRoleThrew =
          error instanceof Error &&
          error.message.includes('Invalid section role "!!!"');
      }
      assertEq(invalidRoleThrew, true, "rejects section roles that do not contain letters or numbers");

      const constraintSection = await getHtmlPromptSection("sections-demo", "constraints");
      assert(constraintSection !== null, "getHtmlPromptSection returns the requested section");
      assert(constraintSection!.html.includes("Avoid frameworks."), "section html contains the upserted body");
      assertEq(constraintSection!.role, "constraints", "section role matches");

      const missing = await getHtmlPromptSection("sections-demo", "nonexistent");
      assertEq(missing, null, "getHtmlPromptSection returns null for unknown role");

      const beforeMove = (await listHtmlPromptSections("sections-demo")).map((s) => s.role);
      const constraintsIdx = beforeMove.indexOf("constraints");
      const contextIdx = beforeMove.indexOf("context");
      assert(contextIdx < constraintsIdx, "context originally precedes constraints");

      await moveHtmlPromptSection("sections-demo", "constraints", { before: "context" });
      const afterMoveBefore = (await listHtmlPromptSections("sections-demo")).map((s) => s.role);
      assert(afterMoveBefore.indexOf("constraints") < afterMoveBefore.indexOf("context"), "move --before places source before reference");

      await moveHtmlPromptSection("sections-demo", "constraints", { after: "output-format" });
      const afterMoveAfter = (await listHtmlPromptSections("sections-demo")).map((s) => s.role);
      assert(afterMoveAfter.indexOf("constraints") > afterMoveAfter.indexOf("output-format"), "move --after places source after reference");

      await moveHtmlPromptSection("sections-demo", "constraints", { to: 0 });
      const afterMoveTo = (await listHtmlPromptSections("sections-demo")).map((s) => s.role);
      assertEq(afterMoveTo[0], "constraints", "move --to 0 places source at the beginning");

      const sectionRemoved = await removeHtmlPromptSection("sections-demo", "context");
      assertEq(sectionRemoved, true, "removeHtmlPromptSection returns true when removed");
      const afterRemoveSections = (await listHtmlPromptSections("sections-demo")).map((s) => s.role);
      assert(!afterRemoveSections.includes("context"), "removed section no longer listed");

      const removeMissing = await removeHtmlPromptSection("sections-demo", "nonexistent");
      assertEq(removeMissing, false, "removeHtmlPromptSection returns false for unknown role");

      let reservedThrew = false;
      try {
        await removeHtmlPromptSection("sections-demo", "resources");
      } catch {
        reservedThrew = true;
      }
      assertEq(reservedThrew, true, "removeHtmlPromptSection refuses to delete the auto-managed resources section");

      let moveReservedThrew = false;
      try {
        await moveHtmlPromptSection("sections-demo", "resources", { to: 0 });
      } catch {
        moveReservedThrew = true;
      }
      assertEq(moveReservedThrew, true, "moveHtmlPromptSection refuses to move the auto-managed resources section");
    },
  );

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "concurrent-writes"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      section("parallel resource writes preserve every resource");

      const paths = getPaths();
      await mkdir(paths.inboxDir, { recursive: true });
      await createHtmlPromptWorkspace("Concurrency Drill", {});

      const fixtureDir = path.join(tempRoot, "concurrent-writes-fixtures");
      await mkdir(fixtureDir, { recursive: true });
      const sourceA = path.join(fixtureDir, "alpha.md");
      const sourceB = path.join(fixtureDir, "bravo.md");
      const assetC = path.join(fixtureDir, "charlie.svg");
      const tableD = path.join(fixtureDir, "delta.csv");
      await writeFile(sourceA, "# alpha\n", "utf8");
      await writeFile(sourceB, "# bravo\n", "utf8");
      await writeFile(assetC, "<svg></svg>\n", "utf8");
      await writeFile(tableD, "Name,Value\nx,1\ny,2\n", "utf8");

      await Promise.all([
        addHtmlPromptSource("concurrency-drill", sourceA, { name: "alpha" }),
        addHtmlPromptSource("concurrency-drill", sourceB, { name: "bravo" }),
        addHtmlPromptAsset("concurrency-drill", assetC, { name: "charlie", alt: "Charlie diagram" }),
        importHtmlPromptTable("concurrency-drill", tableD, { name: "delta" }),
      ]);

      const resources = await listHtmlPromptResources("concurrency-drill");
      const ids = resources.map((r) => r.id).sort();
      assertEq(ids, ["alpha", "bravo", "charlie", "delta"], "all four parallel resources land in the manifest");

      const promptHtml = await readHtmlPromptSource("concurrency-drill");
      assert(promptHtml.includes('data-princess-id="alpha"'), "prompt.html contains alpha snippet");
      assert(promptHtml.includes('data-princess-id="bravo"'), "prompt.html contains bravo snippet");
      assert(promptHtml.includes('data-princess-id="charlie"'), "prompt.html contains charlie snippet");
      assert(promptHtml.includes('data-princess-id="delta"'), "prompt.html contains delta snippet");

      const lintIssues = await lintHtmlPromptWorkspace("concurrency-drill");
      assertEq(lintIssues, [], "lint passes after parallel resource writes");
    },
  );

  await withEnv(
    {
      PRINCESS_HOME: path.join(tempRoot, "lock-timeout"),
      XDG_DATA_HOME: undefined,
      XDG_CONFIG_HOME: undefined,
    },
    async () => {
      section("lock timeout surfaces a workspace-aware error");

      const paths = getPaths();
      await mkdir(paths.inboxDir, { recursive: true });
      const ws = await createHtmlPromptWorkspace("Timeout Drill", {});

      const lockPath = path.join(ws.path, ".princess.lock");
      const holderPayload = {
        pid: process.pid,
        hostname: os.hostname(),
        acquiredAt: new Date().toISOString(),
      };
      await writeFile(lockPath, `${JSON.stringify(holderPayload)}\n`, { flag: "wx" });

      let caught: Error | null = null;
      try {
        await withWorkspaceLock(
          ws.path,
          async () => "should not run",
          { timeoutMs: 80, staleAfterMs: 60_000 },
        );
      } catch (err) {
        caught = err as Error;
      }

      assert(caught !== null, "withWorkspaceLock throws when the lock is held");
      assert(
        caught !== null && caught.message.includes("timeout-drill"),
        "timeout error includes the inbox-relative workspace ref",
      );
      assert(
        caught !== null && !caught.message.includes(".princess.lock"),
        "timeout error hides the lock filename",
      );
      assert(
        caught !== null && !/(^|\s)\/[A-Za-z0-9_.\-/]+/.test(caught.message),
        "timeout error hides absolute filesystem paths",
      );

      await rm(lockPath, { force: true });
    },
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
