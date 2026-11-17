# Project state is one jsonb Project Document per studio project

A Project's full state (brief, intent, direction candidates, style lines with their style revs and slot images) is stored as a single jsonb Project Document on its `studio_projects` row, with an `updated_at` and an integer `version` for optimistic concurrency, rather than in normalized tables for style lines, revs and slot images. The client keeps a local cache and saves the whole document; on a version conflict the server copy wins and the client reloads. The document is the unit the UI reads and writes, it is validated with one zod schema on the server, and normalizing it would add many tables and joins for data that is never queried across projects.

## Consequences

- The uploaded wireframe is stored as an `image_blobs` row and referenced by its `/api/images/<id>` URL; image bytes never go into the document.
- Cross-project queries over style data (for example "all revs that changed the primary colour") are not supported without a migration.
- Saves carry the whole document, so the server enforces a size cap.
