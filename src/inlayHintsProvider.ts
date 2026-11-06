import * as vscode from "vscode";
import { CatalogManager } from "./catalogManager";
import { findTranslationKeysInDocument } from "./keyFinder";

export class I18nInlayHintsProvider implements vscode.InlayHintsProvider {
    private _onDidChangeInlayHints = new vscode.EventEmitter<void>();
    public readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;

    constructor(private catalogManager: CatalogManager) {
        this.catalogManager.onDidChange(() => {
            this._onDidChangeInlayHints.fire();
        });

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("eepyI18n")) {
                this._onDidChangeInlayHints.fire();
            }
        });
    }

    public provideInlayHints(
        document: vscode.TextDocument,
        _range: vscode.Range,
        _token: vscode.CancellationToken
    ): vscode.InlayHint[] {
        const config = vscode.workspace.getConfiguration("eepyI18n");
        const hintStyle = config.get<string>("hintStyle", "decoration");

        if (hintStyle !== "native") {
            return [];
        }

        const enabled = config.get<boolean>("inlayHints.enabled", true);
        if (!enabled) {
            return [];
        }

        const displayLanguage = config.get<string>("displayLanguage", "en");
        const maxLength = config.get<number>("inlayHints.maxLength", 45);

        const matches = findTranslationKeysInDocument(document);
        const hints: vscode.InlayHint[] = [];

        for (const match of matches) {
            const entry = this.catalogManager.getTranslation(match.rawKey, displayLanguage);
            let displayText = "";
            let isMissing = false;

            if (entry && entry.value) {
                displayText = entry.value;
            } else {
                if (displayLanguage !== "en") {
                    const fallback = this.catalogManager.getTranslation(match.rawKey, "en");
                    if (fallback) {
                        displayText = `${fallback.value} (en)`;
                    } else {
                        isMissing = true;
                    }
                } else {
                    isMissing = true;
                }
            }

            if (isMissing) {
                const hint = new vscode.InlayHint(
                    match.keyRange.end,
                    `: [missing]`,
                    vscode.InlayHintKind.Parameter
                );
                hint.paddingLeft = true;
                hint.tooltip = new vscode.MarkdownString(
                   `\u26A0 **Missing translation**: Key \`${match.rawKey}\` not found in \`${displayLanguage}\` catalogs.`
                );
                hints.push(hint);
                continue;
            }

            const singleLine = displayText.replace(/\s+/g, " ").trim();
            const preview =
                singleLine.length > maxLength
                    ? `${singleLine.slice(0, maxLength - 3)}...`
                    : singleLine;

            const hint = new vscode.InlayHint(
                match.keyRange.end,
                `: "${preview}"`,
                vscode.InlayHintKind.Parameter
            );
            hint.paddingLeft = true;

            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**[${displayLanguage}]** \`${entry?.namespace || "common"}.json\`\n\n`);
            md.appendCodeblock(displayText, "text");
            md.appendMarkdown(`\n\n*Press **F2** on the key to edit this translation in [${displayLanguage}].*`);
            hint.tooltip = md;

            hints.push(hint);
        }

        return hints;
    }

    public refresh(): void {
        this._onDidChangeInlayHints.fire();
    }
}
