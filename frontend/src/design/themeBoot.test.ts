import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { beforePaintScript } from "./theme";

function extractInlineBootScript(html: string): string {
  const start = html.indexOf("<script>");
  const end = html.indexOf("</script>", start);
  if (start === -1 || end === -1) throw new Error("No <script> block in index.html");
  return html.slice(start + "<script>".length, end);
}

function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^ */)?.[0].length ?? 0);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n").trim();
}

describe("theme boot sync", () => {
  it("index.html inline boot script matches beforePaintScript", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const inline = dedent(extractInlineBootScript(html));
    const expected = dedent(beforePaintScript);
    expect(inline).toBe(expected);
  });
});
