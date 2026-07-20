export interface PonsFragment {
  text: string;
  pronunciation: string | null;
  annotations: string[];
}

interface HtmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: Array<HtmlNode | string>;
}

const annotationClasses = new Set([
  "age",
  "case",
  "flexion",
  "genus",
  "info",
  "region",
  "register",
  "style",
  "syntax",
  "topic",
  "usage",
  "wordclass",
]);

const voidTags = new Set(["br", "hr", "img", "input", "meta", "link"]);

export function analyzePonsFragment(input: string): PonsFragment {
  const root = parseHtmlFragment(input);
  const annotations: string[] = [];
  let pronunciation: string | null = null;

  function render(node: HtmlNode | string): string {
    if (typeof node === "string") return node;
    const classes = (node.attributes.class ?? "").split(/\s+/).filter(Boolean);

    if (classes.includes("phonetics")) {
      pronunciation ??= textContent(node, false).trim() || null;
      return "";
    }

    if (classes.some((className) => annotationClasses.has(className))) {
      const annotation = textContent(node, true).replace(/\s+/g, " ").trim();
      if (annotation && !annotations.some((existing) => existing.toLocaleLowerCase("en") === annotation.toLocaleLowerCase("en"))) {
        annotations.push(annotation);
      }
      return "";
    }

    if (node.tag === "br") return "\n";
    return node.children.map(render).join("");
  }

  let text = root.children.map(render).join("");
  if (!pronunciation) {
    const match = text.match(/\[[^\]\r\n]{1,100}\]/u)?.[0];
    if (match) {
      pronunciation = match;
      text = text.replace(match, "");
    }
  }

  return {
    text,
    pronunciation,
    annotations,
  };
}

function textContent(node: HtmlNode | string, expandAcronyms: boolean): string {
  if (typeof node === "string") return node;
  if (expandAcronyms && node.tag === "acronym" && node.attributes.title) return node.attributes.title;
  if (node.tag === "br") return "\n";
  return node.children.map((child) => textContent(child, expandAcronyms)).join("");
}

function parseHtmlFragment(input: string): HtmlNode {
  const root: HtmlNode = { tag: "root", attributes: {}, children: [] };
  const stack = [root];
  const tokens = input.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) ?? [];

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      stack.at(-1)?.children.push(token);
      continue;
    }
    if (token.startsWith("<!--")) continue;

    const closing = token.match(/^<\s*\/\s*([a-z0-9-]+)/i);
    if (closing) {
      const tag = closing[1]?.toLocaleLowerCase("en");
      while (stack.length > 1) {
        const node = stack.pop();
        if (node?.tag === tag) break;
      }
      continue;
    }

    const opening = token.match(/^<\s*([a-z0-9-]+)/i);
    if (!opening?.[1]) continue;
    const tag = opening[1].toLocaleLowerCase("en");
    const node: HtmlNode = { tag, attributes: parseAttributes(token), children: [] };
    stack.at(-1)?.children.push(node);
    if (!token.endsWith("/>") && !voidTags.has(tag)) stack.push(node);
  }

  return root;
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-z_:][a-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const match of tag.matchAll(pattern)) {
    if (match[1]) attributes[match[1].toLocaleLowerCase("en")] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}
