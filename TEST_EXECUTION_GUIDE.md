# Test Execution Guide

## Quick Start

### Run All Tests
```bash
npm test
```

### Run Specific Test Types
```bash
npm run test:unit          # Unit tests only
npm run test:smoke         # Smoke tests only  
npm run test:performance   # Performance tests only
npm run test:acceptance    # Acceptance tests only
npm run test:e2e           # E2E tests (Playwright)
npm run test:e2e:ui         # E2E tests with interactive UI
```

### Run with Coverage
```bash
npm run test:coverage
```

## Test Results Summary

### ✅ Completed Test Suites

1. **Unit Tests** (24 tests)
   - Locations Management: 9 tests
   - Work Orders Management: 4 tests
   - Clients Management: 6 tests
   - Quotes Management: 2 tests
   - Invoices Management: 1 test

2. **Smoke Tests** (20 tests)
   - All Admin Portal pages
   - All Client Portal pages
   - All Subcontractor Portal pages
   - Authentication pages
   - UI Components

3. **Performance Tests** (8 tests)
   - Rendering performance benchmarks
   - Memory leak detection
   - Query optimization checks

4. **Acceptance Tests** (3 tests)
   - Complete user registration flows
   - Work order to payment flows
   - Subcontractor workflows

5. **E2E Tests** (Playwright)
   - Authentication flows
   - Navigation tests
   - Form validation

## Component Fixes Applied

### Critical Bug Fixes

1. **Quotes Page** - Added null checks for all `toLocaleString()` calls
2. **Work Orders Page** - Added null check for `priority.toUpperCase()`
3. **Test Infrastructure** - Fixed toast mocking, selectors, async handling

## Test Coverage

- **Components**: All major pages tested
- **User Flows**: Complete registration → approval → usage flows
- **Edge Cases**: Form validation, error handling, null checks
- **Performance**: Rendering speed, memory management

## Next Steps

1. Continue adding edge case tests
2. Improve E2E test authentication setup
3. Add visual regression tests
4. Add accessibility (a11y) tests
5. Set up CI/CD test automation

## Notes

- Some tests may require Firebase emulator for full E2E testing
- E2E tests require dev server running (`npm run dev`)
- Performance tests include structural checks and runtime measurements

