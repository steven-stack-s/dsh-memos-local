/**
 * The single source of truth for "where does runtime data live for agent X?"
 *
 * Every other module asks this resolver instead of joining its own paths.
 * That way, when the convention changes (or `MEMOS_HOME` overrides it), only
 * this file needs to know.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve as pathResolve, join } from "node:path";
const DEFAULT_HOME_BY_AGENT = {
    openclaw: "{HOME}/.openclaw/memos-plugin",
    hermes: "{HOME}/.hermes/memos-plugin",
};
export const WINDOWS_RUNTIME_HOME_MARKER = ".memos-runtime-home";
/**
 * Select the Windows Hermes runtime without moving any data.
 *
 * Releases before the Windows installer/runtime paths were aligned may have
 * a live DB under `%USERPROFILE%\\.hermes\\memos-plugin`, while the package is
 * installed under `%LOCALAPPDATA%\\hermes\\memos-plugin`. A persisted marker
 * makes the decision stable across upgrades. Existing legacy data wins; two
 * live databases are treated as a conflict instead of being merged or
 * silently choosing one.
 */
export function selectWindowsHermesRuntimeHome(options) {
    const legacyHome = pathResolve(options.legacyHome);
    const installRoot = pathResolve(options.installRoot);
    const markerFile = join(installRoot, WINDOWS_RUNTIME_HOME_MARKER);
    const markedHome = readRuntimeHomeMarker(markerFile);
    if (markedHome)
        return { root: markedHome, source: "marker" };
    const legacyDb = existsSync(join(legacyHome, "data", "memos.db"));
    const canonicalDb = existsSync(join(installRoot, "data", "memos.db"));
    if (legacyDb && canonicalDb) {
        throw new Error("both Windows Hermes runtime homes contain a database; " +
            `set MEMOS_HOME explicitly (${legacyHome} or ${installRoot})`);
    }
    let selection;
    if (legacyDb) {
        selection = { root: legacyHome, source: "legacy-database" };
    }
    else if (canonicalDb) {
        selection = { root: installRoot, source: "canonical-database" };
    }
    else if (hasMeaningfulRuntimeData(legacyHome)) {
        selection = { root: legacyHome, source: "legacy-data" };
    }
    else {
        selection = { root: installRoot, source: "new-install" };
    }
    if (options.persist !== false)
        writeRuntimeHomeMarker(markerFile, selection);
    return selection;
}
function readRuntimeHomeMarker(markerFile) {
    try {
        const value = JSON.parse(readFileSync(markerFile, "utf8"));
        if (value.version !== 1 ||
            typeof value.path !== "string" ||
            !value.path.trim() ||
            !isAbsolute(value.path)) {
            return null;
        }
        return pathResolve(value.path);
    }
    catch {
        return null;
    }
}
function writeRuntimeHomeMarker(markerFile, selection) {
    mkdirSync(pathResolve(markerFile, ".."), { recursive: true });
    const tempFile = `${markerFile}.${process.pid}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify({
        version: 1,
        path: selection.root,
        source: selection.source,
    }, null, 2)}\n`;
    writeFileSync(tempFile, payload, { encoding: "utf8", mode: 0o600 });
    renameSync(tempFile, markerFile);
}
function hasMeaningfulRuntimeData(root) {
    if (existsSync(join(root, "config.yaml")) || existsSync(join(root, ".auth.json"))) {
        return true;
    }
    try {
        return readdirSync(join(root, "skills")).length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Resolve the runtime home for `agent`. Override precedence (highest first):
 *
 *   1. `MEMOS_HOME` environment variable (covers everything).
 *   2. `MEMOS_CONFIG_FILE` environment variable (covers only the config file
 *      path; data/skills/logs still derive from the same parent dir).
 *   3. `defaultHome` argument.
 *   4. Windows Hermes marker / existing-data selection.
 *   5. Built-in default for `agent` (`~/.openclaw/memos-plugin/` etc.).
 */
export function resolveHome(agent, defaultHome) {
    const env = process.env;
    const envHome = env["MEMOS_HOME"];
    const envConfig = env["MEMOS_CONFIG_FILE"];
    let root;
    let configFile;
    if (envHome && envHome.trim()) {
        root = pathResolve(expandHome(envHome));
        configFile = join(root, "config.yaml");
    }
    else if (envConfig && envConfig.trim()) {
        configFile = pathResolve(expandHome(envConfig));
        root = pathResolve(configFile, "..");
    }
    else if (defaultHome && defaultHome.trim()) {
        root = pathResolve(expandHome(defaultHome));
        configFile = join(root, "config.yaml");
    }
    else {
        if (agent === "hermes" && process.platform === "win32" && env.LOCALAPPDATA?.trim()) {
            root = selectWindowsHermesRuntimeHome({
                legacyHome: join(homedir(), ".hermes", "memos-plugin"),
                installRoot: join(env.LOCALAPPDATA.trim(), "hermes", "memos-plugin"),
            }).root;
        }
        else {
            const tmpl = DEFAULT_HOME_BY_AGENT[String(agent)] ?? `{HOME}/.${agent}/memos-plugin`;
            root = pathResolve(expandHome(tmpl));
        }
        configFile = join(root, "config.yaml");
    }
    return {
        root,
        configFile,
        dataDir: join(root, "data"),
        dbFile: join(root, "data", "memos.db"),
        skillsDir: join(root, "skills"),
        logsDir: join(root, "logs"),
        daemonDir: join(root, "daemon"),
    };
}
/**
 * Replace the `{HOME}` placeholder and a leading `~` with the user's home dir.
 * (Done explicitly rather than via shell so cross-platform behaviour is sane.)
 */
export function expandHome(p) {
    let out = p;
    if (out.startsWith("~/") || out === "~") {
        out = out.replace(/^~/, homedir());
    }
    out = out.replace(/\{HOME\}/g, homedir());
    return out;
}
//# sourceMappingURL=paths.js.map