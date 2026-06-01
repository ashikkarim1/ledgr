#!/usr/bin/env python3

"""
Deployment Validation Script
Validates critical functionality after deployment
Usage: python3 validate-deployment.py <environment_url> [--auth-token TOKEN]
Example: python3 validate-deployment.py http://localhost:8000 --auth-token jwt_token_here
"""

import sys
import json
import time
import requests
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum

# Color codes for terminal output
class Colors:
    RESET = '\033[0m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    HEADER = '\033[95m'
    CYAN = '\033[96m'

class TestResult(Enum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    WARNING = "WARNING"

@dataclass
class TestCase:
    name: str
    url: str
    method: str = "GET"
    headers: Dict = None
    data: Dict = None
    expected_status: int = 200
    expected_fields: List[str] = None
    timeout: int = 10
    description: str = ""

class DeploymentValidator:
    def __init__(self, base_url: str, auth_token: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.auth_token = auth_token
        self.results: List[Tuple[str, TestResult, str]] = []
        self.session = requests.Session()
        if auth_token:
            self.session.headers.update({"Authorization": f"Bearer {auth_token}"})
        self.session.headers.update({"User-Agent": "DeploymentValidator/1.0"})
        
    def log_result(self, test_name: str, result: TestResult, message: str):
        """Log test result"""
        self.results.append((test_name, result, message))
        
        # Color-coded output
        if result == TestResult.PASSED:
            symbol = f"{Colors.GREEN}✓{Colors.RESET}"
        elif result == TestResult.FAILED:
            symbol = f"{Colors.RED}✗{Colors.RESET}"
        elif result == TestResult.WARNING:
            symbol = f"{Colors.YELLOW}!{Colors.RESET}"
        else:  # SKIPPED
            symbol = f"{Colors.CYAN}○{Colors.RESET}"
        
        print(f"{symbol} {test_name}: {message}")
    
    def make_request(self, test_case: TestCase) -> Tuple[Optional[requests.Response], Optional[str]]:
        """Make HTTP request with error handling"""
        try:
            url = f"{self.base_url}{test_case.url}"
            headers = test_case.headers or {}
            
            # Add auth header if token provided and not already in headers
            if self.auth_token and "Authorization" not in headers:
                headers["Authorization"] = f"Bearer {self.auth_token}"
            
            if test_case.method == "GET":
                response = self.session.get(url, headers=headers, timeout=test_case.timeout)
            elif test_case.method == "POST":
                response = self.session.post(url, headers=headers, json=test_case.data, timeout=test_case.timeout)
            elif test_case.method == "PUT":
                response = self.session.put(url, headers=headers, json=test_case.data, timeout=test_case.timeout)
            elif test_case.method == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=test_case.timeout)
            else:
                return None, f"Unsupported HTTP method: {test_case.method}"
            
            return response, None
        except requests.exceptions.Timeout:
            return None, "Request timeout"
        except requests.exceptions.ConnectionError:
            return None, "Connection refused"
        except Exception as e:
            return None, f"Request failed: {str(e)}"
    
    def validate_response(self, test_case: TestCase, response: requests.Response) -> Tuple[TestResult, str]:
        """Validate HTTP response"""
        # Check status code
        if response.status_code != test_case.expected_status:
            return TestResult.FAILED, f"Expected status {test_case.expected_status}, got {response.status_code}"
        
        # Check response fields
        if test_case.expected_fields:
            try:
                data = response.json()
                missing_fields = [field for field in test_case.expected_fields if field not in data]
                if missing_fields:
                    return TestResult.FAILED, f"Missing fields: {', '.join(missing_fields)}"
            except json.JSONDecodeError:
                return TestResult.WARNING, "Response is not valid JSON"
        
        return TestResult.PASSED, "OK"
    
    def test_health_endpoint(self):
        """Test health endpoint"""
        test = TestCase(
            name="Health Endpoint",
            url="/api/health",
            method="GET",
            expected_status=200,
            expected_fields=["status"],
            description="Verify API is healthy and responding"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.FAILED, error)
            return
        
        result, message = self.validate_response(test, response)
        self.log_result(test.name, result, message)
    
    def test_root_page(self):
        """Test root page loads"""
        test = TestCase(
            name="Root Page Load",
            url="/",
            method="GET",
            expected_status=200,
            description="Verify root page loads successfully"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.FAILED, error)
            return
        
        if response.status_code == 200:
            if len(response.content) > 100:  # Ensure we got HTML content
                self.log_result(test.name, TestResult.PASSED, "Root page loaded")
            else:
                self.log_result(test.name, TestResult.FAILED, "Response too small (likely error page)")
        else:
            self.log_result(test.name, TestResult.FAILED, f"HTTP {response.status_code}")
    
    def test_api_authentication(self):
        """Test authentication endpoint"""
        test = TestCase(
            name="Authentication Status",
            url="/api/auth/status",
            method="POST",
            headers={"Content-Type": "application/json"},
            description="Verify authentication endpoint responds"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.FAILED, error)
            return
        
        if response.status_code in [200, 401]:  # 200 for authenticated, 401 for unauthenticated
            self.log_result(test.name, TestResult.PASSED, f"Responded with HTTP {response.status_code}")
        else:
            self.log_result(test.name, TestResult.FAILED, f"Unexpected status: {response.status_code}")
    
    def test_database_connectivity(self):
        """Test database connectivity via API"""
        if not self.auth_token:
            self.log_result("Database Connectivity", TestResult.SKIPPED, "Auth token required")
            return
        
        test = TestCase(
            name="Database Connectivity",
            url="/api/accounts",
            method="GET",
            expected_status=200,
            description="Verify database is accessible"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.FAILED, error)
            return
        
        if response.status_code == 200:
            try:
                data = response.json()
                self.log_result(test.name, TestResult.PASSED, "Database query successful")
            except json.JSONDecodeError:
                self.log_result(test.name, TestResult.FAILED, "Invalid JSON response")
        elif response.status_code == 401:
            self.log_result(test.name, TestResult.SKIPPED, "Authentication required")
        else:
            self.log_result(test.name, TestResult.FAILED, f"HTTP {response.status_code}")
    
    def test_response_time(self):
        """Test response time performance"""
        test = TestCase(
            name="Response Time (p95)",
            url="/api/health",
            method="GET",
            description="Measure API response time"
        )
        
        times = []
        iterations = 5
        
        for _ in range(iterations):
            start = time.time()
            response, error = self.make_request(test)
            elapsed = (time.time() - start) * 1000  # Convert to ms
            
            if response and response.status_code == 200:
                times.append(elapsed)
            time.sleep(0.1)  # Small delay between requests
        
        if times:
            avg_time = sum(times) / len(times)
            max_time = max(times)
            
            if max_time < 1000:  # < 1 second
                result = TestResult.PASSED
            else:
                result = TestResult.WARNING
            
            self.log_result(test.name, result, f"Avg: {avg_time:.0f}ms, Max: {max_time:.0f}ms")
        else:
            self.log_result(test.name, TestResult.FAILED, "Could not measure response time")
    
    def test_cors_headers(self):
        """Test CORS headers"""
        test = TestCase(
            name="CORS Headers",
            url="/api/health",
            method="GET",
            description="Verify CORS headers are present"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.WARNING, error)
            return
        
        cors_headers = ["access-control-allow-origin", "access-control-allow-methods"]
        found_headers = [h for h in cors_headers if h in response.headers]
        
        if found_headers:
            self.log_result(test.name, TestResult.PASSED, f"Found {len(found_headers)} CORS headers")
        else:
            self.log_result(test.name, TestResult.WARNING, "CORS headers not detected")
    
    def test_security_headers(self):
        """Test security headers"""
        test = TestCase(
            name="Security Headers",
            url="/",
            method="GET",
            description="Verify security headers are present"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.WARNING, error)
            return
        
        security_headers = {
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "x-xss-protection": "1; mode=block"
        }
        
        found = 0
        for header, expected_value in security_headers.items():
            if header in response.headers:
                found += 1
        
        if found >= 2:
            self.log_result(test.name, TestResult.PASSED, f"{found}/{len(security_headers)} headers present")
        else:
            self.log_result(test.name, TestResult.WARNING, f"Only {found} security headers found")
    
    def test_error_handling(self):
        """Test 404 error handling"""
        test = TestCase(
            name="Error Handling (404)",
            url="/nonexistent-endpoint",
            method="GET",
            expected_status=404,
            description="Verify 404 errors are handled correctly"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.FAILED, error)
            return
        
        if response.status_code == 404:
            self.log_result(test.name, TestResult.PASSED, "404 returned for nonexistent endpoint")
        else:
            self.log_result(test.name, TestResult.WARNING, f"Got HTTP {response.status_code} instead of 404")
    
    def test_waitlist_form(self):
        """Test waitlist form submission"""
        test_email = f"test-{int(time.time())}@example.com"
        test = TestCase(
            name="Waitlist Form Submission",
            url="/api/waitlist",
            method="POST",
            data={"email": test_email, "company": "Test Company"},
            expected_status=200,
            description="Verify form submission works"
        )
        
        response, error = self.make_request(test)
        if error:
            self.log_result(test.name, TestResult.FAILED, error)
            return
        
        if response.status_code in [200, 201]:
            self.log_result(test.name, TestResult.PASSED, f"Form submitted (HTTP {response.status_code})")
        else:
            self.log_result(test.name, TestResult.FAILED, f"HTTP {response.status_code}")
    
    def run_all_tests(self):
        """Run all validation tests"""
        print(f"\n{Colors.HEADER}{'='*70}{Colors.RESET}")
        print(f"{Colors.HEADER}Deployment Validation Report{Colors.RESET}")
        print(f"{Colors.HEADER}Target: {self.base_url}{Colors.RESET}")
        print(f"{Colors.HEADER}Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{Colors.RESET}")
        print(f"{Colors.HEADER}{'='*70}{Colors.RESET}\n")
        
        # Run tests
        self.test_health_endpoint()
        self.test_root_page()
        self.test_api_authentication()
        self.test_database_connectivity()
        self.test_response_time()
        self.test_cors_headers()
        self.test_security_headers()
        self.test_error_handling()
        self.test_waitlist_form()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        passed = sum(1 for _, result, _ in self.results if result == TestResult.PASSED)
        failed = sum(1 for _, result, _ in self.results if result == TestResult.FAILED)
        warned = sum(1 for _, result, _ in self.results if result == TestResult.WARNING)
        skipped = sum(1 for _, result, _ in self.results if result == TestResult.SKIPPED)
        total = len(self.results)
        
        print(f"\n{Colors.HEADER}{'='*70}{Colors.RESET}")
        print(f"{Colors.HEADER}Summary{Colors.RESET}")
        print(f"{Colors.HEADER}{'='*70}{Colors.RESET}")
        print(f"{Colors.GREEN}Passed:  {passed}/{total}{Colors.RESET}")
        print(f"{Colors.RED}Failed:  {failed}/{total}{Colors.RESET}")
        print(f"{Colors.YELLOW}Warned:  {warned}/{total}{Colors.RESET}")
        print(f"{Colors.CYAN}Skipped: {skipped}/{total}{Colors.RESET}")
        
        success_rate = (passed / total * 100) if total > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%\n")
        
        if failed == 0:
            print(f"{Colors.GREEN}✓ All critical tests passed!{Colors.RESET}\n")
            return 0
        else:
            print(f"{Colors.RED}✗ Some tests failed. Review above.{Colors.RESET}\n")
            return 1

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python3 validate-deployment.py <base_url> [--auth-token TOKEN]")
        print("Example: python3 validate-deployment.py http://localhost:8000")
        sys.exit(1)
    
    base_url = sys.argv[1]
    auth_token = None
    
    # Parse optional auth token
    if "--auth-token" in sys.argv:
        try:
            token_index = sys.argv.index("--auth-token")
            auth_token = sys.argv[token_index + 1]
        except IndexError:
            print("Error: --auth-token requires a value")
            sys.exit(1)
    
    # Run validation
    validator = DeploymentValidator(base_url, auth_token)
    validator.run_all_tests()
    exit_code = validator.print_summary()
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
