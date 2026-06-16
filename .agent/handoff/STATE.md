# Task State

- **Task ID**: `{{task-id}}`
- **State**: `waiting`
- **Started**: 
- **Completed**: 

## State Transitions
- `waiting` → `in_progress` (when local implementer starts)
- `in_progress` → `review` (when local implementer finishes)
- `review` → `approved` (when remote reviewer signs off)
- `review` → `rejected` (when revision requested)
- `rejected` → `waiting` (when revision ready for re-implementation)
