# PowerShell script to test the Organization API

Write-Host "Testing Organization API..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "1. Testing Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get
    Write-Host "✓ Health check successful!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "✗ Health check failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 2: Add Organization with Error
Write-Host "2. Testing Add Organization with Error..." -ForegroundColor Yellow
$body = @{
    name = "Test Company"
    domain = "test.com"
    industry = "Technology"
    employees = "50-100"
    location = "Brussels, Belgium"
    error = "Test error message from PowerShell"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/organization/error" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ Organization added with error status!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "✗ Failed to add organization: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 3: Mark Organization as Success
Write-Host "3. Testing Mark Organization as Success..." -ForegroundColor Yellow
$body = @{
    domain = "test.com"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/organization/success" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ Organization marked as processed!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "✗ Failed to mark as success: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 4: Add Another Organization with Error
Write-Host "4. Testing Add Another Organization..." -ForegroundColor Yellow
$body = @{
    name = "Acme Corporation"
    domain = "acme.com"
    industry = "Manufacturing"
    employees = "1000+"
    location = "New York, USA"
    revenue = "$500M+"
    description = "Leading manufacturing company"
    error = "Failed to find contact email"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/organization/error" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ Second organization added!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "✗ Failed to add second organization: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tests completed!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check the database file at:" -ForegroundColor Yellow
Write-Host "  data/organizations.json" -ForegroundColor White
Write-Host ""