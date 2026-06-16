# Test Specifications: {{feature-name}}

## Unit Tests
{{#each unit-tests}}
- **Scenario**: {{description}}
- **Input**: {{input}}
- **Expected**: {{expected}}
- **File**: {{file-path}}
{{/each}}

## Integration Tests
{{#each integration-tests}}
- **Scenario**: {{description}}
- **Components**: {{components}}
- **Expected**: {{expected}}
- **File**: {{file-path}}
{{/each}}

## E2E Tests
{{#each e2e-tests}}
- **Scenario**: {{description}}
- **Steps**: {{steps}}
- **Expected**: {{expected}}
{{/each}}

## Test Command
```bash
{{test-command}}
```
