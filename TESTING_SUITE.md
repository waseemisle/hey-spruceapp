# Comprehensive Testing Suite Documentation

## Overview

This document describes the complete testing suite for the GroundOps app, covering all testing types: Unit, Smoke, Performance, Acceptance, and End-to-End (E2E) testing.

## Test Structure

```
__tests__/
├── unit/                    # Unit tests for individual components
│   ├── locations-management.test.tsx
│   ├── work-orders-management.test.tsx
│   ├── clients-management.test.tsx
│   ├── quotes-management.test.tsx
│   └── invoices-management.test.tsx
├── smoke/                   # Smoke tests for critical features
│   └── all-features.test.tsx
├── performance/             # Performance and optimization tests
│   └── performance.test.tsx
├── acceptance/              # Acceptance tests for user flows
│   └── user-flows.test.tsx
├── e2e/                     # End-to-end tests (Playwright)
│   ├── authentication.spec.ts
│   ├── admin-portal.spec.ts
│   └── client-portal.spec.ts
└── integration/             # Integration tests
    └── client-flow.test.tsx
```

## Test Types

### 1. Unit Tests

**Purpose**: Test individual components and functions in isolation.

**Coverage**:
- ✅ Locations Management (CRUD operations, filtering, search)
- ✅ Work Orders Management (approval, rejection, bidding)
- ✅ Clients Management (approval, rejection, search)
- ✅ Quotes Management (display, filtering)
- ✅ Invoices Management (display, generation)

**Run**: `npm run test:unit`

### 2. Smoke Tests

**Purpose**: Verify that all major features can be accessed and basic functionality works.

**Coverage**:
- ✅ All Admin Portal pages load
- ✅ All Client Portal pages load
- ✅ All Subcontractor Portal pages load
- ✅ Authentication pages load
- ✅ UI Components render correctly

**Run**: `npm run test:smoke`

### 3. Performance Tests

**Purpose**: Ensure the application performs well under various conditions.

**Coverage**:
- ✅ Dashboard renders within 100ms
- ✅ Large lists (100+ items) render efficiently
- ✅ Modals open quickly (<50ms)
- ✅ No memory leaks on component unmount
- ✅ Event listeners are cleaned up properly
- ✅ Firestore queries use proper indexes
- ✅ Real-time listeners are used efficiently

**Run**: `npm run test:performance`

### 4. Acceptance Tests

**Purpose**: Validate complete user journeys end-to-end.

**Coverage**:
- ✅ Flow 1: Client Registration → Approval → Location Creation → Work Order
- ✅ Flow 2: Work Order → Bidding → Quote → Invoice → Payment
- ✅ Flow 3: Subcontractor Registration → Approval → Bidding → Assignment

**Run**: `npm run test:acceptance`

### 5. End-to-End Tests (E2E)

**Purpose**: Test the application in a real browser environment.

**Coverage**:
- ✅ Authentication flows
- ✅ Navigation between pages
- ✅ Form validation
- ✅ Theme toggle functionality
- ✅ Admin Portal navigation
- ✅ Client Portal navigation

**Run**: `npm run test:e2e` or `npm run test:e2e:ui` (with UI)

## Running Tests

### Run All Tests
```bash
npm run test:all
```

### Run Specific Test Types
```bash
npm run test:unit          # Unit tests only
npm run test:smoke         # Smoke tests only
npm run test:performance   # Performance tests only
npm run test:acceptance    # Acceptance tests only
npm run test:e2e           # E2E tests only
```

### Run with Coverage
```bash
npm run test:coverage
```

### Run in Watch Mode
```bash
npm run test:watch
```

### Run E2E Tests with UI
```bash
npm run test:e2e:ui
```

## Test Configuration

### Jest Configuration
- **File**: `jest.config.js`
- **Environment**: `jest-environment-jsdom`
- **Setup**: `jest.setup.js` (includes Firebase mocks, Next.js router mocks)

### Playwright Configuration
- **File**: `playwright.config.ts`
- **Browser**: Chromium
- **Base URL**: `http://localhost:3000` (or `PLAYWRIGHT_TEST_BASE_URL` env var)
- **Auto-start dev server**: Yes

## Test Coverage Goals

- **Unit Tests**: 80%+ coverage
- **Smoke Tests**: 100% of critical features
- **E2E Tests**: All major user flows

## Continuous Integration

Tests are configured to run in CI environments:
- Jest tests run with `--ci` flag
- Playwright tests run in headless mode
- Coverage reports are generated

## Known Limitations

1. **E2E Tests**: Require authentication setup for full testing
2. **Performance Tests**: Some tests are structural checks rather than runtime measurements
3. **Firebase Mocks**: All Firebase operations are mocked in unit tests

## Future Enhancements

- [ ] Add visual regression testing
- [ ] Add accessibility testing (a11y)
- [ ] Add API endpoint testing
- [ ] Add load testing for concurrent users
- [ ] Add mobile device testing
- [ ] Add cross-browser testing (Firefox, Safari)

## Test Maintenance

- Update tests when features change
- Add tests for new features
- Review and update mocks when dependencies change
- Keep test data realistic and up-to-date

