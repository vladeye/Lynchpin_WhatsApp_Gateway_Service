# Documentation

Documentation for the Lynchpin WhatsApp Gateway, organised like the sibling
`appointment-business-platform` repository.

- `07-engineering/` — module and pipeline docs.
- `08-decisions/` — architecture decision records (DEC-NNN).
- `09-infrastructure/` — environment and deployment notes.

## Index

### Engineering

- [Gateway Accounts & Baileys Runtime](07-engineering/gateway-accounts-module.md)
- [Admin Console](07-engineering/admin-console.md)
- [Media (send & receive)](07-engineering/media.md)
- [Security & Authentication](07-engineering/security-auth.md)
- [Parameters & Runtime Settings](07-engineering/runtime-settings.md)
- [CI Pipeline](07-engineering/ci-pipeline.md)

### Decisions

- [DEC-001 Baileys runtime per account](08-decisions/DEC-001-baileys-runtime.md)
- [DEC-002 Postgres for persistence](08-decisions/DEC-002-postgres-persistence.md)
- [DEC-003 QR delivered via status polling](08-decisions/DEC-003-qr-via-polling.md)
- [DEC-004 Single-admin console auth](08-decisions/DEC-004-console-auth.md)

### Infrastructure

- [developer-01 environment](09-infrastructure/developer-01.md)
