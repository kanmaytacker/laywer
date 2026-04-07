# Lawyer AI App - Draft Requirements

## Product goal
Build an AI assistant focused on legal workflows inferred from prior usage patterns.

## Target capabilities
1. Legal Q&A with citations and confidence levels.
2. Contract analysis (risk flags, clause extraction, suggested edits).
3. Matter workspace (store files, notes, chat history).
4. Drafting support for emails, notices, and legal templates.
5. Retrieval over prior matters and uploaded documents.

## Inferred priority topics
contracts

## Functional requirements
1. Authentication and role-based access (admin, lawyer, assistant).
2. Secure document upload and parsing (PDF/DOCX/TXT).
3. Conversational assistant with context window over matter documents.
4. Source-grounded answers with citation snippets.
5. Red-flag detector for contract/legal risk language.
6. Export outputs to DOCX/PDF.
7. Audit log for prompts, outputs, and user actions.

## Non-functional requirements
1. Encryption at rest and in transit.
2. PII handling and data retention controls.
3. Prompt/output observability and moderation.
4. Latency target: <8s p95 for standard Q&A.
5. High availability with daily backup.

## Suggested MVP scope
1. Matter creation + document upload.
2. RAG chat over documents.
3. Contract risk checklist for top 3 contract types.
4. Basic drafting templates.
5. Admin dashboard for usage and logs.
