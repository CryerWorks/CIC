# SPEC: AI Research Agent (F11)

## Overview
The AI Research Agent is CIC's flagship feature. Users tell CIC what they want to learn, and it:
1. Searches the web for learning materials
2. Fetches and evaluates sources
3. Calibrates to the user's learning profile
4. Generates structured Course Blueprints
5. Assembles a Campaign of courses
6. Materializes the campaign into the vault + SQLite

## User Stories

**US1: Research a Topic**
> As a learner, I want to type a topic I want to learn and have CIC search the web, find relevant materials, and propose a structured learning campaign.

**US2: Learning Profile**
> As a learner, I want to self-assess my current level and learning preferences so the generated courses are calibrated to me.

**US3: Privacy Consent**
> As a learner, I want to explicitly consent before my vault content or queries are sent to any web search or AI service.

**US4: Human-in-the-Loop**
> As a learner, I want to review the generated campaign before it is materialized — the AI never auto-commits.

**US5: Manual URL Input**
> As a learner without a SearXNG instance, I want to paste URLs manually and have CIC fetch and evaluate them.

## Non-Goals (v1)
- YouTube transcript extraction (v1.1)
- Automatic web page readability extraction (v1.1)
- SearXNG auto-discovery or cloud-hosted search
- Multi-campaign orchestration
- Card back generation (scaffold-only)

## Architecture

```
User Input → ResearchGoalDialog
                  ↓
           ResearchAgent.engine()
                  ↓
    ┌──────────┬──┴──┬──────────┐
    ↓          ↓     ↓          ↓
  Search    Fetch  Profile  Blueprint
    │          │     │          │
    ↓          ↓     ↓          ↓
  SearXNG   Manual   DB     router.chat()
  /Manual   URLs     Store   (scaffolding)
```

## Key Interfaces

```typescript
interface WebSearchProvider {
  search(query: string, count?: number): Promise<WebSearchResult[]>;
}

interface ResearchAgent {
  execute(goal: ResearchGoal): AsyncIterable<ResearchEvent>;
  getResult(): ResearchResult | null;
}
```

## Data Model

```sql
research_sources(id, vault_id, url, title, source_type, quality_score, 
                 ingested_as_resource_id, fetched_at)
learning_profiles(id, vault_id, domain, declared_level, knowledge_text, 
                  time_budget, depth_goal, created_at)
```
