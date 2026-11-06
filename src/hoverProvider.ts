import * as vscode from "vscode";
import { CatalogManager } from "./catalogManager";
import { findTranslationKeysInDocument } from "./keyFinder";

export class I18nHoverProvider implements vscode.HoverProvider {
    constructor(private catalogManager: CatalogManager) {}

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const matches = findTranslationKeysInDocument(document);
        const match = matches.find(
            (m) => m.keyRange.contains(position) || m.callRange.contains(position)
        );

        if (!match) {
            return null;
        }

        const config = vscode.workspace.getConfiguration("eepyI18n");
        const displayLanguage = config.get<string>("displayLanguage", "en");

        const entry = this.catalogManager.getTranslation(match.rawKey, displayLanguage);
        const md = new vscode.MarkdownString();

        if (entry && entry.value) {
            md.appendMarkdown(`**eepy.page i18n [${displayLanguage}]** \`${entry.namespace}.json\`\n\n`);
            md.appendCodeblock(entry.value, "text");
            md.appendMarkdown(`\n\n*Press **F2** on the key string to edit this translation in [${displayLanguage}].*`);
        } else {
            const enFallback = displayLanguage !== "en" ? this.catalogManager.getTranslation(match.rawKey, "en") : null;
            if (enFallback) {
                md.appendMarkdown(`\u26A0 **Untranslated in [${displayLanguage}]** (falling back to English \`${enFallback.namespace}.json\`):\n\n`);
                md.appendCodeblock(enFallback.value, "text");
                md.appendMarkdown(`\n\n*Press **F2** on the key to translate this into [${displayLanguage}].*`);
            } else {
                md.appendMarkdown(`\u26A0 **Missing translation**: Key \`${match.rawKey}\` was not found in catalogs.\n\n*Press **F2** on the key to define it.*`);
            }
        }

        return new vscode.Hover(md, match.keyRange);
    }
}
