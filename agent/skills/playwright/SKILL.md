---
name: playwright
description: Automate a browser via Playwright — navigate, click, fill forms, take screenshots, scrape content. Use when the user asks to check a URL visually, test a UI, scrape a page, or do any end-to-end browser interaction.
---

# Playwright

Browser automation via the `playwright` MCP server. Backed by Microsoft's `@playwright/mcp` package.

## Requirements

- `playwright` MCP server enabled. It ships as a built-in MCP in `agent/mcp.json` and runs via `npx -y @playwright/mcp@latest`. First invocation in a fresh container downloads the browser bundle (slow, a few seconds).

## Tool cheatsheet

The MCP exposes tools under the `mcp__playwright__browser_*` namespace:

| Tool | Purpose |
|---|---|
| `browser_navigate` | Open a URL in the Playwright-managed browser. |
| `browser_navigate_back` | Go back in history. |
| `browser_click` / `browser_hover` / `browser_drag` | Interact with elements via accessibility ref. |
| `browser_type` / `browser_fill_form` / `browser_select_option` / `browser_press_key` | Enter text, fill forms, send keyboard input. |
| `browser_file_upload` | Upload a file via a file input. |
| `browser_handle_dialog` | Dismiss/accept native dialogs (alert, confirm, prompt). |
| `browser_snapshot` | Capture a DOM accessibility snapshot — use this before clicking so you have element refs. |
| `browser_take_screenshot` | Save a PNG screenshot. **Always prefix the filename with `.playwright-mcp/`**, e.g. `.playwright-mcp/login-page.png`. That directory is gitignored. |
| `browser_network_requests` / `browser_console_messages` | Inspect traffic and console output for debugging. |
| `browser_evaluate` / `browser_run_code` | Execute JavaScript in the page context. |
| `browser_wait_for` | Wait for text / time / element before proceeding. |
| `browser_resize` | Set viewport size. |
| `browser_tabs` | List / switch / close tabs. |
| `browser_close` | Close the browser. Call this at the end of a session when possible to free the Playwright process. |

## Conventions

- **Screenshots always under `.playwright-mcp/`.** The top-level `.playwright-mcp/` directory is gitignored. Do not write screenshots elsewhere.
- **Snapshot before interacting.** `browser_click` and friends take a ref produced by `browser_snapshot`; without a recent snapshot your refs are stale.
- **Close the browser when done.** If the task completes and no further interaction is expected, call `browser_close`.
- **Do not paste screenshots back to the user as binary.** Save to `.playwright-mcp/`, mention the path, and let the user open it if needed.

## Typical flow

1. `browser_navigate` to the URL.
2. `browser_snapshot` to get element refs.
3. Interact: `browser_click`, `browser_type`, `browser_fill_form`…
4. `browser_wait_for` if state changes are async.
5. `browser_take_screenshot` to `.playwright-mcp/<descriptive-name>.png` when a visual artifact is helpful.
6. `browser_close` when done.
