---
name: Example cron
description: Short summary of what this cron does
schedule: 0 9 * * 1-5
enabled: false
---
Replace this body with the prompt the agent should run on the schedule above.
You can reference files via Bash (your working dir is /app/crons/<this-slug>/),
e.g. `cat scripts/payload.json`.
