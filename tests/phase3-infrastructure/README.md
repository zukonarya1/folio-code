# Phase 3: Infrastructure Testing

Comprehensive test suite for validating the PDF Conversation System infrastructure deployed in AWS.

## Quick Start

**Activate your virtual environment first:**
```bash
source venv/bin/activate  # or 'venv\Scripts\activate' on Windows
```

**Run all tests:**
```bash
python tests/phase3-infrastructure/scripts/run_all_tests.py
```

**Run individual test suites:**
```bash
# Lambda function tests
python tests/phase3-infrastructure/component-tests/lambda_function_validator.py

# Storage tests (S3 + DynamoDB)
python tests/phase3-infrastructure/component-tests/storage_validator.py

# End-to-end integration tests
python tests/phase3-infrastructure/integration-tests/end_to_end_validator.py

# IAM security tests
python tests/phase3-infrastructure/security-tests/iam_security_validator.py
```

## Test Structure

### Component Tests (`component-tests/`)
- `lambda_function_validator.py` - Tests all 4 Lambda functions (existence, invocation, CloudWatch logs)
- `storage_validator.py` - Validates S3 buckets and DynamoDB tables (existence and operations)

### Integration Tests (`integration-tests/`)
- `end_to_end_validator.py` - Complete workflow testing (PDF upload → processing → query)

### Security Tests (`security-tests/`)
- `iam_security_validator.py` - IAM role and policy validation

### Scripts (`scripts/`)
- `run_all_tests.py` - Master test runner that executes all test suites

## Test Results

Individual test results are displayed in the console. The master test runner saves detailed results to:
```
tests/phase3-infrastructure/test-results/phase3_test_results_<timestamp>.json
```

## Current Test Status

✅ **Lambda Functions**: 12/12 tests passing
- DocumentIngestionFunction
- TextractResultsProcessorFunction
- BedrockToS3Vectorization
- QueryProcessingFunction

✅ **Storage Components**: 12/12 tests passing
- S3 Buckets (4): processing, vectors, vectors-json, digests
- DynamoDB Tables (2): metadata, query-logs

⚠️ **Integration Tests**: 2/4 tests passing
- ✅ Document Ingestion
- ❌ Processing Bucket Upload (no objects with test document ID)
- ❌ Metadata Storage (no metadata entry found)
- ✅ Query Processing

## Known Issues

The integration test failures appear to be related to:
1. Asynchronous processing delays - Lambda functions may need more time to complete
2. Event-driven architecture - S3 triggers may not fire during synthetic tests
3. Test payload structure - May need adjustment to match production data format

## Prerequisites

- AWS CLI configured with credentials for the target Folio AWS account
- Python 3.9+ with virtual environment activated
- boto3 installed (`pip install -r requirements.txt`)
- Access to deployed infrastructure stack in us-west-2
- Appropriate IAM permissions to invoke Lambda functions and access S3/DynamoDB