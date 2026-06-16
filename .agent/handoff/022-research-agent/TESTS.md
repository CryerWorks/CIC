# TESTS: AI Research Agent

## Test Plan

### Unit: WebSearchProvider
- `FakeSearchProvider` returns mock results
- `SearXNGAdapter` builds correct URL from config (integration-skip)
- `ManualAdapter` returns user-provided URLs

### Unit: ResearchEngine
- `execute` progresses through phases: searching → fetching → profiling → blueprinting → assembling → done
- `execute` with fake search provider returns structured results
- `execute` with empty goal throws validation error
- `execute` yields progress events

### Unit: Migration
- `m0013_research.sql` creates both tables with correct schema
- `m0013_research.sql` creates required indexes

### Unit: DB Repositories
- `createResearchSource` stores and retrieves correctly
- `saveLearningProfile` creates new profile
- `getResearchSourcesByVault` returns vault-scoped results
- `getLearningProfilesByVault` returns vault-scoped results

### Component: ResearchGoalDialog
- Renders topic input field
- Submit button disabled when topic empty
- Calls onSubmit with ResearchGoal on submit

### Component: LearningProfileForm
- Renders level selector, knowledge textarea, time budget, depth goal
- Submit button disabled when required fields empty
- Calls onSubmit with LearningProfile on submit

### Component: ResearchProgress
- Shows current phase label
- Shows progress bar or spinner for active phases
- Shows completion state

### Component: CampaignReview
- Displays course list
- Materialize button triggers callback
- Back button triggers callback

### Integration: Route wiring
- /research route renders ResearchRoute
- QuickActions has "Research a Topic" link
