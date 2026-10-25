import ts from "typescript";

export interface CodeSymbol {
    name: string;
    kind: "function" | "class" | "interface" | "type" | "variable" | "method";
    exported: boolean;
    filePath: string;
    line: number;
    jsdoc?: string;
    signature?: string;
}

export interface DependencyLink {
    fromFile: string;
    toFileOrModule: string;
    importedSymbols: string[];
}

export interface RepositoryScanIndex {
    files: string[];
    symbols: Map<string, CodeSymbol[]>;
    dependencies: DependencyLink[];
    warnings: string[];
    complete: boolean;
}

function getJSDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const fullText = sourceFile.getFullText();
    const commentRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    if (!commentRanges || commentRanges.length === 0) return undefined;

    const lastRange = commentRanges[commentRanges.length - 1];
    if (!lastRange) return undefined;

    const commentText = fullText.slice(lastRange.pos, lastRange.end);
    if (commentText.startsWith("/**")) {
        return commentText
            .replace(/^\/\*\*|\*\/$/g, "")
            .split("\n")
            .map(line => line.replace(/^\s*\*\s?/, "").trim())
            .filter(Boolean)
            .join("\n");
    }
    return undefined;
}

function hasExportModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
}

export function extractSymbols(filePath: string, sourceCode: string): CodeSymbol[] {
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const symbols: CodeSymbol[] = [];

    function visit(node: ts.Node) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const exported = hasExportModifier(node);

        if (ts.isFunctionDeclaration(node) && node.name) {
            symbols.push({
                name: node.name.text,
                kind: "function",
                exported,
                filePath,
                line,
                jsdoc: getJSDocComment(node, sourceFile),
                signature: node.getText(sourceFile).split("{")[0]?.trim()
            });
        } else if (ts.isClassDeclaration(node) && node.name) {
            symbols.push({
                name: node.name.text,
                kind: "class",
                exported,
                filePath,
                line,
                jsdoc: getJSDocComment(node, sourceFile),
            });
        } else if (ts.isInterfaceDeclaration(node)) {
            symbols.push({
                name: node.name.text,
                kind: "interface",
                exported,
                filePath,
                line,
                jsdoc: getJSDocComment(node, sourceFile),
            });
        } else if (ts.isTypeAliasDeclaration(node)) {
            symbols.push({
                name: node.name.text,
                kind: "type",
                exported,
                filePath,
                line,
                jsdoc: getJSDocComment(node, sourceFile),
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return symbols;
}

export function extractDependencies(filePath: string, sourceCode: string): DependencyLink[] {
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    const dependencies: DependencyLink[] = [];

    ts.forEachChild(sourceFile, node => {
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
            const importedSymbols: string[] = [];

            if (node.importClause?.namedBindings) {
                if (ts.isNamedImports(node.importClause.namedBindings)) {
                    for (const element of node.importClause.namedBindings.elements) {
                        importedSymbols.push(element.name.text);
                    }
                }
            }

            dependencies.push({
                fromFile: filePath,
                toFileOrModule: moduleSpecifier,
                importedSymbols
            });
        }
    });

    return dependencies;
}
