import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    // Disallow protocol-relative URLs (`//evil.com`): require either a known
    // scheme, an in-page anchor, or a single leading slash followed by a
    // non-slash character (root-relative path).
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|#|\/[^/])/i,
  });
}
