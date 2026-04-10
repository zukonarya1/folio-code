#!/usr/bin/env python3
"""
Storage Component Tests
Tests S3 buckets and DynamoDB tables to validate deployment and basic functionality
"""

import boto3
import json
import uuid
import time
from typing import Dict, List, Any
from datetime import datetime

class StorageValidator:
    def __init__(self, region='us-west-2', account_id='874962954560'):
        self.s3_client = boto3.client('s3', region_name=region)
        self.dynamodb_client = boto3.client('dynamodb', region_name=region)
        self.region = region
        self.account_id = account_id

        # Expected resources based on infrastructure
        self.expected_s3_buckets = [
            f'pdf-conversation-processing-{account_id}',
            f'pdf-conversation-vectors-{account_id}',
            f'pdf-conversation-vectors-json-{account_id}',
            f'pdf-conversation-digests-{account_id}'
        ]

        self.expected_dynamodb_tables = [
            'pdf-conversation-metadata',
            'pdf-conversation-query-logs'
        ]

    def validate_s3_bucket(self, bucket_name: str) -> Dict[str, Any]:
        """Validate S3 bucket exists and basic properties"""
        try:
            # Check if bucket exists
            self.s3_client.head_bucket(Bucket=bucket_name)

            # Get bucket location
            location = self.s3_client.get_bucket_location(Bucket=bucket_name)
            region = location['LocationConstraint'] or 'us-east-1'

            # Get bucket encryption
            try:
                encryption = self.s3_client.get_bucket_encryption(Bucket=bucket_name)
                encryption_status = "Enabled"
            except:
                encryption_status = "Not Configured"

            # Get bucket policy (if any)
            try:
                self.s3_client.get_bucket_policy(Bucket=bucket_name)
                policy_status = "Configured"
            except:
                policy_status = "No Policy"

            return {
                'status': 'PASS',
                'bucket_name': bucket_name,
                'region': region,
                'encryption': encryption_status,
                'policy': policy_status
            }
        except Exception as e:
            return {
                'status': 'FAIL',
                'bucket_name': bucket_name,
                'error': str(e)
            }

    def test_s3_operations(self, bucket_name: str) -> Dict[str, Any]:
        """Test basic S3 operations (put/get/delete test object)"""
        test_key = f"phase3-test/{uuid.uuid4()}.txt"
        test_content = f"Phase 3 Infrastructure Test - {datetime.now()}"

        try:
            # Put test object
            self.s3_client.put_object(
                Bucket=bucket_name,
                Key=test_key,
                Body=test_content.encode('utf-8'),
                ServerSideEncryption='AES256'
            )

            # Get test object
            response = self.s3_client.get_object(Bucket=bucket_name, Key=test_key)
            retrieved_content = response['Body'].read().decode('utf-8')

            # Verify content
            if retrieved_content == test_content:
                # Clean up - delete test object
                self.s3_client.delete_object(Bucket=bucket_name, Key=test_key)

                return {
                    'status': 'PASS',
                    'bucket_name': bucket_name,
                    'operations': 'PUT/GET/DELETE successful'
                }
            else:
                return {
                    'status': 'FAIL',
                    'bucket_name': bucket_name,
                    'error': 'Content mismatch in PUT/GET operation'
                }

        except Exception as e:
            # Attempt cleanup if test object was created
            try:
                self.s3_client.delete_object(Bucket=bucket_name, Key=test_key)
            except:
                pass

            return {
                'status': 'FAIL',
                'bucket_name': bucket_name,
                'error': str(e)
            }

    def validate_dynamodb_table(self, table_name: str) -> Dict[str, Any]:
        """Validate DynamoDB table exists and get configuration"""
        try:
            response = self.dynamodb_client.describe_table(TableName=table_name)
            table_info = response['Table']

            return {
                'status': 'PASS',
                'table_name': table_name,
                'status_db': table_info['TableStatus'],
                'billing_mode': table_info.get('BillingModeSummary', {}).get('BillingMode', 'PROVISIONED'),
                'item_count': table_info['ItemCount'],
                'table_size': table_info['TableSizeBytes'],
                'gsi_count': len(table_info.get('GlobalSecondaryIndexes', []))
            }
        except Exception as e:
            return {
                'status': 'FAIL',
                'table_name': table_name,
                'error': str(e)
            }

    def test_dynamodb_operations(self, table_name: str) -> Dict[str, Any]:
        """Test basic DynamoDB operations (put/get/delete test item)"""
        test_id = f"phase3-test-{uuid.uuid4()}"

        # Table-specific test items
        if 'metadata' in table_name:
            test_item = {
                'document_id': {'S': test_id},
                'user_id': {'S': 'test-user'},
                'status': {'S': 'testing'},
                'created_at': {'S': datetime.now().isoformat()},
                'test_flag': {'BOOL': True}
            }
            key = {'document_id': {'S': test_id}}
        else:  # query-logs table
            test_item = {
                'query_id': {'S': test_id},
                'timestamp': {'S': datetime.now().isoformat()},
                'user_id': {'S': 'test-user'},
                'query_text': {'S': 'Phase 3 infrastructure test'},
                'test_flag': {'BOOL': True}
            }
            key = {
                'query_id': {'S': test_id},
                'timestamp': {'S': test_item['timestamp']['S']}
            }

        try:
            # Put test item
            self.dynamodb_client.put_item(
                TableName=table_name,
                Item=test_item
            )

            # Get test item
            response = self.dynamodb_client.get_item(
                TableName=table_name,
                Key=key
            )

            if 'Item' in response:
                # Delete test item
                self.dynamodb_client.delete_item(
                    TableName=table_name,
                    Key=key
                )

                return {
                    'status': 'PASS',
                    'table_name': table_name,
                    'operations': 'PUT/GET/DELETE successful'
                }
            else:
                return {
                    'status': 'FAIL',
                    'table_name': table_name,
                    'error': 'Item not found after PUT operation'
                }

        except Exception as e:
            # Attempt cleanup
            try:
                self.dynamodb_client.delete_item(TableName=table_name, Key=key)
            except:
                pass

            return {
                'status': 'FAIL',
                'table_name': table_name,
                'error': str(e)
            }

    def run_all_tests(self) -> Dict[str, List[Dict]]:
        """Run all storage component tests"""
        results = {
            's3_validation': [],
            's3_operations': [],
            'dynamodb_validation': [],
            'dynamodb_operations': []
        }

        print("💾 Running Storage Component Tests...\n")

        # Test S3 buckets
        print("Testing S3 Buckets:")
        for bucket_name in self.expected_s3_buckets:
            print(f"  Testing {bucket_name}...")

            # Validation test
            validation_result = self.validate_s3_bucket(bucket_name)
            results['s3_validation'].append(validation_result)

            if validation_result['status'] == 'PASS':
                # Operations test
                operations_result = self.test_s3_operations(bucket_name)
                results['s3_operations'].append(operations_result)

        print()

        # Test DynamoDB tables
        print("Testing DynamoDB Tables:")
        for table_name in self.expected_dynamodb_tables:
            print(f"  Testing {table_name}...")

            # Validation test
            validation_result = self.validate_dynamodb_table(table_name)
            results['dynamodb_validation'].append(validation_result)

            if validation_result['status'] == 'PASS':
                # Operations test
                operations_result = self.test_dynamodb_operations(table_name)
                results['dynamodb_operations'].append(operations_result)

        print()
        return results

    def print_test_summary(self, results: Dict[str, List[Dict]]):
        """Print formatted test results summary"""
        print("="*60)
        print("💾 STORAGE COMPONENT TEST SUMMARY")
        print("="*60)

        for test_type, test_results in results.items():
            if not test_results:
                continue

            print(f"\n{test_type.upper().replace('_', ' ')}:")
            print("-" * 40)

            passed = sum(1 for r in test_results if r['status'] == 'PASS')
            total = len(test_results)

            for result in test_results:
                status_emoji = "✅" if result['status'] == 'PASS' else "❌"
                resource_name = result.get('bucket_name', result.get('table_name', 'Unknown'))
                print(f"{status_emoji} {resource_name}: {result.get('error', 'OK')}")

            print(f"\nResults: {passed}/{total} passed")

        # Overall summary
        all_results = []
        for test_results in results.values():
            all_results.extend(test_results)

        overall_passed = sum(1 for r in all_results if r['status'] == 'PASS')
        overall_total = len(all_results)

        print(f"\n🎯 OVERALL: {overall_passed}/{overall_total} tests passed")
        print("="*60)

def main():
    """Run storage component tests"""
    validator = StorageValidator()
    results = validator.run_all_tests()
    validator.print_test_summary(results)

    return results

if __name__ == "__main__":
    main()