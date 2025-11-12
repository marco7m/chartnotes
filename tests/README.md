# Testing Guide - Chart Notes

This guide explains how to use the unit tests for the Chart Notes project.

## 📋 Prerequisites

Tests use **Vitest**, a modern and fast testing framework for TypeScript/JavaScript.

## 🚀 How to Run Tests

### Install dependencies (if not already installed)
```bash
npm install
```

### Run all tests once
```bash
npm test
```

### Run tests in watch mode (recommended during development)
```bash
npm run test:watch
```
This runs tests automatically whenever you save a file.

### Run tests with coverage
```bash
npm run test:coverage
```
This generates a report showing which parts of the code are covered by tests.

## 📁 Test Structure

Tests are organized in files in the `tests/` folder:

- `utils.test.ts` - Tests for utility functions (parseDateLike, etc.)
- `query.test.ts` - Tests for query and aggregation functions
- `stacking.test.ts` - Tests for stacking logic (stacked area)
- `date-normalization.test.ts` - Tests for date normalization
- `aggregation.test.ts` - Tests for aggregation functions (sum, avg, min, max, count)
- `where-clause.test.ts` - Tests for WHERE clause parsing and evaluation
- `date-bucketing.test.ts` - Tests for date bucketing (day/week/month/quarter/year)
- `rolling-average.test.ts` - Tests for rolling average
- `date-utilities.test.ts` - Tests for date utilities (toDate, resolveRelativeDate, etc.)
- `gantt-date-logic.test.ts` - Tests for Gantt date logic
- `multi-value-x.test.ts` - Tests for multi-value handling (pie charts, tags)

## ✍️ How to Write New Tests

### Basic Structure

```typescript
import { describe, it, expect } from "vitest";

describe("functionName", () => {
  it("should do something specific", () => {
    // Arrange (prepare)
    const input = "test value";
    
    // Act (execute)
    const result = myFunction(input);
    
    // Assert (verify)
    expect(result).toBe("expected result");
  });
});
```

### Assertion Examples

```typescript
// Equality
expect(result).toBe(5);
expect(result).toEqual({ a: 1, b: 2 });

// Boolean values
expect(result).toBe(true);
expect(result).toBeTruthy();
expect(result).toBeFalsy();

// Null/undefined
expect(result).toBeNull();
expect(result).toBeUndefined();
expect(result).toBeDefined();

// Numbers
expect(result).toBeGreaterThan(10);
expect(result).toBeLessThan(20);
expect(result).toBeCloseTo(3.14, 2); // for floats

// Strings
expect(result).toContain("substring");
expect(result).toMatch(/regex/);

// Arrays
expect(array).toHaveLength(3);
expect(array).toContain("item");

// Exceptions
expect(() => functionThatThrows()).toThrow();
expect(() => functionThatThrows()).toThrow("error message");
```

### Testing Private Functions

If a function is private (not exported), you have two options:

1. **Extract the function to a utilities file** and export it
2. **Copy the function in the test file** (as we did with `parseDateLike`)

### Testing with Dates

```typescript
it("should compare dates correctly", () => {
  const date1 = new Date("2024-01-15");
  const date2 = new Date("2024-01-20");
  
  expect(date1.getTime()).toBeLessThan(date2.getTime());
});
```

### Testing with Mocks (when needed)

```typescript
import { vi } from "vitest";

it("should call external function", () => {
  const mockFn = vi.fn();
  myFunction(mockFn);
  expect(mockFn).toHaveBeenCalled();
});
```

## 🎯 Best Practices

1. **One test, one thing**: Each test should verify a specific functionality
2. **Descriptive names**: Use names that describe what the test verifies
3. **Arrange-Act-Assert**: Organize your tests in this order
4. **Test edge cases**: Zero values, null, undefined, empty strings
5. **Test error cases**: What happens when input is invalid?

## 📊 Understanding Coverage

When you run `npm run test:coverage`, Vitest generates a report showing:

- **Statements**: How many lines of code were executed
- **Branches**: How many conditional paths were tested
- **Functions**: How many functions were called
- **Lines**: How many lines were executed

The goal is to have high coverage, but **100% is not always necessary**. Focus on testing:
- Critical functions (business logic)
- Complex functions (many conditions)
- Functions that are easy to break

## 🔍 Debugging Tests

If a test fails, Vitest shows:
- Which test failed
- Expected value vs. received value
- The line where the error occurred

To debug, you can use `console.log` inside tests:

```typescript
it("should do something", () => {
  const result = myFunction(input);
  console.log("Result:", result); // Appears in terminal
  expect(result).toBe(expected);
});
```

## 📚 Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [TypeScript Testing Guide](https://vitest.dev/guide/typescript.html)
- [Vitest Matchers](https://vitest.dev/api/expect.html)

## ❓ Questions?

If you have questions about how to test something specific, consult the Vitest documentation or ask in a GitHub issue!
