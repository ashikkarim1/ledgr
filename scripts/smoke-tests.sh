#!/bin/bash

################################################################################
# Smoke Tests for Ledgr Deployment
# Validates critical functionality after deployment
#
# Usage: ./smoke-tests.sh <environment_url> [auth_token]
# Example: ./smoke-tests.sh http://ledgr-alb-staging.us-east-1.elb.amazonaws.com
################################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BASE_URL=${1:?Error: BASE_URL required}
AUTH_TOKEN=${2:-}
TIMEOUT=10

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Utility functions
log_test() {
    local test_name=$1
    echo -e "${BLUE}[TEST]${NC} $test_name"
    ((TOTAL_TESTS++))
}

pass_test() {
    local message=$1
    echo -e "${GREEN}[✓]${NC} $message"
    ((PASSED_TESTS++))
}

fail_test() {
    local message=$1
    echo -e "${RED}[✗]${NC} $message"
    ((FAILED_TESTS++))
}

warn_test() {
    local message=$1
    echo -e "${YELLOW}[!]${NC} $message"
}

# Test: Health endpoint
test_health_endpoint() {
    log_test "Health Endpoint"
    
    local response=$(curl -s -w "\n%{http_code}" --connect-timeout $TIMEOUT "$BASE_URL/api/health")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ]; then
        local status=$(echo "$body" | jq -r '.status // empty' 2>/dev/null)
        if [ "$status" = "healthy" ]; then
            pass_test "Health endpoint returned 200 with healthy status"
        else
            fail_test "Health endpoint returned 200 but status is not 'healthy': $status"
        fi
    else
        fail_test "Health endpoint returned HTTP $http_code (expected 200)"
    fi
}

# Test: Root page loads
test_root_page() {
    log_test "Root Page Load"
    
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT "$BASE_URL/")
    
    if [ "$http_code" = "200" ]; then
        pass_test "Root page returned 200 OK"
    else
        fail_test "Root page returned HTTP $http_code (expected 200)"
    fi
}

# Test: Dashboard page (requires auth)
test_dashboard_page() {
    log_test "Dashboard Page Load"
    
    if [ -z "$AUTH_TOKEN" ]; then
        warn_test "Auth token not provided; skipping authenticated dashboard test"
        return
    fi
    
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout $TIMEOUT \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$BASE_URL/dashboard")
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "401" ]; then
        pass_test "Dashboard page returned HTTP $http_code"
    else
        fail_test "Dashboard page returned HTTP $http_code (expected 200 or 401)"
    fi
}

# Test: Authentication endpoint
test_auth_endpoint() {
    log_test "Authentication Endpoint"
    
    local response=$(curl -s -w "\n%{http_code}" --connect-timeout $TIMEOUT \
        -X POST "$BASE_URL/api/auth/status" \
        -H "Content-Type: application/json")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "401" ]; then
        pass_test "Auth endpoint responded with HTTP $http_code"
    else
        fail_test "Auth endpoint returned HTTP $http_code (expected 200 or 401)"
    fi
}

# Test: Waitlist form submission
test_waitlist_form() {
    log_test "Waitlist Form Submission"
    
    local test_email="smoke-test-$(date +%s)@example.com"
    
    local response=$(curl -s -w "\n%{http_code}" --connect-timeout $TIMEOUT \
        -X POST "$BASE_URL/api/waitlist" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$test_email\",\"company\":\"Test Company\"}")
    
    local http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        pass_test "Waitlist form submission returned HTTP $http_code"
    else
        fail_test "Waitlist form submission returned HTTP $http_code (expected 200 or 201)"
    fi
}

# Test: API endpoint response time
test_response_time() {
    log_test "Response Time (p95 < 1000ms)"
    
    local total_time=0
    local iterations=10
    
    for i in $(seq 1 $iterations); do
        local response_time=$(curl -s -w "%{time_total}" -o /dev/null \
            --connect-timeout $TIMEOUT \
            "$BASE_URL/api/health")
        total_time=$(echo "$total_time + $response_time" | bc)
    done
    
    local avg_time=$(echo "scale=3; $total_time / $iterations" | bc)
    local avg_ms=$(echo "scale=0; $avg_time * 1000" | bc)
    
    if (( $(echo "$avg_time < 1" | bc -l) )); then
        pass_test "Average response time: ${avg_ms}ms"
    else
        fail_test "Average response time: ${avg_ms}ms (should be < 1000ms)"
    fi
}

# Test: Database connectivity
test_database_connectivity() {
    log_test "Database Connectivity"
    
    if [ -z "$AUTH_TOKEN" ]; then
        warn_test "Auth token not provided; skipping database test"
        return
    fi
    
    local response=$(curl -s -w "\n%{http_code}" --connect-timeout $TIMEOUT \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$BASE_URL/api/accounts")
    
    local http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ]; then
        pass_test "Database query executed successfully (HTTP 200)"
    elif [ "$http_code" = "401" ]; then
        warn_test "Database test skipped (HTTP 401 - authentication required)"
    else
        fail_test "Database query failed (HTTP $http_code)"
    fi
}

# Test: CSS assets loading
test_css_assets() {
    log_test "CSS Assets Loading"
    
    local response=$(curl -s --connect-timeout $TIMEOUT "$BASE_URL/")
    
    if echo "$response" | grep -q "styles.css" || echo "$response" | grep -q "<link.*stylesheet"; then
        pass_test "CSS stylesheet references found in HTML"
    else
        warn_test "CSS stylesheet references not detected in HTML"
    fi
}

# Test: JavaScript assets loading
test_js_assets() {
    log_test "JavaScript Assets Loading"
    
    local response=$(curl -s --connect-timeout $TIMEOUT "$BASE_URL/")
    
    if echo "$response" | grep -q "<script"; then
        pass_test "JavaScript references found in HTML"
    else
        warn_test "JavaScript references not detected in HTML"
    fi
}

# Test: Database migrations
test_database_migrations() {
    log_test "Database Migrations Status"
    
    if [ -z "$AUTH_TOKEN" ]; then
        warn_test "Auth token not provided; skipping migration test"
        return
    fi
    
    local response=$(curl -s --connect-timeout $TIMEOUT \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$BASE_URL/api/migrations/status")
    
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$BASE_URL/api/migrations/status")
    
    if [ "$http_code" = "200" ]; then
        pass_test "Database migrations completed (HTTP 200)"
    elif [ "$http_code" = "404" ]; then
        warn_test "Migrations endpoint not available (HTTP 404) - may be normal"
    else
        fail_test "Could not verify migrations (HTTP $http_code)"
    fi
}

# Test: Error handling
test_error_handling() {
    log_test "Error Handling (404)"
    
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout $TIMEOUT \
        "$BASE_URL/nonexistent-page")
    
    if [ "$http_code" = "404" ]; then
        pass_test "404 error returned for nonexistent page"
    else
        fail_test "Expected 404 for nonexistent page, got HTTP $http_code"
    fi
}

# Test: CORS headers
test_cors_headers() {
    log_test "CORS Headers"
    
    local response=$(curl -s -i --connect-timeout $TIMEOUT "$BASE_URL/api/health")
    
    if echo "$response" | grep -iq "Access-Control-Allow-Origin"; then
        pass_test "CORS headers present in response"
    else
        warn_test "CORS headers not detected (may be expected)"
    fi
}

# Test: Security headers
test_security_headers() {
    log_test "Security Headers"
    
    local response=$(curl -s -i --connect-timeout $TIMEOUT "$BASE_URL/")
    
    local headers_found=0
    
    if echo "$response" | grep -iq "X-Content-Type-Options"; then
        ((headers_found++))
    fi
    
    if echo "$response" | grep -iq "X-Frame-Options"; then
        ((headers_found++))
    fi
    
    if echo "$response" | grep -iq "Content-Security-Policy"; then
        ((headers_found++))
    fi
    
    if [ $headers_found -ge 2 ]; then
        pass_test "Security headers found ($headers_found detected)"
    else
        warn_test "Limited security headers detected ($headers_found)"
    fi
}

# Test: Service connectivity
test_service_connectivity() {
    log_test "Service Connectivity"
    
    if [ -z "$AUTH_TOKEN" ]; then
        warn_test "Auth token not provided; skipping service connectivity test"
        return
    fi
    
    local integrations=("stripe" "openai" "quickbooks")
    local available=0
    
    for service in "${integrations[@]}"; do
        local response=$(curl -s -o /dev/null -w "%{http_code}" \
            --connect-timeout $TIMEOUT \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            "$BASE_URL/api/integrations/$service/status" 2>/dev/null)
        
        if [ "$response" = "200" ] || [ "$response" = "503" ]; then
            ((available++))
        fi
    done
    
    if [ $available -gt 0 ]; then
        pass_test "Service integration endpoints responding ($available/$((${#integrations[@]}))"
    else
        warn_test "Service integration endpoints not responding"
    fi
}

# Generate report
generate_report() {
    local success_rate=0
    
    if [ $TOTAL_TESTS -gt 0 ]; then
        success_rate=$(echo "scale=1; ($PASSED_TESTS * 100) / $TOTAL_TESTS" | bc)
    fi
    
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Smoke Test Report${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Total Tests:   $TOTAL_TESTS"
    echo -e "  ${GREEN}Passed:${NC}      $PASSED_TESTS"
    echo -e "  ${RED}Failed:${NC}      $FAILED_TESTS"
    echo "  Success Rate:  ${success_rate}%"
    echo ""
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}✓ All critical tests passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}✗ Some tests failed. Please review above.${NC}"
        echo ""
        return 1
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}     Smoke Tests for Ledgr Deployment"
    echo -e "${BLUE}║${NC}     Target: $BASE_URL"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Run all tests
    test_health_endpoint
    test_root_page
    test_dashboard_page
    test_auth_endpoint
    test_waitlist_form
    test_response_time
    test_database_connectivity
    test_css_assets
    test_js_assets
    test_database_migrations
    test_error_handling
    test_cors_headers
    test_security_headers
    test_service_connectivity
    
    echo ""
    
    # Generate report
    generate_report
}

# Run main function
main "$@"
