# QUALITY GATES: AI Research Agent

## Gates (ALL must pass before submitting IMPL_REPORT.md)

### G1: Unit Tests
```bash
npx vitest run src/ai/features/research/ --reporter=verbose
npx vitest run src/db/ --reporter=verbose --reporter=verbose 2>&1 | head -50
npx vitest run src/features/research/ --reporter=verbose
```
- All test files pass with 0 failures

### G2: Linter
```bash
npx eslint src/ai/features/research/ src/ai/prompts/research.ts src/db/migrations/m0013_research.ts src/db/models/research.ts src/db/repositories/research.ts src/features/research/
```
- 0 lint errors, 0 lint warnings

### G3: TypeScript
```bash
npx tsc --noEmit
```
- 0 type errors

### G4: No Debug Artifacts
- No `console.log` in production code
- No `debugger` statements
- No TODO/FIXME/HACK left in production code

### G5: All Public APIs Have Explicit Type Signatures
- Every exported function has typed parameters and return type
- Every exported interface has JSDoc
- Every exported class has JSDoc

### G6: No New npm Dependencies
- Only use existing dependencies from package.json
- No new packages installed
