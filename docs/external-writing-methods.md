# External Writing Methods

## ip-strategist V1.2B-6 experiment

- Source: [erduo1998-cell/ip-strategist](https://github.com/erduo1998-cell/ip-strategist)
- Version: `v2.2.0`
- Commit: `3716c815eb258a55918592b72a92add1cfd12f8b`
- License: CC BY-NC 4.0
- Strategy: `METHOD_SOURCE + OWN_RUNTIME`

The project preserves three upstream Markdown files unchanged under `vendor/ip-strategist/v2.2.0/references/`. A server-only Writing Method Adapter selects the small set of original passages needed by `GENERATE_MOTHER_CONTENT`, removes exact duplicate blocks, and fails closed if a required semantic anchor is missing. The browser never receives the source files.

The runtime loads:

- `task-script.md`: reference-mechanism transformation, minimum topic judgment, primary narrative force, spoken expression, and final self-check.
- `03-脚本骨架.md`: attention, information granularity, and narrative momentum.
- `04-口播文案.md`: spoken-language fundamentals, short sentences, meaning units, and spoken minimum criteria.

It does not load dossier/onboarding, contracts, task routing, topic discovery, growth, review, monetization, publishing, templates, scripts, or the complete Skill. The existing fact, safety, provenance, CreativeBasis, CreativeBrief, and CreatorProfile constraints remain higher priority than the external method. The method is never treated as a fact source.

The method context is limited to 8,000 characters and targeted to approximately 4,000–8,000 Chinese characters. One user action still causes at most one existing `GENERATE_MOTHER_CONTENT` LLM request; there is no second humanization call.

## License boundary

ip-strategist v2.2.0 is CC BY-NC 4.0. The imported material is therefore approved here only for this internal, non-commercial evaluation, with attribution. It is not cleared for a commercial release. Commercial use requires separate written authorization from the copyright owner. The complete source notice is in `vendor/ip-strategist/v2.2.0/SOURCE.md`.

## Upgrade procedure

1. Fetch a named upstream tag into a temporary directory; do not create a nested Git repository in this project.
2. Verify the exact commit, license, imported file paths, and normalized hashes.
3. Replace the preserved originals without editing their text.
4. Update `SOURCE.md`, `docs/reference-map.md`, semantic anchors, and targeted tests.
5. Re-run the context-budget, prompt-injection, one-call, quality, and license review before enabling the new version.
