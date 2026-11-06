import * as vscode from "vscode";
import { CatalogManager } from "./catalogManager";
import { findTranslationKeysInDocument } from "./keyFinder";

export class I18nDecoratorManager {
    private callDecorationType: vscode.TextEditorDecorationType | null = null;
    private hintDecorationType: vscode.TextEditorDecorationType | null = null;
    private missingDecorationType: vscode.TextEditorDecorationType | null = null;
    private diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection("eepyI18n");
    private timeout: NodeJS.Timeout | null = null;

    constructor(private catalogManager: CatalogManager) {
        this.recreateDecorations();
    }

    public recreateDecorations(): void {
        this.disposeDecorations();

        const config = vscode.workspace.getConfiguration("eepyI18n");
        const callColor = config.get<string>("callColor", "#6e7681");

        this.callDecorationType = vscode.window.createTextEditorDecorationType({
            color: callColor
        });

        this.hintDecorationType = vscode.window.createTextEditorDecorationType({});
        this.missingDecorationType = vscode.window.createTextEditorDecorationType({});
    }

    public updateAllVisibleEditors(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            this.updateEditor(editor);
        }
    }

    public triggerUpdate(editor?: vscode.TextEditor): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            if (editor) {
                this.updateEditor(editor);
            } else {
                this.updateAllVisibleEditors();
            }
        }, 120);
    }

    public updateEditor(editor: vscode.TextEditor): void {
        if (!editor || !editor.document) {
            return;
        }

        const document = editor.document;
        const langId = document.languageId;
        const supported = [
            "svelte",
            "typescript",
            "javascript",
            "typescriptreact",
            "javascriptreact",
            "python"
        ];

        if (!supported.includes(langId)) {
            return;
        }

        const config = vscode.workspace.getConfiguration("eepyI18n");
        const dimCalls = config.get<boolean>("dimCalls", true);
        const hintStyle = config.get<string>("hintStyle", "decoration");
        const hintColor = config.get<string>("hintColor", "#d4d4d4");
        const missingColor = config.get<string>("missingColor", "#F14C4C");
        const warningColor = config.get<string>("warningColor", "#CCA700");
        const displayLanguage = config.get<string>("displayLanguage", "en");
        const maxLength = config.get<number>("inlayHints.maxLength", 45);

        if (!this.catalogManager.getLocalesDir()) {
            this.catalogManager.resolveLocalesDir(document.uri).then(dir => {
                if (dir) {
                    this.catalogManager.reloadCatalogs();
                }
            });
        }

        const matches = findTranslationKeysInDocument(document);

        const callRanges: vscode.Range[] = [];
        const hintOptions: vscode.DecorationOptions[] = [];
        const missingOptions: vscode.DecorationOptions[] = [];
        const diagnostics: vscode.Diagnostic[] = [];

        for (const match of matches) {
            if (dimCalls) {
                callRanges.push(match.callRange);
            }

            const entry = this.catalogManager.getTranslation(match.rawKey, displayLanguage);
            let displayText = "";
            let isMissing = false;
            let isUntranslated = false;

            if (entry && entry.value) {
                displayText = entry.value;
            } else {
                if (displayLanguage !== "en") {
                    const fallback = this.catalogManager.getTranslation(match.rawKey, "en");
                    if (fallback && fallback.value) {
                        displayText = fallback.value;
                        isUntranslated = true;
                    } else {
                        isMissing = true;
                    }
                } else {
                    isMissing = true;
                }
            }

            if (isMissing) {
                const diagnostic = new vscode.Diagnostic(
                    match.keyRange,
                    `Missing translation key: "${match.rawKey}" in [en] catalogs. Press F2 to define it.`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "eepy.page i18n";
                diagnostic.code = "missing-translation-key";
                diagnostics.push(diagnostic);
            } else if (isUntranslated) {
                const diagnostic = new vscode.Diagnostic(
                    match.keyRange,
                    `Untranslated key: "${match.rawKey}" is missing in [${displayLanguage}] (falling back to [en]). Press F2 to translate.`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = "eepy.page i18n";
                diagnostic.code = "untranslated-key";
                diagnostics.push(diagnostic);
            }

            if (hintStyle === "decoration") {
                if (isMissing) {
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(
                        `\u26A0 **Missing translation**: Key \`${match.rawKey}\` not found in \`${displayLanguage}\` catalogs.\n\n*Press **F2** on the key to define this translation.*`
                    );

                    missingOptions.push({
                        range: match.keyRange,
                        renderOptions: {
                            after: {
                                contentText: ` : [missing]`,
                                color: missingColor,
                                fontStyle: "italic",
                                fontWeight: "normal"
                            }
                        },
                        hoverMessage: md
                    });
                } else if (isUntranslated) {
                    const singleLine = displayText.replace(/\s+/g, " ").trim();
                    const preview =
                        singleLine.length > maxLength
                            ? `${singleLine.slice(0, maxLength - 3)}...`
                            : singleLine;

                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`\u26A0 **Untranslated in [${displayLanguage}]** (falling back to English):\n\n`);
                    md.appendCodeblock(displayText, "text");
                    md.appendMarkdown(`\n\n*Press **F2** on the key to translate this into [${displayLanguage}].*`);

                    hintOptions.push({
                        range: match.keyRange,
                        renderOptions: {
                            after: {
                                contentText: ` : "${preview}"`,
                                color: warningColor,
                                fontStyle: "normal",
                                fontWeight: "normal"
                            }
                        },
                        hoverMessage: md
                    });
                } else {
                    const singleLine = displayText.replace(/\s+/g, " ").trim();
                    const preview =
                        singleLine.length > maxLength
                            ? `${singleLine.slice(0, maxLength - 3)}...`
                            : singleLine;

                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**[${displayLanguage}]** \`${entry?.namespace || "common"}.json\`\n\n`);
                    md.appendCodeblock(displayText, "text");
                    md.appendMarkdown(`\n\n*Press **F2** on the key to edit this translation in [${displayLanguage}].*`);

                    hintOptions.push({
                        range: match.keyRange,
                        renderOptions: {
                            after: {
                                contentText: ` : "${preview}"`,
                                color: hintColor,
                                fontStyle: "normal",
                                fontWeight: "normal"
                            }
                        },
                        hoverMessage: md
                    });
                }
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);

        if (this.callDecorationType) {
            editor.setDecorations(this.callDecorationType, callRanges);
        }
        if (this.hintDecorationType) {
            editor.setDecorations(this.hintDecorationType, hintOptions);
        }
        if (this.missingDecorationType) {
            editor.setDecorations(this.missingDecorationType, missingOptions);
        }
    }

    public clearDiagnostics(uri: vscode.Uri): void {
        this.diagnosticCollection.delete(uri);
    }

    private disposeDecorations(): void {
        this.callDecorationType?.dispose();
        this.hintDecorationType?.dispose();
        this.missingDecorationType?.dispose();
    }

    public dispose(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.disposeDecorations();
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}
