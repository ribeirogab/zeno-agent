# infra/

Reproducible config for external services Zeno depends on. Source of truth — recreate the service from these files.

## `slack-app-manifest.json`

Slack App config (scopes, events, Socket Mode). Use it to recreate the Zeno app from scratch:

1. Go to https://api.slack.com/apps
2. **Create New App** → **From an app manifest**
3. Pick your workspace
4. Paste the contents of `slack-app-manifest.json`
5. Review and create

After creation, you still need to:

- Generate an **App-Level Token** (Settings → Basic Information → App-Level Tokens) with scope `connections:write` for Socket Mode → keep this token handy.
- **Install** the app to your workspace (OAuth & Permissions → Install to Workspace) → copy the Bot User OAuth Token → keep this handy.
- **Invite** the bot to a channel.
- **Install Slack channel via Zeno's dashboard** (`/connectors` → click Add → pick Slack → paste the App Token + Bot Token). Tokens land in the DB `connector_secrets` table — NOT in `.env`. (See [[../context/specs/0058-fn-cutover-channel/spec.md|spec 0058]] for the migration that moved Slack tokens out of `.env`.)

If you change scopes, events, or other Slack config later, update the manifest here AND in the Slack App UI (Features → App Manifest) so the two stay in sync.
