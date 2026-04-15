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

- Generate an **App-Level Token** (Settings → Basic Information → App-Level Tokens) with scope `connections:write` for Socket Mode → goes to `.env` as `SLACK_APP_TOKEN`
- **Install** the app to your workspace (OAuth & Permissions → Install to Workspace) → copy the Bot User OAuth Token → goes to `.env` as `SLACK_BOT_TOKEN`
- **Invite** the bot to a channel: `/invite @zeno-agent`

If you change scopes, events, or other Slack config later, update the manifest here AND in the Slack App UI (Features → App Manifest) so the two stay in sync.
