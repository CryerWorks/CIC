# QUALITY GATES: 020-course-generator

- [ ] All tests pass
- [ ] ESLint 0 errors
- [ ] tsc --noEmit 0 errors
- [ ] No new npm deps, no Rust changes
- [ ] All AI via router.chat('scaffolding') with containsVaultContent: true
- [ ] Scaffold only — cards have fronts, no backs
- [ ] Materialize never auto-commits — requires explicit approval
- [ ] VaultWriter for all vault writes
