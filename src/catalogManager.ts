import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseTranslationKey } from "./keyFinder";

export interface TranslationEntry {
    value: string;
    filePath: string;
    keyPath: string[];
    namespace: string;
}

export class CatalogManager {
    private localesDir: string | null = null;
    private catalogs: Map<string, Map<string, any>> = new Map(); // locale -> namespace -> json
    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;
    private watcher: vscode.FileSystemWatcher | null = null;

    constructor() {
        this.init();
    }

    public async init(): Promise<void> {
        this.localesDir = await this.resolveLocalesDir();
        await this.reloadCatalogs();
        this.setupWatcher();
    }

    public getLocalesDir(): string | null {
        return this.localesDir;
    }

    public getAvailableLanguages(): string[] {
        if (!this.localesDir || !fs.existsSync(this.localesDir)) {
            return ["en"];
        }
        try {
            const entries = fs.readdirSync(this.localesDir, { withFileTypes: true });
            return entries
                .filter(e => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith("."))
                .map(e => e.name);
        } catch {
            return ["en"];
        }
    }

    public async reloadCatalogs(): Promise<void> {
        this.catalogs.clear();
        if (!this.localesDir || !fs.existsSync(this.localesDir)) {
            return;
        }

        const languages = this.getAvailableLanguages();
        for (const lang of languages) {
            const langDir = path.join(this.localesDir, lang);
            if (!fs.existsSync(langDir)) {
                continue;
            }

            const nsMap = new Map<string, any>();
            try {
                const files = fs.readdirSync(langDir).filter(f => f.endsWith(".json"));
                for (const file of files) {
                    const ns = path.basename(file, ".json");
                    const fullPath = path.join(langDir, file);
                    try {
                        const content = fs.readFileSync(fullPath, "utf-8");
                        nsMap.set(ns, JSON.parse(content));
                    } catch (err) {
                        console.warn(`[eepy-page-i18n-helper] Failed to parse ${fullPath}:`, err);
                    }
                }
            } catch (err) {
                console.warn(`[eepy-page-i18n-helper] Failed to read ${langDir}:`, err);
            }

            this.catalogs.set(lang, nsMap);
        }

        this._onDidChange.fire();
    }

    public getTranslation(rawKey: string, targetLocale: string): TranslationEntry | null {
        const { namespace, keyPath } = parseTranslationKey(rawKey);
        const langMap = this.catalogs.get(targetLocale);
        if (!langMap) {
            return null;
        }

        if (namespace) {
            const data = langMap.get(namespace);
            if (data) {
                const val = this.extractValue(data, keyPath);
                if (typeof val === "string") {
                    const filePath = path.join(this.localesDir!, targetLocale, `${namespace}.json`);
                    return { value: val, filePath, keyPath, namespace };
                }
            }
        } else {
            for (const [ns, data] of langMap.entries()) {
                const val = this.extractValue(data, keyPath);
                if (typeof val === "string") {
                    const filePath = path.join(this.localesDir!, targetLocale, `${ns}.json`);
                    return { value: val, filePath, keyPath, namespace: ns };
                }
            }
        }

        return null;
    }

    public async updateTranslationValue(
        rawKey: string,
        targetLocale: string,
        newValue: string
    ): Promise<boolean> {
        const entry = this.getTranslation(rawKey, targetLocale);
        if (!entry) {
            const enEntry = this.getTranslation(rawKey, "en");
            if (!enEntry || !this.localesDir) {
                return false;
            }

            const targetFilePath = path.join(this.localesDir, targetLocale, `${enEntry.namespace}.json`);
            return this.writeJsonValue(targetFilePath, enEntry.keyPath, newValue);
        }

        return this.writeJsonValue(entry.filePath, entry.keyPath, newValue);
    }

    private writeJsonValue(filePath: string, keyPath: string[], newValue: string): boolean {
        try {
            let json: any = {};
            if (fs.existsSync(filePath)) {
                json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            }

            let cur = json;
            for (let i = 0; i < keyPath.length - 1; i++) {
                const seg = keyPath[i];
                if (!cur[seg] || typeof cur[seg] !== "object") {
                    cur[seg] = {};
                }
                cur = cur[seg];
            }

            cur[keyPath[keyPath.length - 1]] = newValue;
            fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n", "utf-8");
            this.reloadCatalogs();
            return true;
        } catch (err) {
            console.error(`[eepy-page-i18n-helper] Failed to write to ${filePath}:`, err);
            return false;
        }
    }

    private extractValue(obj: any, keyPath: string[]): any {
        let cur = obj;
        for (const seg of keyPath) {
            if (cur && typeof cur === "object" && seg in cur) {
                cur = cur[seg];
            } else {
                return undefined;
            }
        }
        return cur;
    }

    private async resolveLocalesDir(): Promise<string | null> {
        const config = vscode.workspace.getConfiguration("eepyI18n");
        const customPath = config.get<string>("localesPath");

        if (customPath && customPath.trim() !== "") {
            const resolved = path.isAbsolute(customPath)
                ? customPath
                : path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "", customPath);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }

        const folders = vscode.workspace.workspaceFolders || [];
        for (const folder of folders) {
            const candidate = path.join(folder.uri.fsPath, "locales");
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        for (const folder of folders) {
            const siblingCandidate = path.resolve(folder.uri.fsPath, "../eepy.page-i18n/locales");
            if (fs.existsSync(siblingCandidate)) {
                return siblingCandidate;
            }
        }

        return null;
    }

    private setupWatcher(): void {
        if (this.watcher) {
            this.watcher.dispose();
        }

        this.watcher = vscode.workspace.createFileSystemWatcher("**/locales/**/*.json");
        this.watcher.onDidChange(() => this.reloadCatalogs());
        this.watcher.onDidCreate(() => this.reloadCatalogs());
        this.watcher.onDidDelete(() => this.reloadCatalogs());
    }

    public dispose(): void {
        this.watcher?.dispose();
        this._onDidChange.dispose();
    }
}
