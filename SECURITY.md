# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature: open the **Security** tab of this repository and click **Report a vulnerability**, or go directly to https://github.com/ribeirogab/zeno-agent/security/advisories/new.

Reports filed this way are encrypted at rest by GitHub and visible only to the maintainers and to you. Do not file security issues in the public issue tracker.

## Disclosure window

The maintainers acknowledge incoming reports within 7 days. The default coordinated-disclosure window is 90 days from acknowledgement. The window may be shortened (a fix is already shipped) or extended (the bug is hard to fix safely) by mutual agreement between you and the maintainers.

## Scope

In scope:

- Vulnerabilities in the code in this repository — `apps/`, `packages/`, `agent/`, `infra/`.

Out of scope:

- Vulnerabilities in third-party dependencies (npm packages, Docker base images, MCP servers shipped by other projects). Please report those upstream to the relevant project.
- Operator-side credential leaks (e.g. an operator committing a token to their own fork or a private profile). The operator is responsible for the credentials they install in their own deployment.
- Issues that require an attacker who already has full host access to the operator's machine.

## Acknowledgement

Public credit (in the eventual GitHub Security Advisory and any release notes) is offered on request. Reporters who prefer to remain anonymous are equally welcome.
