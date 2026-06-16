# Quality Gates: {{feature-name}}

## Gate 1: Tests
- **Command**: `{{test-command}}`
- **Expected**: All tests pass (exit 0)

## Gate 2: Lint
- **Command**: `{{lint-command}}`
- **Expected**: No errors (exit 0)

## Gate 3: Type Check
- **Command**: `{{typecheck-command}}`
- **Expected**: No errors (exit 0)

## Gate 4: No Debug Artifacts
- **Pattern**: `{{debug-pattern}}`
- **Expected**: 0 matches in production files

## Gate 5: No Stale TODOs
- **Pattern**: `TODO|FIXME|HACK`
- **Expected**: 0 matches in new/modified files

## Gate 6: Public API Typed
- **Check**: All exported functions have type annotations
- **Expected**: True
