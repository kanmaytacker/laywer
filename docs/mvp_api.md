# MatterDesk MVP API

Base URL: `http://127.0.0.1:8000`

Auth for protected routes: send `X-User-Id: <id>` header.

## Core endpoints

- `POST /users` create a user with role (`Admin|Editor|Viewer`) and tenant.
- `POST /matters` create matter metadata.
- `GET /matters` list tenant matters.
- `POST /matters/{matter_id}/documents` upload and version documents with `title` + `tag`.
- `GET /matters/{matter_id}/search?q=...` matter-scoped full-text search.
- `POST /matters/{matter_id}/generate/{artifact_type}` where artifact type is:
  - `brief`
  - `chronology`
  - `issues`
  - `draft`
  - `annexure_index`
- `GET /matters/{matter_id}/artifacts` list generated artifacts.
- `POST /matters/{matter_id}/tasks` create deadline/task.
- `POST /matters/{matter_id}/comments` add review comments.
- `GET /matters/{matter_id}/audit` view audit events.
- `GET /matters/{matter_id}/export/artifact/{artifact_id}/docx` export artifact DOCX.
- `GET /matters/{matter_id}/export/bundle.pdf` export filing bundle PDF.

## Notes

- Citation grounding for MVP is at uploaded source-document level.
- `PDF` and `DOCX` text extraction is implemented; images are stored but OCR is not mandatory in this baseline.
- Exports are human-in-loop only (explicit user-triggered API call).
