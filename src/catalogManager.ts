import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface TranslationEntry {
    value: string;
    filePath: string;
    keyPath: string[];
    namespace: string;
}

export class CatalogManager {
    private localesDir: string | null = null;
    private catalogs: Map<string, Map<string, any>> = new Map();
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
            const langs = entries
                .filter(e => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith("."))
                .map(e => e.name);
            return langs.length > 0 ? langs : ["en"];
        } catch {
            return ["en"];
        }
    }

    public async reloadCatalogs(): Promise<void> {
        if (!this.localesDir) {
            this.localesDir = await this.resolveLocalesDir();
        }

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
        if (!this.catalogs.has(targetLocale) && this.localesDir) {
            return null;
        }

        const langMap = this.catalogs.get(targetLocale);
        if (!langMap) {
            return null;
        }

        const colonIdx = rawKey.indexOf(":");
        if (colonIdx !== -1) {
            const ns = rawKey.slice(0, colonIdx);
            const keyPath = rawKey.slice(colonIdx + 1).split(".").filter(Boolean);
            const data = langMap.get(ns);
            if (data) {
                const val = this.extractValue(data, keyPath);
                if (typeof val === "string") {
                    const filePath = path.join(this.localesDir!, targetLocale, `${ns}.json`);
                    return { value: val, filePath, keyPath, namespace: ns };
                }
            }
        }

        const parts = rawKey.split(".").filter(Boolean);
        if (parts.length === 0) {
            return null;
        }

        const first = parts[0];
        if (langMap.has(first)) {
            const data = langMap.get(first);
            const keyPath = parts.slice(1);
            const val = this.extractValue(data, keyPath);
            if (typeof val === "string") {
                const filePath = path.join(this.localesDir!, targetLocale, `${first}.json`);
                return { value: val, filePath, keyPath, namespace: first };
            }
        }

        const commonData = langMap.get("common");
        if (commonData) {
            const val = this.extractValue(commonData, parts);
            if (typeof val === "string") {
                const filePath = path.join(this.localesDir!, targetLocale, "common.json");
                return { value: val, filePath, keyPath: parts, namespace: "common" };
            }
        }

        for (const [ns, data] of langMap.entries()) {
            if (ns === first || ns === "common") continue;
            const val = this.extractValue(data, parts);
            if (typeof val === "string") {
                const filePath = path.join(this.localesDir!, targetLocale, `${ns}.json`);
                return { value: val, filePath, keyPath: parts, namespace: ns };
            }
        }

        return null;
    }

    public async updateTranslationValue(
        rawKey: string,
        targetLocale: string,
        newValue: string
    ): Promise<boolean> {
        let entry = this.getTranslation(rawKey, targetLocale);
        if (!entry) {
            if (!this.localesDir) {
                return false;
            }

            const enEntry = this.getTranslation(rawKey, "en");
            if (enEntry) {
                const targetFilePath = path.join(this.localesDir, targetLocale, `${enEntry.namespace}.json`);
                return this.writeJsonValue(targetFilePath, enEntry.keyPath, newValue);
            }

            const parts = rawKey.split(".").filter(Boolean);
            const first = parts[0];
            const hasNs = this.catalogs.get(targetLocale)?.has(first) || this.catalogs.get("en")?.has(first);
            const ns = hasNs ? first : "common";
            const keyPath = hasNs ? parts.slice(1) : parts;
            const targetFilePath = path.join(this.localesDir, targetLocale, `${ns}.json`);
            return this.writeJsonValue(targetFilePath, keyPath, newValue);
        }

        return this.writeJsonValue(entry.filePath, entry.keyPath, newValue);
    }

    private writeJsonValue(filePath: string, keyPath: string[], newValue: string): boolean {
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

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

    public async resolveLocalesDir(documentUri?: vscode.Uri): Promise<string | null> {
        const config = vscode.workspace.getConfiguration("eepyI18n");
        const customPath = config.get<string>("localesPath");

        if (customPath && customPath.trim() !== "") {
            const resolved = path.isAbsolute(customPath)
                ? customPath
                : path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "", customPath);
            if (fs.existsSync(resolved)) {
                try {
                    return fs.realpathSync(resolved);
                } catch {
                    return resolved;
                }
            }
        }

        const candidateDirs: string[] = [];

        const folders = vscode.workspace.workspaceFolders || [];
        for (const folder of folders) {
            candidateDirs.push(path.join(folder.uri.fsPath, "locales"));
            candidateDirs.push(path.resolve(folder.uri.fsPath, "../eepy.page-i18n/locales"));
            candidateDirs.push(path.resolve(folder.uri.fsPath, "../../eepy.page-i18n/locales"));
        }

        if (documentUri && documentUri.scheme === "file") {
            let curDir = path.dirname(documentUri.fsPath);
            for (let i = 0; i < 6; i++) {
                candidateDirs.push(path.join(curDir, "locales"));
                candidateDirs.push(path.resolve(curDir, "../eepy.page-i18n/locales"));
                candidateDirs.push(path.resolve(curDir, "eepy.page-i18n/locales"));
                const parent = path.dirname(curDir);
                if (parent === curDir) break;
                curDir = parent;
            }
        }

        for (const cand of candidateDirs) {
            if (fs.existsSync(cand)) {
                const enSubdir = path.join(cand, "en");
                if (fs.existsSync(enSubdir)) {
                    try {
                        return fs.realpathSync(cand);
                    } catch {
                        return cand;
                    }
                }
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
