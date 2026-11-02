/** Agent presets choose behavior, not memory ownership or visibility. */
export function deepSeekHarnessNamespace(session, profileId) {
    return {
        agentKind: "deepseek-harness",
        profileId,
        profileLabel: profileId,
        workspacePath: session?.header?.cwd,
        sessionKey: session?.id,
    };
}
//# sourceMappingURL=namespace.js.map