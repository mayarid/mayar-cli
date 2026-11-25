# mayar-cli

A command-line client for the Mayar payment API. People and AI agents use it to manage products, invoices, customers, webhooks and other Mayar resources.

## Language

**API key**:
A long-lived secret the merchant copies from the Mayar dashboard and gives to the CLI.
_Avoid_: Token, secret

**Login token**:
A credential the CLI gets from Mayar through browser sign-in (`mayar login`).
_Avoid_: Auth token, session

**Credential**:
Whatever the CLI sends to Mayar to prove who the merchant is: an API key or a login token. An explicit API key always wins over a login token.

**Rejected response**:
A Mayar API reply that has a 2xx HTTP status but a body that says the request failed.
_Avoid_: Silent failure, soft error, 200 error

**Mayar skill**:
The official agent skill `mayar-v2`, kept in the `mayarid/skills` repository, that teaches AI agents to use Mayar and this CLI.
_Avoid_: SKILL.md, CLI skill

**Guard**:
A check the CLI runs on user input before it sends a request. When a guard refuses, nothing is sent to Mayar.
_Avoid_: Pre-flight validation, client-side validation
