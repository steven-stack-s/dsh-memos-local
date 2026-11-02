export function memosMessageSource(form) {
    return {
        kind: "plugin:memos-local-memory",
        ...(form ? { form } : {}),
    };
}
//# sourceMappingURL=message-source.js.map