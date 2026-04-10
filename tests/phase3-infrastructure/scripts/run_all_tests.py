#!/usr/bin/env python3
"""
Phase 3 Infrastructure Test Runner
Executes all component and integration tests for the PDF Conversation System
"""

import sys
import os
import json
import time
from datetime import datetime
from typing import Dict, Any

# Add test directories to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'component-tests'))
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'integration-tests'))

try:
    from lambda_function_validator import LambdaFunctionValidator
    from storage_validator import StorageValidator
    from end_to_end_validator import EndToEndValidator
except ImportError as e:
    print(f"❌ Failed to import test modules: {e}")
    print("Please ensure all test files are in the correct directories.")
    sys.exit(1)

class Phase3TestRunner:
    def __init__(self):
        self.results = {
            'test_run_info': {
                'start_time': datetime.now().isoformat(),
                'region': 'us-west-2',
                'account_id': '874962954560'
            },
            'lambda_tests': {},
            'storage_tests': {},
            'integration_tests': {},
            'summary': {}
        }

    def run_lambda_tests(self) -> bool:
        """Run Lambda function component tests"""
        print("🚀 PHASE 3.1: Lambda Function Tests")
        print("="*60)

        try:
            validator = LambdaFunctionValidator()
            results = validator.run_all_tests()
            validator.print_test_summary(results)

            self.results['lambda_tests'] = results

            # Calculate success rate
            all_lambda_results = []
            for test_results in results.values():
                all_lambda_results.extend(test_results)

            passed = sum(1 for r in all_lambda_results if r['status'] == 'PASS')
            total = len(all_lambda_results)

            return passed == total

        except Exception as e:
            print(f"❌ Lambda tests failed with error: {e}")
            self.results['lambda_tests']['error'] = str(e)
            return False

    def run_storage_tests(self) -> bool:
        """Run storage component tests"""
        print("\n💾 PHASE 3.2: Storage Component Tests")
        print("="*60)

        try:
            validator = StorageValidator()
            results = validator.run_all_tests()
            validator.print_test_summary(results)

            self.results['storage_tests'] = results

            # Calculate success rate
            all_storage_results = []
            for test_results in results.values():
                all_storage_results.extend(test_results)

            passed = sum(1 for r in all_storage_results if r['status'] == 'PASS')
            total = len(all_storage_results)

            return passed == total

        except Exception as e:
            print(f"❌ Storage tests failed with error: {e}")
            self.results['storage_tests']['error'] = str(e)
            return False

    def run_integration_tests(self) -> bool:
        """Run end-to-end integration tests"""
        print("\n🔄 PHASE 3.3: End-to-End Integration Tests")
        print("="*60)

        try:
            validator = EndToEndValidator()
            results = validator.run_end_to_end_test()
            validator.print_test_summary(results)

            self.results['integration_tests'] = results

            # Calculate success rate for integration tests
            test_steps = ['document_ingestion', 'processing_bucket_check', 'metadata_table_check', 'query_processing']
            passed = sum(1 for step in test_steps if results.get(step, {}).get('status') == 'PASS')
            total = len(test_steps)

            return passed == total

        except Exception as e:
            print(f"❌ Integration tests failed with error: {e}")
            self.results['integration_tests']['error'] = str(e)
            return False

    def generate_summary(self, lambda_success: bool, storage_success: bool, integration_success: bool):
        """Generate overall test summary"""
        self.results['test_run_info']['end_time'] = datetime.now().isoformat()

        # Calculate overall statistics
        total_test_categories = 3
        passed_categories = sum([lambda_success, storage_success, integration_success])

        self.results['summary'] = {
            'lambda_tests_passed': lambda_success,
            'storage_tests_passed': storage_success,
            'integration_tests_passed': integration_success,
            'overall_success': passed_categories == total_test_categories,
            'categories_passed': f"{passed_categories}/{total_test_categories}",
            'infrastructure_status': 'HEALTHY' if passed_categories == total_test_categories else 'ISSUES_DETECTED'
        }

    def print_final_summary(self):
        """Print final test run summary"""
        print("\n" + "="*80)
        print("🧪 PHASE 3 INFRASTRUCTURE TESTING - FINAL SUMMARY")
        print("="*80)

        summary = self.results['summary']

        # Test category results
        categories = [
            ('Lambda Functions', 'lambda_tests_passed'),
            ('Storage Components', 'storage_tests_passed'),
            ('End-to-End Integration', 'integration_tests_passed')
        ]

        for category_name, key in categories:
            status_emoji = "✅" if summary[key] else "❌"
            print(f"{status_emoji} {category_name}")

        # Overall status
        overall_emoji = "🎉" if summary['overall_success'] else "⚠️"
        status_text = summary['infrastructure_status']

        print(f"\n{overall_emoji} INFRASTRUCTURE STATUS: {status_text}")
        print(f"📊 Categories Passed: {summary['categories_passed']}")

        if summary['overall_success']:
            print("\n🎯 All infrastructure components are functioning correctly!")
            print("🚀 Ready to proceed with Phase 4 development work.")
        else:
            print("\n🔧 Some infrastructure components need attention.")
            print("📋 Review failed tests above for specific issues to address.")

        # Timing information
        start_time = datetime.fromisoformat(self.results['test_run_info']['start_time'])
        end_time = datetime.fromisoformat(self.results['test_run_info']['end_time'])
        duration = (end_time - start_time).total_seconds()

        print(f"\n⏱️ Test Duration: {duration:.1f} seconds")
        print("="*80)

    def save_results(self, filename: str = None):
        """Save test results to JSON file"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"phase3_test_results_{timestamp}.json"

        filepath = os.path.join(os.path.dirname(__file__), '..', 'test-results', filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        try:
            with open(filepath, 'w') as f:
                json.dump(self.results, f, indent=2, default=str)

            print(f"📁 Test results saved to: {filepath}")
        except Exception as e:
            print(f"⚠️ Failed to save test results: {e}")

    def run_all_tests(self):
        """Execute complete Phase 3 testing suite"""
        print("🧪 STARTING PHASE 3 INFRASTRUCTURE TESTING")
        print("="*80)
        print(f"🕐 Start Time: {self.results['test_run_info']['start_time']}")
        print(f"🌍 Region: {self.results['test_run_info']['region']}")
        print(f"🏗️ Account: {self.results['test_run_info']['account_id']}")
        print()

        # Run test phases
        lambda_success = self.run_lambda_tests()

        # Add delay between test phases
        time.sleep(2)

        storage_success = self.run_storage_tests()

        time.sleep(2)

        integration_success = self.run_integration_tests()

        # Generate and display summary
        self.generate_summary(lambda_success, storage_success, integration_success)
        self.print_final_summary()

        # Save results
        self.save_results()

        return self.results['summary']['overall_success']

def main():
    """Main test runner entry point"""
    runner = Phase3TestRunner()
    success = runner.run_all_tests()

    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()