#!/usr/bin/env python3
"""
Lambda Function Component Tests
Tests each Lambda function individually to validate deployment and basic functionality
"""

import boto3
import json
import time
from typing import Dict, List, Any

class LambdaFunctionValidator:
    def __init__(self, region='us-west-2'):
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.region = region

        # Expected Lambda functions based on infrastructure
        self.expected_functions = [
            'DocumentIngestionFunction',
            'TextractResultsProcessorFunction',
            'BedrockToS3Vectorization',
            'QueryProcessingFunction'
        ]

    def validate_function_exists(self, function_name: str) -> Dict[str, Any]:
        """Validate that Lambda function exists and get its configuration"""
        try:
            response = self.lambda_client.get_function(FunctionName=function_name)
            return {
                'status': 'PASS',
                'function_name': function_name,
                'runtime': response['Configuration']['Runtime'],
                'memory_size': response['Configuration']['MemorySize'],
                'timeout': response['Configuration']['Timeout'],
                'last_modified': response['Configuration']['LastModified']
            }
        except Exception as e:
            return {
                'status': 'FAIL',
                'function_name': function_name,
                'error': str(e)
            }

    def test_function_invocation(self, function_name: str, test_payload: Dict = None) -> Dict[str, Any]:
        """Test basic function invocation (dry run)"""
        if test_payload is None:
            test_payload = {"test": True, "source": "phase3-testing"}

        try:
            response = self.lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='DryRun',  # Validates function without executing
                Payload=json.dumps(test_payload)
            )

            return {
                'status': 'PASS',
                'function_name': function_name,
                'status_code': response['StatusCode'],
                'message': 'Function validation successful'
            }
        except Exception as e:
            return {
                'status': 'FAIL',
                'function_name': function_name,
                'error': str(e)
            }

    def get_function_logs(self, function_name: str) -> Dict[str, Any]:
        """Check if CloudWatch logs exist for the function"""
        logs_client = boto3.client('logs', region_name=self.region)
        log_group_name = f'/aws/lambda/{function_name}'

        try:
            response = logs_client.describe_log_groups(
                logGroupNamePrefix=log_group_name
            )

            if response['logGroups']:
                log_group = response['logGroups'][0]
                return {
                    'status': 'PASS',
                    'function_name': function_name,
                    'log_group': log_group['logGroupName'],
                    'retention_days': log_group.get('retentionInDays', 'Never Expire'),
                    'stored_bytes': log_group['storedBytes']
                }
            else:
                return {
                    'status': 'FAIL',
                    'function_name': function_name,
                    'error': 'Log group not found'
                }
        except Exception as e:
            return {
                'status': 'FAIL',
                'function_name': function_name,
                'error': str(e)
            }

    def run_all_tests(self) -> Dict[str, List[Dict]]:
        """Run all component tests for Lambda functions"""
        results = {
            'function_existence': [],
            'function_invocation': [],
            'cloudwatch_logs': []
        }

        print("🧪 Running Lambda Function Component Tests...\n")

        for function_name in self.expected_functions:
            print(f"Testing {function_name}...")

            # Test 1: Function exists and configuration
            existence_result = self.validate_function_exists(function_name)
            results['function_existence'].append(existence_result)

            if existence_result['status'] == 'PASS':
                # Test 2: Function invocation (dry run)
                invocation_result = self.test_function_invocation(function_name)
                results['function_invocation'].append(invocation_result)

                # Test 3: CloudWatch logs setup
                logs_result = self.get_function_logs(function_name)
                results['cloudwatch_logs'].append(logs_result)

            print()

        return results

    def print_test_summary(self, results: Dict[str, List[Dict]]):
        """Print formatted test results summary"""
        print("="*60)
        print("🧪 LAMBDA FUNCTION TEST SUMMARY")
        print("="*60)

        for test_type, test_results in results.items():
            print(f"\n{test_type.upper().replace('_', ' ')}:")
            print("-" * 40)

            passed = sum(1 for r in test_results if r['status'] == 'PASS')
            total = len(test_results)

            for result in test_results:
                status_emoji = "✅" if result['status'] == 'PASS' else "❌"
                print(f"{status_emoji} {result['function_name']}: {result.get('error', 'OK')}")

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
    """Run Lambda function component tests"""
    validator = LambdaFunctionValidator()
    results = validator.run_all_tests()
    validator.print_test_summary(results)

    return results

if __name__ == "__main__":
    main()