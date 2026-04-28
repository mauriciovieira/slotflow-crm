import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings and paragraphs", () => {
    const html = renderMarkdown("# Hi\n\nbody");
    expect(html).toContain("<h1>");
    expect(html).toContain("<p>");
  });

  it("strips raw <script> tags", () => {
    const html = renderMarkdown("safe\n\n<script>alert(1)</script>");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("strips javascript: URLs", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });
});
