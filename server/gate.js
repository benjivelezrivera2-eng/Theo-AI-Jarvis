/** Code gate: the model proposes; only allowlisted tools run. */

const ALLOWED_TOOLS = new Set(["audit_vault"]);

export function assertToolAllowed(toolName) {
  if (!ALLOWED_TOOLS.has(toolName)) {
    const err = new Error(
      `Tool refused by gate: "${toolName}". Allowed: ${[...ALLOWED_TOOLS].join(", ")}.`,
    );
    err.status = 403;
    err.code = "GATE_REFUSED";
    throw err;
  }
}

export function listAllowedTools() {
  return [...ALLOWED_TOOLS];
}
