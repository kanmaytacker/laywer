# Sample Data Schema

All sample datasets are JSONL (one JSON object per line).

## Files
- `data/sample/legal_doc_summarization.jsonl`
- `data/sample/legal_queries_and_responses.jsonl`
- `data/sample/proofreading_cases.jsonl`

## Common fields
- `id` (string): unique record id
- `task` (string): task type label
- `tags` (array[string]): searchable categories

## Task-specific fields
- `summarize_document`:
  - `document_type`, `jurisdiction`, `input_text`, `expected_summary`, `risk_flags`
- `legal_query_response`:
  - `user_query`, `intent`, `response_style`, `assistant_response`, `citations`, `confidence`, `needs_human_lawyer_review`
- `proofread_legal_text`:
  - `input_text`, `issues_expected`, `corrected_text`, `change_notes`

## Note
These are synthetic examples for product prototyping, not legal advice.
