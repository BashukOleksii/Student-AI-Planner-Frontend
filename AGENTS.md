# Frontend Agent Instructions

## Project

This repository contains the frontend for:

"Student Personal Learning Planning Service with an AI Agent".

The complete system consists of two independent applications:

- Backend: Laravel + PHP + MySQL
- Frontend: Vue 3 + TypeScript + Vite

This repository contains only the frontend.

The frontend communicates with the Laravel backend through a REST API.

## Product goal

The application helps a student:

- view and manage their schedule;
- manage study tasks and subtasks;
- work with deadlines and priorities;
- view available study time;
- work with automatically generated study plans;
- manage reminders;
- view statistics and progress;
- communicate with an AI agent using natural language.

The AI chat is not only a conversational interface.

The agent may cause real changes in the system through backend tools,
such as creating tasks, creating study sessions, updating plans,
or creating reminders.

The frontend must clearly communicate the result of such actions to the user.

## Technology

Use the technology already configured in the repository.

Primary frontend stack:

- Vue 3;
- TypeScript;
- Vite;
- Composition API;
- Vue Router;
- Pinia.

Prefer:

```vue
<script setup lang="ts">
```

Do not use Options API unless the existing codebase provides a specific
reason to do so.

## Architecture

Separate responsibilities between:

- `views` — route-level pages;
- `components` — reusable UI components;
- `stores` — shared Pinia state;
- `api` or `services/api` — HTTP communication;
- `router` — navigation;
- `types` — shared TypeScript domain/API types;
- `composables` — reusable Vue behavior where appropriate.

Do not put API calls directly inside reusable visual components.

Do not place large amounts of application logic inside templates.

Do not duplicate backend business rules on the frontend.

The backend remains authoritative for:

- authorization;
- planning calculations;
- schedule conflict detection;
- free-time calculation;
- deadlines;
- automatic planning;
- statistics;
- user planning constraints.

Frontend validation may improve UX, but backend validation remains authoritative.

## Main frontend areas

The application will eventually contain interfaces for:

- authentication;
- dashboard;
- schedule;
- subjects and teachers;
- tasks and subtasks;
- Excel schedule import;
- free-time visualization;
- study planning;
- reminders;
- AI chat;
- statistics and reports;
- profile;
- planning settings.

## API communication

Keep HTTP communication in a dedicated API layer.

Use TypeScript request and response types where useful.

Handle:

- loading states;
- validation errors;
- authentication errors;
- authorization errors;
- network errors;
- empty states.

Do not hard-code backend URLs inside components.

Use environment configuration.

## State management

Use Pinia for state shared between views or components.

Do not put every local component value into Pinia.

Use local Vue state for component-specific state.

Avoid using a store only to avoid passing a small amount of local state.

## Components

Prefer components with clear, limited responsibilities.

Create reusable components when there is actual reuse or a clear
domain/UI concept.

Avoid premature overly generic abstractions.

Keep presentational concerns separate from API orchestration where practical.

## TypeScript

Avoid `any` unless there is a concrete technical reason.

Use explicit domain and API types where they improve clarity.

Do not duplicate identical type definitions across the project.

Prefer narrowing unknown external data rather than blindly casting it.

## AI chat UI

The AI chat should support more than displaying plain text.

The backend agent may execute actions through tools.

The UI should eventually be capable of clearly representing results such as:

- task created;
- task updated;
- study plan created;
- free slots found;
- reminder created;
- scheduling conflict detected;
- confirmation required.

Do not assume every assistant response is only unstructured text.

Do not implement the entire AI chat workflow unless explicitly requested.

## Destructive actions

UI flows for destructive or large-scale operations should support
explicit confirmation where required by backend behavior.

Examples include:

- bulk deletion;
- replacing imported schedule data;
- deleting multiple planned items;
- major bulk rescheduling.

## Testing

Testing is part of the project.

Depending on the current project setup, relevant tests may include:

- Unit tests for frontend utilities and stores;
- component tests;
- integration tests;
- E2E tests using Playwright.

Do not introduce a new testing framework without checking the current project first.

### E2E testing

Critical end-to-end flows should eventually include:

- registration / login;
- viewing schedule;
- creating a task;
- updating a task;
- interacting with the AI agent;
- executing an AI-driven application action;
- verifying that the resulting change is visible in the UI.

## Verification

For every significant frontend change:

1. run TypeScript type checking;
2. run the production build;
3. run relevant tests if configured;
4. fix failures caused by the requested change.

Do not disable TypeScript checks or tests simply to make a change pass.

## CI/CD compatibility

Frontend code should be compatible with automated CI execution.

Do not rely on:

- developer-specific absolute paths;
- committed secrets;
- undocumented local configuration.

Environment-specific settings must use environment configuration.

The project is expected to eventually support:

- automated build;
- type checking;
- frontend tests;
- Playwright E2E tests;
- code-quality checks;
- Docker/container build where required;
- staging validation.

Do not implement the complete CI/CD pipeline unless explicitly requested.

## Development workflow

Before modifying code:

1. inspect the relevant existing implementation;
2. inspect existing routes, stores, API modules, types and components;
3. follow the conventions already used in the repository;
4. determine whether an existing abstraction can be reused.

When implementing a feature:

1. identify the smallest coherent frontend change;
2. define/update API communication where needed;
3. define/update types;
4. update shared state only when required;
5. implement the view/components;
6. handle loading/error/empty states where relevant;
7. run type checking;
8. run build;
9. run relevant tests;
10. summarize the changes.

Do not implement unrelated features.

Do not redesign the existing frontend architecture without explaining why.

## Source of truth

The current repository is the primary source of truth for implemented code.

Always inspect the repository before making assumptions about its structure
or already implemented functionality.
