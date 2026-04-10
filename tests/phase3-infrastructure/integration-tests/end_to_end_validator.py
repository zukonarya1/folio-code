#!/usr/bin/env python3
"""
End-to-End Integration Tests
Tests the complete PDF processing workflow: Upload → Textract → Bedrock → Query
"""

import boto3
import json
import time
import uuid
import base64
from typing import Dict, Any, Optional
from datetime import datetime

class EndToEndValidator:
    def __init__(self, region='us-west-2', account_id='874962954560'):
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.s3_client = boto3.client('s3', region_name=region)
        self.dynamodb_client = boto3.client('dynamodb', region_name=region)
        self.textract_client = boto3.client('textract', region_name=region)
        self.logs_client = boto3.client('logs', region_name=region)

        self.region = region
        self.account_id = account_id

        # Infrastructure resources
        self.processing_bucket = f'pdf-conversation-processing-{account_id}'
        self.vectors_bucket = f'pdf-conversation-vectors-{account_id}'
        self.digests_bucket = f'pdf-conversation-digests-{account_id}'
        self.metadata_table = 'pdf-conversation-metadata'
        self.query_logs_table = 'pdf-conversation-query-logs'

        # Lambda functions
        self.document_ingestion_function = 'DocumentIngestionFunction'
        self.query_processing_function = 'QueryProcessingFunction'

    def create_test_pdf_content(self) -> bytes:
        """Create a simple test PDF content for testing"""
        # This creates a minimal PDF structure for testing
        # In production, you'd use a proper PDF library like ReportLab
        pdf_content = """
%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Phase 3 Test Document) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000204 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
300
%%EOF
"""
        return pdf_content.encode('utf-8')

    def test_document_ingestion(self, test_document_id: str) -> Dict[str, Any]:
        """Test document ingestion Lambda function"""
        try:
            # Create test PDF content
            pdf_content = self.create_test_pdf_content()
            pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')

            # Prepare test payload
            test_payload = {
                "body": json.dumps({
                    "document_id": test_document_id,
                    "filename": f"phase3-test-{test_document_id}.pdf",
                    "content": pdf_base64,
                    "user_id": "phase3-tester"
                }),
                "headers": {
                    "Content-Type": "application/json"
                },
                "httpMethod": "POST",
                "path": "/upload"
            }

            print(f"    Invoking {self.document_ingestion_function}...")
            response = self.lambda_client.invoke(
                FunctionName=self.document_ingestion_function,
                Payload=json.dumps(test_payload)
            )

            response_payload = json.loads(response['Payload'].read())

            if response['StatusCode'] == 200:
                return {
                    'status': 'PASS',
                    'function': self.document_ingestion_function,
                    'response': response_payload,
                    'document_id': test_document_id
                }
            else:
                return {
                    'status': 'FAIL',
                    'function': self.document_ingestion_function,
                    'error': f"Status code: {response['StatusCode']}, Response: {response_payload}"
                }

        except Exception as e:
            return {
                'status': 'FAIL',
                'function': self.document_ingestion_function,
                'error': str(e)
            }

    def check_processing_bucket_upload(self, test_document_id: str) -> Dict[str, Any]:
        """Verify that document was uploaded to processing bucket"""
        try:
            # Look for the uploaded document in processing bucket
            response = self.s3_client.list_objects_v2(
                Bucket=self.processing_bucket,
                Prefix=f"phase3-test-{test_document_id}"
            )

            if 'Contents' in response and response['Contents']:
                return {
                    'status': 'PASS',
                    'bucket': self.processing_bucket,
                    'objects_found': len(response['Contents']),
                    'objects': [obj['Key'] for obj in response['Contents']]
                }
            else:
                return {
                    'status': 'FAIL',
                    'bucket': self.processing_bucket,
                    'error': 'No objects found with test document ID'
                }

        except Exception as e:
            return {
                'status': 'FAIL',
                'bucket': self.processing_bucket,
                'error': str(e)
            }

    def check_metadata_table_entry(self, test_document_id: str) -> Dict[str, Any]:
        """Verify that document metadata was stored in DynamoDB"""
        try:
            response = self.dynamodb_client.get_item(
                TableName=self.metadata_table,
                Key={'document_id': {'S': test_document_id}}
            )

            if 'Item' in response:
                item = response['Item']
                return {
                    'status': 'PASS',
                    'table': self.metadata_table,
                    'document_id': test_document_id,
                    'status_db': item.get('status', {}).get('S', 'Unknown'),
                    'user_id': item.get('user_id', {}).get('S', 'Unknown')
                }
            else:
                return {
                    'status': 'FAIL',
                    'table': self.metadata_table,
                    'error': 'No metadata entry found for document'
                }

        except Exception as e:
            return {
                'status': 'FAIL',
                'table': self.metadata_table,
                'error': str(e)
            }

    def test_query_processing(self, test_document_id: str) -> Dict[str, Any]:
        """Test query processing Lambda function"""
        try:
            test_payload = {
                "body": json.dumps({
                    "query": "Phase 3 test query",
                    "user_id": "phase3-tester",
                    "max_results": 5
                }),
                "headers": {
                    "Content-Type": "application/json"
                },
                "httpMethod": "POST",
                "path": "/query"
            }

            print(f"    Invoking {self.query_processing_function}...")
            response = self.lambda_client.invoke(
                FunctionName=self.query_processing_function,
                Payload=json.dumps(test_payload)
            )

            response_payload = json.loads(response['Payload'].read())

            if response['StatusCode'] == 200:
                return {
                    'status': 'PASS',
                    'function': self.query_processing_function,
                    'response': response_payload
                }
            else:
                return {
                    'status': 'FAIL',
                    'function': self.query_processing_function,
                    'error': f"Status code: {response['StatusCode']}, Response: {response_payload}"
                }

        except Exception as e:
            return {
                'status': 'FAIL',
                'function': self.query_processing_function,
                'error': str(e)
            }

    def cleanup_test_resources(self, test_document_id: str):
        """Clean up test resources created during testing"""
        try:
            # Clean up S3 objects
            for bucket in [self.processing_bucket, self.vectors_bucket, self.digests_bucket]:
                try:
                    response = self.s3_client.list_objects_v2(
                        Bucket=bucket,
                        Prefix=f"phase3-test-{test_document_id}"
                    )

                    if 'Contents' in response:
                        objects_to_delete = [{'Key': obj['Key']} for obj in response['Contents']]
                        if objects_to_delete:
                            self.s3_client.delete_objects(
                                Bucket=bucket,
                                Delete={'Objects': objects_to_delete}
                            )
                except Exception:
                    pass  # Continue with cleanup even if some items fail

            # Clean up DynamoDB entries
            try:
                self.dynamodb_client.delete_item(
                    TableName=self.metadata_table,
                    Key={'document_id': {'S': test_document_id}}
                )
            except Exception:
                pass

            # Clean up query logs (search by user_id since we don't have query_id)
            try:
                # This is a simplified cleanup - in practice you'd need to scan and delete
                pass
            except Exception:
                pass

        except Exception as e:
            print(f"    Warning: Cleanup failed for some resources: {e}")

    def run_end_to_end_test(self) -> Dict[str, Any]:
        """Run complete end-to-end integration test"""
        test_document_id = f"e2e-test-{uuid.uuid4()}"

        print(f"🔄 Running End-to-End Integration Test...")
        print(f"    Test Document ID: {test_document_id}")
        print()

        results = {
            'test_document_id': test_document_id,
            'document_ingestion': {},
            'processing_bucket_check': {},
            'metadata_table_check': {},
            'query_processing': {},
            'cleanup_status': 'Not attempted'
        }

        try:
            # Step 1: Test document ingestion
            print("  Step 1: Testing document ingestion...")
            results['document_ingestion'] = self.test_document_ingestion(test_document_id)

            if results['document_ingestion']['status'] == 'PASS':
                # Wait a moment for processing
                time.sleep(2)

                # Step 2: Check if document was uploaded to S3
                print("  Step 2: Checking processing bucket upload...")
                results['processing_bucket_check'] = self.check_processing_bucket_upload(test_document_id)

                # Step 3: Check if metadata was stored
                print("  Step 3: Checking metadata table entry...")
                results['metadata_table_check'] = self.check_metadata_table_entry(test_document_id)

            # Step 4: Test query processing (independent of document ingestion success)
            print("  Step 4: Testing query processing...")
            results['query_processing'] = self.test_query_processing(test_document_id)

        except Exception as e:
            results['error'] = str(e)

        finally:
            # Cleanup
            print("  Step 5: Cleaning up test resources...")
            try:
                self.cleanup_test_resources(test_document_id)
                results['cleanup_status'] = 'Success'
            except Exception as e:
                results['cleanup_status'] = f'Failed: {e}'

        return results

    def print_test_summary(self, results: Dict[str, Any]):
        """Print formatted end-to-end test results"""
        print("="*60)
        print("🔄 END-TO-END INTEGRATION TEST SUMMARY")
        print("="*60)

        test_steps = [
            ('document_ingestion', 'Document Ingestion'),
            ('processing_bucket_check', 'Processing Bucket Upload'),
            ('metadata_table_check', 'Metadata Storage'),
            ('query_processing', 'Query Processing')
        ]

        passed_tests = 0
        total_tests = len(test_steps)

        for step_key, step_name in test_steps:
            if step_key in results and results[step_key]:
                status = results[step_key].get('status', 'Unknown')
                status_emoji = "✅" if status == 'PASS' else "❌"
                error_msg = results[step_key].get('error', 'OK')

                print(f"{status_emoji} {step_name}: {error_msg}")

                if status == 'PASS':
                    passed_tests += 1
            else:
                print(f"⏸️ {step_name}: Not executed")

        print(f"\n🎯 INTEGRATION TEST: {passed_tests}/{total_tests} steps passed")
        print(f"🧹 Cleanup Status: {results.get('cleanup_status', 'Unknown')}")
        print("="*60)

def main():
    """Run end-to-end integration tests"""
    validator = EndToEndValidator()
    results = validator.run_end_to_end_test()
    validator.print_test_summary(results)

    return results

if __name__ == "__main__":
    main()