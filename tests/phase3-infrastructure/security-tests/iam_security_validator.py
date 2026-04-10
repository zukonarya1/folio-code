#!/usr/bin/env python3
"""
Security and IAM Validation Tests
Tests IAM policies, encryption, and security configurations
"""

import boto3
import json
import time
from typing import Dict, List, Any

class SecurityValidator:
    def __init__(self, region='us-west-2', account_id='874962954560'):
        self.iam_client = boto3.client('iam', region_name=region)
        self.s3_client = boto3.client('s3', region_name=region)
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.dynamodb_client = boto3.client('dynamodb', region_name=region)

        self.region = region
        self.account_id = account_id

        # Expected IAM roles based on infrastructure (actual names from deployment)
        self.expected_roles = [
            'DocumentIngestionFunction-role',
            'TextractResultsProcessorFunction-role',
            'BedrockToS3Vectorization-Lambda',
            'QueryProcessingFunction-role'
        ]

        # Expected resources
        self.s3_buckets = [
            f'pdf-conversation-processing-{account_id}',
            f'pdf-conversation-vectors-{account_id}',
            f'pdf-conversation-vectors-json-{account_id}',
            f'pdf-conversation-digests-{account_id}'
        ]

        self.dynamodb_tables = [
            'pdf-conversation-metadata',
            'pdf-conversation-query-logs'
        ]

        self.lambda_functions = [
            'DocumentIngestionFunction',
            'TextractResultsProcessorFunction',
            'BedrockToS3Vectorization',
            'QueryProcessingFunction'
        ]

    def validate_iam_role_exists(self, role_name: str) -> Dict[str, Any]:
        """Validate that IAM role exists and get basic info"""
        try:
            response = self.iam_client.get_role(RoleName=role_name)
            role_info = response['Role']

            return {
                'status': 'PASS',
                'role_name': role_name,
                'arn': role_info['Arn'],
                'created_date': role_info['CreateDate'],
                'trust_policy_services': self._extract_trusted_services(role_info['AssumeRolePolicyDocument'])
            }
        except Exception as e:
            return {
                'status': 'FAIL',
                'role_name': role_name,
                'error': str(e)
            }

    def _extract_trusted_services(self, trust_policy: str) -> List[str]:
        """Extract trusted services from assume role policy document"""
        try:
            if isinstance(trust_policy, str):
                policy_doc = json.loads(trust_policy)
            else:
                policy_doc = trust_policy

            services = []
            for statement in policy_doc.get('Statement', []):
                principal = statement.get('Principal', {})
                if isinstance(principal, dict) and 'Service' in principal:
                    service_list = principal['Service']
                    if isinstance(service_list, str):
                        services.append(service_list)
                    elif isinstance(service_list, list):
                        services.extend(service_list)

            return services
        except Exception:
            return ['Unable to parse']

    def validate_iam_role_policies(self, role_name: str) -> Dict[str, Any]:
        """Check attached policies for IAM role"""
        try:
            # Get attached managed policies
            attached_policies = self.iam_client.list_attached_role_policies(RoleName=role_name)

            # Get inline policies
            inline_policies = self.iam_client.list_role_policies(RoleName=role_name)

            return {
                'status': 'PASS',
                'role_name': role_name,
                'attached_policies': len(attached_policies['AttachedPolicies']),
                'inline_policies': len(inline_policies['PolicyNames']),
                'policy_details': {
                    'attached': [p['PolicyName'] for p in attached_policies['AttachedPolicies']],
                    'inline': inline_policies['PolicyNames']
                }
            }
        except Exception as e:
            return {
                'status': 'FAIL',
                'role_name': role_name,
                'error': str(e)
            }

    def validate_s3_encryption(self, bucket_name: str) -> Dict[str, Any]:
        """Validate S3 bucket encryption configuration"""
        try:
            # Check bucket encryption
            try:
                encryption_response = self.s3_client.get_bucket_encryption(Bucket=bucket_name)
                encryption_enabled = True
                encryption_details = encryption_response['ServerSideEncryptionConfiguration']['Rules'][0]['ApplyServerSideEncryptionByDefault']
                encryption_algorithm = encryption_details['SSEAlgorithm']
            except self.s3_client.exceptions.ClientError as e:
                if e.response['Error']['Code'] == 'ServerSideEncryptionConfigurationNotFoundError':
                    encryption_enabled = False
                    encryption_algorithm = None
                else:
                    raise e

            # Check public access block
            public_access = self.s3_client.get_public_access_block(Bucket=bucket_name)
            public_config = public_access['PublicAccessBlockConfiguration']

            # Ideal security: all public access should be blocked
            public_access_blocked = all([
                public_config['BlockPublicAcls'],
                public_config['IgnorePublicAcls'],
                public_config['BlockPublicPolicy'],
                public_config['RestrictPublicBuckets']
            ])

            return {
                'status': 'PASS',
                'bucket_name': bucket_name,
                'encryption_enabled': encryption_enabled,
                'encryption_algorithm': encryption_algorithm,
                'public_access_blocked': public_access_blocked,
                'security_score': 100 if encryption_enabled and public_access_blocked else 50
            }

        except Exception as e:
            return {
                'status': 'FAIL',
                'bucket_name': bucket_name,
                'error': str(e)
            }

    def validate_dynamodb_encryption(self, table_name: str) -> Dict[str, Any]:
        """Validate DynamoDB table encryption configuration"""
        try:
            response = self.dynamodb_client.describe_table(TableName=table_name)
            table_info = response['Table']

            # Check encryption at rest
            encryption_enabled = 'SSESpecification' in table_info and table_info['SSESpecification']['Status'] == 'ENABLED'

            if encryption_enabled:
                encryption_type = table_info['SSESpecification'].get('SSEType', 'Unknown')
            else:
                encryption_type = None

            return {
                'status': 'PASS',
                'table_name': table_name,
                'encryption_enabled': encryption_enabled,
                'encryption_type': encryption_type,
                'table_status': table_info['TableStatus']
            }

        except Exception as e:
            return {
                'status': 'FAIL',
                'table_name': table_name,
                'error': str(e)
            }

    def validate_lambda_security(self, function_name: str) -> Dict[str, Any]:
        """Validate Lambda function security configuration"""
        try:
            response = self.lambda_client.get_function(FunctionName=function_name)
            function_config = response['Configuration']

            # Check if function has VPC configuration (optional but more secure)
            has_vpc = 'VpcConfig' in function_config and function_config['VpcConfig'].get('VpcId')

            # Check environment variables encryption (KMS)
            env_vars_encrypted = function_config.get('KMSKeyArn') is not None

            # Check execution role
            execution_role = function_config['Role']

            return {
                'status': 'PASS',
                'function_name': function_name,
                'execution_role': execution_role,
                'has_vpc': has_vpc,
                'env_vars_encrypted': env_vars_encrypted,
                'runtime': function_config['Runtime']
            }

        except Exception as e:
            return {
                'status': 'FAIL',
                'function_name': function_name,
                'error': str(e)
            }

    def run_all_security_tests(self) -> Dict[str, List[Dict]]:
        """Run all security validation tests"""
        results = {
            'iam_roles': [],
            'iam_policies': [],
            's3_encryption': [],
            'dynamodb_encryption': [],
            'lambda_security': []
        }

        print("🔐 Running Security and IAM Validation Tests...\n")

        # Test IAM roles
        print("Testing IAM Roles:")
        for role_name in self.expected_roles:
            print(f"  Testing {role_name}...")
            role_result = self.validate_iam_role_exists(role_name)
            results['iam_roles'].append(role_result)

            if role_result['status'] == 'PASS':
                policy_result = self.validate_iam_role_policies(role_name)
                results['iam_policies'].append(policy_result)

        print()

        # Test S3 encryption
        print("Testing S3 Bucket Security:")
        for bucket_name in self.s3_buckets:
            print(f"  Testing {bucket_name}...")
            encryption_result = self.validate_s3_encryption(bucket_name)
            results['s3_encryption'].append(encryption_result)

        print()

        # Test DynamoDB encryption
        print("Testing DynamoDB Table Security:")
        for table_name in self.dynamodb_tables:
            print(f"  Testing {table_name}...")
            encryption_result = self.validate_dynamodb_encryption(table_name)
            results['dynamodb_encryption'].append(encryption_result)

        print()

        # Test Lambda security
        print("Testing Lambda Function Security:")
        for function_name in self.lambda_functions:
            print(f"  Testing {function_name}...")
            security_result = self.validate_lambda_security(function_name)
            results['lambda_security'].append(security_result)

        print()
        return results

    def calculate_security_score(self, results: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Calculate overall security score"""
        total_checks = 0
        passed_checks = 0
        security_issues = []

        for test_type, test_results in results.items():
            for result in test_results:
                total_checks += 1
                if result['status'] == 'PASS':
                    passed_checks += 1

                    # Additional security score analysis
                    if test_type == 's3_encryption':
                        if not result.get('encryption_enabled', False):
                            security_issues.append(f"S3 bucket {result['bucket_name']} lacks encryption")
                        if not result.get('public_access_blocked', False):
                            security_issues.append(f"S3 bucket {result['bucket_name']} may allow public access")

                    elif test_type == 'dynamodb_encryption':
                        if not result.get('encryption_enabled', False):
                            security_issues.append(f"DynamoDB table {result['table_name']} lacks encryption")

                    elif test_type == 'lambda_security':
                        if not result.get('env_vars_encrypted', False):
                            security_issues.append(f"Lambda {result['function_name']} environment variables not encrypted")

                else:
                    security_issues.append(f"{test_type}: {result.get('error', 'Unknown error')}")

        security_score = (passed_checks / total_checks * 100) if total_checks > 0 else 0

        return {
            'total_checks': total_checks,
            'passed_checks': passed_checks,
            'security_score': round(security_score, 1),
            'security_grade': self._get_security_grade(security_score),
            'issues': security_issues
        }

    def _get_security_grade(self, score: float) -> str:
        """Convert security score to letter grade"""
        if score >= 95:
            return 'A+'
        elif score >= 90:
            return 'A'
        elif score >= 85:
            return 'B+'
        elif score >= 80:
            return 'B'
        elif score >= 75:
            return 'C+'
        elif score >= 70:
            return 'C'
        else:
            return 'D'

    def print_security_summary(self, results: Dict[str, List[Dict]], security_score: Dict[str, Any]):
        """Print formatted security test results"""
        print("="*60)
        print("🔐 SECURITY VALIDATION TEST SUMMARY")
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
                resource_name = result.get('role_name', result.get('bucket_name',
                                         result.get('table_name', result.get('function_name', 'Unknown'))))
                print(f"{status_emoji} {resource_name}: {result.get('error', 'OK')}")

            print(f"\nResults: {passed}/{total} passed")

        # Overall security score
        print(f"\n🎯 SECURITY SCORE: {security_score['security_score']}% (Grade: {security_score['security_grade']})")
        print(f"📊 Overall: {security_score['passed_checks']}/{security_score['total_checks']} checks passed")

        if security_score['issues']:
            print(f"\n⚠️ SECURITY ISSUES DETECTED:")
            for issue in security_score['issues'][:5]:  # Show first 5 issues
                print(f"   • {issue}")
            if len(security_score['issues']) > 5:
                print(f"   • ... and {len(security_score['issues']) - 5} more issues")

        print("="*60)

def main():
    """Run security validation tests"""
    validator = SecurityValidator()
    results = validator.run_all_security_tests()
    security_score = validator.calculate_security_score(results)
    validator.print_security_summary(results, security_score)

    return results, security_score

if __name__ == "__main__":
    main()