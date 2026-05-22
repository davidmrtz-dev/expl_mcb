import fs from "node:fs/promises";
import path from "node:path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import { logger } from "../utils/logger.js";

// tree-sitter-typescript exports { typescript, tsx }
const TS = TypeScript.typescript;
const TSX = TypeScript.tsx;

export type SymbolType =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "export"
  | "block";

export interface ParsedSymbol {
  name: string;
  symbolType: SymbolType;
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
}

const JS_TS_NODE_TYPES: Record<string, SymbolType> = {
  function_declaration: "function",
  generator_function_declaration: "function",
  class_declaration: "class",
  method_definition: "method",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  export_statement: "export",
  lexical_declaration: "block",
  variable_declaration: "block",
};

function pickParser(ext: string): Parser {
  const parser = new Parser();
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") {
    parser.setLanguage(TS);
  } else if (ext === ".tsx") {
    parser.setLanguage(TSX);
  } else {
    parser.setLanguage(JavaScript);
  }
  return parser;
}

function nodeName(node: Parser.SyntaxNode): string {
  const nameNode =
    node.childForFieldName("name") ??
    node.namedChildren.find((c) => c.type === "identifier" || c.type === "property_identifier");
  if (nameNode) return nameNode.text;
  return node.type;
}

function collectSymbols(node: Parser.SyntaxNode, out: ParsedSymbol[]): void {
  const symbolType = JS_TS_NODE_TYPES[node.type];
  if (symbolType && node.namedChildCount > 0) {
    out.push({
      name: nodeName(node),
      symbolType,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startByte: node.startIndex,
      endByte: node.endIndex,
    });
  }

  for (const child of node.namedChildren) {
    collectSymbols(child, out);
  }
}

export interface ParseResult {
  symbols: ParsedSymbol[];
  source: string;
}

export async function parseFile(
  absolutePath: string,
  extension: string,
): Promise<ParseResult | null> {
  const source = await fs.readFile(absolutePath, "utf8");
  if (!source.trim()) return null;

  try {
    const parser = pickParser(extension);
    const tree = parser.parse(source);
    const symbols: ParsedSymbol[] = [];
    collectSymbols(tree.rootNode, symbols);
    return { symbols, source };
  } catch (err) {
    logger.warn("Tree-sitter parse failed", {
      file: absolutePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return { symbols: [], source };
  }
}

export function extensionFromPath(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}
