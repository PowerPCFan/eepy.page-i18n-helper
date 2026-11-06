import * as vscode from "vscode";
import { CatalogManager } from "./catalogManager";
import { I18nDecoratorManager } from "./decorator";
import { I18nHoverProvider } from "./hoverProvider";
import { I18nInlayHintsProvider } from "./inlayHintsProvider";
import { I18nRenameProvider } from "./renameProvider";
import { findTranslationKeysInDocument } from "./keyFinder";

const SUPPORTED_SELECTOR: vscode.DocumentSelector = [
    { language: "svelte" },
    { language: "typescript" },
    { language: "javascript" },
    { language: "typescriptreact" },
    { language: "javascriptreact" },
    { language: "python" }
];

export async function activate(context: vscode.ExtensionContext) {
    const catalogManager = new CatalogManager();
    await catalogManager.init();

    const decoratorManager = new I18nDecoratorManager(catalogManager);
    const inlayHintsProvider = new I18nInlayHintsProvider(catalogManager);
    const renameProvider = new I18nRenameProvider(catalogManager);
    const hoverProvider = new I18nHoverProvider(catalogManager);

    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider(SUPPORTED_SELECTOR, inlayHintsProvider)
    );
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(SUPPORTED_SELECTOR, renameProvider)
    );
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(SUPPORTED_SELECTOR, hoverProvider)
    );

    if (vscode.window.activeTextEditor) {
        decoratorManager.updateEditor(vscode.window.activeTextEditor);
    }
    decoratorManager.updateAllVisibleEditors();

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                decoratorManager.updateEditor(editor);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeVisibleTextEditors(() => {
            decoratorManager.updateAllVisibleEditors();
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document === event.document) {
                decoratorManager.triggerUpdate(activeEditor);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => {
            decoratorManager.clearDiagnostics(doc.uri);
        })
    );

    catalogManager.onDidChange(() => {
        decoratorManager.updateAllVisibleEditors();
        inlayHintsProvider.refresh();
    });

    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = "eepyI18n.changeLanguage";
    context.subscriptions.push(statusBarItem);

    function updateStatusBar() {
        const config = vscode.workspace.getConfiguration("eepyI18n");
        const lang = config.get<string>("displayLanguage", "en");
        statusBarItem.text = `$(globe) i18n: ${lang}`;
        statusBarItem.tooltip = `eepy.page i18n active display language: ${lang}. Click to switch.`;
        statusBarItem.show();
    }

    updateStatusBar();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("eepyI18n")) {
                updateStatusBar();
                decoratorManager.recreateDecorations();
                decoratorManager.updateAllVisibleEditors();
                inlayHintsProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("eepyI18n.changeLanguage", async () => {
            const available = catalogManager.getAvailableLanguages();
            const config = vscode.workspace.getConfiguration("eepyI18n");
            const current = config.get<string>("displayLanguage", "en");

            const items: vscode.QuickPickItem[] = available.map((lang) => ({
                label: lang === current ? `$(check) ${lang}` : lang,
                description: lang === current ? "(Current active language)" : "",
                picked: lang === current
            }));

            items.push({
                label: "$(plus) Add new language code...",
                description: "Type a new language code (e.g. de, fr, ja, pt-BR)"
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select language to display in inlay hints and edit via F2 (currently ${current})`
            });

            if (selected) {
                let cleanLang = selected.label.replace("$(check)", "").trim();
                if (cleanLang.includes("Add new language code")) {
                    const input = await vscode.window.showInputBox({
                        title: "Add New Language Code",
                        prompt: "Enter language code (e.g. de, fr, ja, pt-BR)",
                        placeHolder: "de"
                    });
                    if (!input || !input.trim()) {
                        return;
                    }
                    cleanLang = input.trim();
                }

                await config.update("displayLanguage", cleanLang, vscode.ConfigurationTarget.Global);
                decoratorManager.updateAllVisibleEditors();
                inlayHintsProvider.refresh();
                vscode.window.showInformationMessage(`Switched eepy.page i18n display language to [${cleanLang}].`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("eepyI18n.editTranslation", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const position = editor.selection.active;
            const matches = findTranslationKeysInDocument(editor.document);
            const match = matches.find(
                (m) => m.keyRange.contains(position) || m.callRange.contains(position)
            );

            if (!match) {
                vscode.window.showWarningMessage("Cursor is not on a translation key (e.g. t('key')).");
                return;
            }

            const config = vscode.workspace.getConfiguration("eepyI18n");
            const displayLanguage = config.get<string>("displayLanguage", "en");
            const entry = catalogManager.getTranslation(match.rawKey, displayLanguage);

            const newVal = await vscode.window.showInputBox({
                title: `Edit [${displayLanguage}] translation for "${match.rawKey}"`,
                value: entry?.value ?? "",
                prompt: `Enter new translation text for ${match.rawKey} in ${displayLanguage}`
            });

            if (newVal !== undefined) {
                const ok = await catalogManager.updateTranslationValue(match.rawKey, displayLanguage, newVal);
                if (ok) {
                    decoratorManager.updateAllVisibleEditors();
                    vscode.window.showInformationMessage(
                        `\u2705 Updated [${displayLanguage}] translation for "${match.rawKey}".`
                    );
                } else {
                    vscode.window.showErrorMessage(
                        `Failed to update translation for "${match.rawKey}".`
                    );
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("eepyI18n.refresh", async () => {
            await catalogManager.reloadCatalogs();
            decoratorManager.updateAllVisibleEditors();
            inlayHintsProvider.refresh();
            vscode.window.showInformationMessage("eepy.page i18n catalogs reloaded.");
        })
    );

    context.subscriptions.push(catalogManager);
    context.subscriptions.push(decoratorManager);
}

export function deactivate() {}
