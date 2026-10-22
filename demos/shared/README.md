# Shared public manufacturing day

`manufacturing-day.json` is the public fixture contract for guided Acor.dev demonstrations. Every identity and value is invented. It deliberately preserves relationships between planning, geometry, generated artifacts, release, station custody, completion, and pallet evidence.

The contract is static and browser-local. Public demos must not import production adapters, endpoints, credentials, paths, or machine programs. A reset must reconstruct its state from this file.

The site validator checks the scenario totals, unique identities, cross-record references, hashes, and the two guarded outcomes:

- `DEMO-1042` completes independent TAP and XPR validation from one canonical sheet count.
- `DEMO-1063` stops at recipe preflight and publishes no partial output.
