# Lawyer AI App - Base Requirements

## Problem
Lawyers and legal teams need faster drafting, review, and research while preserving accuracy, privacy, and auditability.

## Users
1. Solo lawyers
2. Law firm associates/partners
3. In-house legal counsel
4. Legal ops teams

## Core jobs-to-be-done
1. Analyze contracts and identify risky clauses
2. Draft legal communications and documents
3. Answer legal questions grounded in uploaded sources
4. Organize matter-specific knowledge and history

## Core modules
1. Authentication + RBAC
2. Document ingestion + OCR/parsing
3. Retrieval and legal Q&A (RAG)
4. Contract risk engine
5. Drafting assistant
6. Admin + audit logs

## Compliance baseline
1. Encryption in transit/at rest
2. Data residency controls
3. Access logs and exportability
4. PII redaction options

## MVP metrics
1. Time-to-first-answer under 8 seconds p95
2. Citation coverage >90% for document-grounded answers
3. User satisfaction >4/5 in pilot group
