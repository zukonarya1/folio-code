# Folio

AI-powered PDF conversation system. Upload documents, get AI-generated study digests, and ask questions backed by semantic search.

Live at **[folio.zukonarya.com](https://folio.zukonarya.com)**

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS, AWS Amplify |
| Auth | Amazon Cognito (email + Google sign-in) |
| API | AWS Lambda (Python 3.13) + API Gateway |
| AI | Amazon Bedrock — Claude Haiku (summaries + chat), Cohere (embeddings) |
| Storage | S3 (documents + vectors), DynamoDB (metadata + query logs) |
| Infrastructure | AWS CDK (TypeScript) |
| CI/CD | GitHub Actions + OIDC |

---

## Project Structure

```
folio-code/
├── frontend/                   # React application
│   ├── src/
│   │   ├── brand/              # Design tokens (Blade v3)
│   │   ├── components/         # Shared UI components
│   │   └── pages/              # Route-level pages
│   └── .env.example            # Required environment variables
├── lambda-functions/           # Lambda function source code (Python)
│   ├── bedrock-vectorization/
│   ├── conversation/
│   ├── document-ingestion/
│   ├── query-processing/
│   ├── s3-vectors-setup/
│   └── textract-results-processor/
├── infrastructure/
│   └── cdk/                    # CDK stacks (TypeScript)
├── tests/
│   ├── integration/            # Pytest integration tests
│   ├── phase3-infrastructure/  # CDK assertion tests
│   └── fixtures/               # Test assets
└── .github/workflows/          # CI/CD workflows
```

---

## Local Development

**Prerequisites:** Node.js 18+, Python 3.13, AWS CLI

```bash
# 1. Clone and install frontend dependencies
git clone https://github.com/zukonarya1/folio-code.git
cd folio-code/frontend
npm install

# 2. Configure environment
cp .env.example .env.local
# Populate .env.local with values from your dev environment

# 3. Start dev server
npm start
```

The app will start at `http://localhost:3000`. Without a populated `.env.local`, it will fail explicitly — there are no fallback values pointing to any live environment.

---

## Infrastructure

CDK manages 5–6 CloudFormation stacks per environment:

| Stack | Contents |
|---|---|
| Security | S3 bucket policies, encryption |
| Infra | S3 buckets, DynamoDB tables, SQS, Lambda functions |
| Monitoring | CloudWatch dashboards, alarms, SNS alerts |
| Frontend | S3 static hosting, CloudFront distribution |
| Auth | Cognito User Pool, Identity Pool, auth Lambdas |
| DNS (prod only) | Route 53, ACM certificate |

```bash
cd infrastructure/cdk
npm install
npm run build
npm test        # 84 CDK assertion tests
```

---

## CI/CD

Three environments, all deployed via GitHub Actions. No manual `cdk deploy`.

| Branch | Environment | URL |
|---|---|---|
| `develop` | dev | CloudFront (dev prefix) |
| `staging` | staging | CloudFront (staging prefix) |
| `main` | prod | [folio.zukonarya.com](https://folio.zukonarya.com) |

**Flow:** `feature/*` → PR → `develop` → PR → `staging` → PR → `main`

OIDC authentication — no long-lived AWS keys in CI.

---

## Document Pipeline

1. **Upload** — PDF stored in S3, Textract extracts text
2. **Vectorize** — Cohere embeddings stored in S3 Vectors
3. **Digest** — Claude Haiku generates structured study notes (map-reduce over chunks)
4. **Chat** — Semantic search retrieves relevant chunks, Claude Haiku answers questions

---

## License

Portfolio project. Not licensed for commercial use.
