# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository currently contains **no implementation code**. The directories `11_frontend`, `12_backend`, `13_infra`, and `14_script` are empty placeholders for future work. The only substantive content is the requirements document at `01_docs/01_ra/requirements3.md` (v1.1, 2026-07-05), which is the source of truth for everything below.

There are no build/lint/test commands yet because no project has been scaffolded. When frontend/backend/infra code is added, this file should be updated with the actual commands (npm scripts, CDK commands, test runners, etc.) rather than assumed ones.

## Project overview

Oracle Master 資格（Bronze DBA / Silver SQL / Silver DBA / Gold DBA）の学習者向けに、1問1答形式の問題演習を提供する PWA（Progressive Web App）。将来的に AI（Anthropic Claude API）による問題生成・オンデマンド解説機能を追加予定。

## Phased scope (important — don't build ahead of phase)

- **Phase 1** (this is what gets built first): React PWA, AWS サーバーレス構成、Cognito 認証必須、出題・採点・解説・結果表示・問題閲覧。初期問題データは開発者スクリプトで DynamoDB に直接投入（インポート UI なし）。
- **Phase 2**: React Native/Flutter によるネイティブ化、オフライン本格対応、学習進捗グラフ、プッシュ通知、AWS WAF。
- **Phase 3**: 問題インポート UI（F-08）、AI 問題生成（F-09, Claude API 連携）、進捗管理・履歴保存（F-10）、AI オンデマンド解説キャッシュ（F-11）。

Features tagged Phase 2/3 in the requirements doc (問題作成・インポート画面 S-04, AI 生成, オフラインキャッシュ, 進捗グラフ, プッシュ通知) should stay stubbed/non-activated until their phase, per F-02 ("問題作成・インポートはPhase3で実装のため、Phase1・Phase2では非活性").

## Architecture (target, per requirements doc §5)

```
Browser (PWA) --HTTPS/REST--> API Gateway (Cognito authorizer on ALL routes)
                                    --> Lambda (Node.js 20.x)
                                          --> DynamoDB (questions/progress data)
                                          --> S3 (images, JSON import files)
                                          --> Anthropic Claude API (Phase 3 only)
Frontend hosting/CI: AWS Amplify
IaC: AWS CDK (TypeScript)
```

Key architectural decisions to preserve:
- **All API endpoints require Cognito auth from Phase 1**, including read-only reference endpoints like `/qualifications` and `/categories` — do not make these public even though they seem harmless.
- Explanations (解説) are pre-registered text, not generated at request time in Phase 1/2 — AI-generated on-demand explanations are Phase 3 (F-11).
- Multiple-choice questions (複数選択) score correct only on **exact set match** between selected and correct choice IDs — no partial credit.

## Data model (DynamoDB, §6)

7 tables, single-table-per-entity design (not a single-table DynamoDB pattern):

| Table | PK | Key GSIs | Notes |
|---|---|---|---|
| QualificationMaster | qualificationId (e.g. `1Z0-085-JPN`) | — | scanned (small dataset) |
| CategoryMaster | categoryId | qualificationId | 大問カテゴリ |
| Questions | questionId | qualificationId, categoryId | questionType: `single`/`multiple`; correctCount used for multi-select |
| Choices | choiceId | questionId | up to 10 choices per question |
| Users | userId (= Cognito sub) | email | minimal PII — most identity data lives in Cognito |
| ExamSessions | sessionId | userId | status: `in_progress`/`completed`/`expired` |
| AnswerHistories | historyId | sessionId | selectedChoiceIds is a list; isCorrect = exact set match |

See §6.3 in the requirements doc for the full access-pattern-to-GSI mapping before adding new queries.

## API surface (target, §7)

REST endpoints under a Cognito-protected API Gateway: `/qualifications`, `/categories`, `/questions`, `/questions/random`, `/questions/import` (Phase 3), `/questions/generate` (Phase 3), `/sessions`, `/sessions/{sessionId}`, `/users/me`.

The question-import JSON schema (§7.2) is used both by the future Phase 3 import UI *and* as the internal format for the Phase 1 developer seed script — keep both in sync with the same schema if implementing either.

## Tech stack (§10.1)

- Frontend (Phase 1): React + Web App Manifest/Service Worker (PWA)
- Frontend (Phase 2): React Native or Flutter, built on the Phase 1 React codebase
- Backend: Node.js 20.x on Lambda
- IaC: AWS CDK (TypeScript)
- CI/CD: AWS Amplify / GitHub Actions
- Tests: Jest (unit), Playwright (E2E, Phase 1)
- Initial data seeding: a Node.js script that loads JSON directly into DynamoDB (used until F-08 import UI exists in Phase 3)

## Branching (§10.2)

`main` (production, tagged releases) ← `develop` (integration) ← `feature/xxx` / `hotfix/xxx`.

## Reference

Full requirements, screen designs, wireframes, non-functional/security requirements, and the phase schedule are in `01_docs/01_ra/requirements3.md`. Consult it directly for anything not summarized here (screen-by-screen wireframes, performance/availability targets, security requirements) rather than assuming.
