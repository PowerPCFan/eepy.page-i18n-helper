import * as vscode from "vscode";

export interface TranslationKeyMatch {
    rawKey: string;
    callRange: vscode.Range;
    keyRange: vscode.Range;
}

const T_CALL_PREFIX_REGEX = /(?:(?:\$|\b[a-zA-Z0-9_$]+\.)?\bt\s*\(\s*)(['"`])([^'"`\r\n]+)\1/g;

export function findTranslationKeysInDocument(document: vscode.TextDocument): TranslationKeyMatch[] {
    const text = document.getText();
    const matches: TranslationKeyMatch[] = [];

    let match: RegExpExecArray | null;
    while ((match = T_CALL_PREFIX_REGEX.exec(text)) !== null) {
        const fullMatch = match[0];
        const quote = match[1];
        const rawKey = match[2].trim();

        if (!rawKey) {
            continue;
        }

        const matchStartOffset = match.index;
        const keyStartOffset = matchStartOffset + fullMatch.indexOf(quote);
        const keyEndOffset = keyStartOffset + rawKey.length + 2;

        let depth = 1;
        let callEndOffset = matchStartOffset + fullMatch.length;
        let inStr: string | null = null;

        while (callEndOffset < text.length && depth > 0) {
            const char = text[callEndOffset];
            if (inStr) {
                if (char === "\\" && callEndOffset + 1 < text.length) {
                    callEndOffset += 2;
                    continue;
                }
                if (char === inStr) {
                    inStr = null;
                }
            } else {
                if (char === "'" || char === '"' || char === "`") {
                    inStr = char;
                } else if (char === "(") {
                    depth++;
                } else if (char === ")") {
                    depth--;
                }
            }
            callEndOffset++;
            if (callEndOffset - matchStartOffset > 800) break;
        }

        const callRange = new vscode.Range(
            document.positionAt(matchStartOffset),
            document.positionAt(callEndOffset)
        );

        const keyRange = new vscode.Range(
            document.positionAt(keyStartOffset),
            document.positionAt(keyEndOffset)
        );

        matches.push({
            rawKey,
            callRange,
            keyRange
        });
    }

    return matches;
}
