import * as vscode from "vscode";

export interface TranslationKeyMatch {
    rawKey: string;
    namespace?: string;
    keyPath: string[];
    range: vscode.Range;
    keyRange: vscode.Range;
}

const T_CALL_REGEX = /(?:(?:\$|\b(?:i18n|requestI18n|serverI18n|pkg)\.)?t\s*\(\s*)(['"`])([^'"`\r\n]+)\1/g;

export function parseTranslationKey(rawKey: string): { namespace?: string; keyPath: string[] } {
    let namespace: string | undefined;
    let pathPart = rawKey;

    if (rawKey.includes(":")) {
        const colonIndex = rawKey.indexOf(":");
        namespace = rawKey.slice(0, colonIndex);
        pathPart = rawKey.slice(colonIndex + 1);
    }

    const keyPath = pathPart.split(".").filter(Boolean);
    return { namespace, keyPath };
}

export function findTranslationKeysInDocument(document: vscode.TextDocument): TranslationKeyMatch[] {
    const text = document.getText();
    const matches: TranslationKeyMatch[] = [];

    let match: RegExpExecArray | null;
    while ((match = T_CALL_REGEX.exec(text)) !== null) {
        const fullMatch = match[0];
        const quote = match[1];
        const rawKey = match[2].trim();

        if (!rawKey) {
            continue;
        }

        const matchStartOffset = match.index;
        const keyStartOffset = matchStartOffset + fullMatch.indexOf(quote) + 1;
        const keyEndOffset = keyStartOffset + rawKey.length;

        const range = new vscode.Range(
            document.positionAt(matchStartOffset),
            document.positionAt(matchStartOffset + fullMatch.length)
        );

        const keyRange = new vscode.Range(
            document.positionAt(keyStartOffset),
            document.positionAt(keyEndOffset)
        );

        const { namespace, keyPath } = parseTranslationKey(rawKey);

        matches.push({
            rawKey,
            namespace,
            keyPath,
            range,
            keyRange
        });
    }

    return matches;
}
