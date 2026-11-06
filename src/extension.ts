import * as vscode from "vscode";
import { CatalogManager } from "./catalogManager";
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

    const inlayHintsProvider = new I18nInlayHintsProvider(catalogManager);
    const renameProvider = new I18nRenameProvider(catalogManager);

    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider(SUPPORTED_SELECTOR, inlayHintsProvider)
    );

    context.subscriptions.push(
        vscode.languages.registerRenameProvider(SUPPORTED_SELECTOR, renameProvider)
    );

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
            if (e.affectsConfiguration("eepyI18n.displayLanguage")) {
                updateStatusBar();
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

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select language to display in inlay hints and edit via F2 (currently ${current})`
            });

            if (selected) {
                const cleanLang = selected.label.replace("$(check)", "").trim();
                await config.update("displayLanguage", cleanLang, vscode.ConfigurationTarget.Global);
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
            const match = matches.find((m) => m.keyRange.contains(position) || m.range.contains(position));

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
                    vscode.window.showInformationMessage(
                        `✔ Updated [${displayLanguage}] translation for "${match.rawKey}".`
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
            inlayHintsProvider.refresh();
            vscode.window.showInformationMessage("eepy.page i18n catalogs reloaded.");
        })
    );

    context.subscriptions.push(catalogManager);
}

export function deactivate() {}
