/**
 * The default config tree. Mirrors `schema.ts` exactly. When merging YAML,
 * we deep-merge over this tree so users only need to specify what they want
 * to change.
 */
import type { ResolvedConfig } from "./schema.js";
/** Runtime adapters own these well-known ports even for legacy YAML files. */
export declare function effectiveViewerPort(agent?: string): number | undefined;
export declare const DEFAULT_CONFIG: ResolvedConfig;
/**
 * Object-valued config slots whose child keys are user-defined rather than
 * fields in `DEFAULT_CONFIG`. Keep this list explicit: treating every empty
 * default object as a free-form map would silently disable unknown-key
 * warnings for any future structured config section that starts out empty.
 */
export declare const FREE_FORM_CONFIG_PATHS: readonly string[];
/**
 * Set of dotted-path field names whose values must never be sent to the
 * viewer or any non-localhost surface. Used by `server/routes/config.ts`.
 */
export declare const SECRET_FIELD_PATHS: readonly string[];
//# sourceMappingURL=defaults.d.ts.map