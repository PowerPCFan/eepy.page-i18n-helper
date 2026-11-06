import * as vscode from "vscode";
import { CatalogManager } from "./catalogManager";
import { findTranslationKeysInDocument, TranslationKeyMatch } from "./keyFinder";

export class I18nRenameProvider implements vscode.RenameProvider {
    constructor(private catalogManager: CatalogManager) {}

    public prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
        const match = this.findMatchAtPosition(document, position);
        if (!match) {
            throw new Error("Cursor is not on a translation key");
        }

        const config = vscode.workspace.getConfiguration("eepyI18n");
        const displayLanguage = config.get<string>("displayLanguage", "en");

        const entry = this.catalogManager.getTranslation(match.rawKey, displayLanguage);
        const placeholder = entry?.value ?? match.rawKey;

        return {
            range: match.keyRange,
            placeholder
        };
    }

    public async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        _token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit | null> {
        const match = this.findMatchAtPosition(document, position);
        if (!match) {
            return null;
        }

        const config = vscode.workspace.getConfiguration("eepyI18n");
        const displayLanguage = config.get<string>("displayLanguage", "en");

        const success = await this.catalogManager.updateTranslationValue(
            match.rawKey,
            displayLanguage,
            newName
        );

        if (!success) {
            vscode.window.showErrorMessage(
                `Failed to update translation for "${match.rawKey}" in [${displayLanguage}].`
            );
            return null;
        }

        vscode.window.showInformationMessage(
            `✔ Updated [${displayLanguage}] translation for "${match.rawKey}" to "${newName}".`
        );

        return new vscode.WorkspaceEdit();
    }

    private findMatchAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): TranslationKeyMatch | null {
        const matches = findTranslationKeysInDocument(document);
        for (const match of matches) {
            if (match.keyRange.contains(position) || match.range.contains(position)) {
                return match;
            }
        }
        return null;
    }
}
