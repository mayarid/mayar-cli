# The CLI is a thin client with a few guards, not a copy of mayar-mcp's guard layer

People and AI agents both drive mayar-cli. mayar-mcp, the sibling MCP server, checks a lot of input before it sends anything: money limits, product-name characters, unknown fields, and more. We decided that the CLI copies only the cheap and certain parts. It treats a rejected response (HTTP 2xx with a failure body) as an error, and it has four guards: no past dates, whole positive amounts, `--limit` from 1 to 50, and a clear message for bad `--data` JSON. Mayar's server stays the main check. A full guard layer means a field list per command and limits that we cannot confirm yet. That is a large feature to maintain, and it would compete with the security work.

## Considered Options

- **Thin client, no guards.** Rejected: an agent that gets exit code 0 after a failed write is the worst risk, and the fix is small.
- **Full mayar-mcp guard layer.** Postponed, not rejected. The minimum amounts, the QRIS cap and the product-name rules come from mayar-mcp's own sandbox QA. Add them only after a sandbox check confirms them. Refusing unknown fields waits for this layer.

## Consequences

- A rejected response exits 1. This changes the exit code that scripts see, but we ship it as a minor release, because exit 0 on a failed call was always a bug.
