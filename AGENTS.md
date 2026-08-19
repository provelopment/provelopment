# Provelopment AI Agent Instructions

## 1. Mission

Provelopment is an open-source, re-brandable web platform for helping small
businesses establish and maintain a web presence.

The project begins as a frontend-only Next.js application but is deliberately
architected so that backend capabilities can be introduced incrementally.

The repository is also intended to serve as a reusable template. Downstream
businesses should be able to customize branding, content, configuration, and
site behavior while retaining the ability to incorporate improvements from
the upstream Provelopment project.

Agents must preserve this objective.

---

## 2. Before Making Changes

Before modifying code:

1. Read this file.
2. Read `ARCHITECTURE.md`.
3. Inspect the relevant existing implementation.
4. Identify which architectural boundary owns the change.
5. Prefer extending existing capabilities over creating duplicate ones.
6. Determine whether the change affects downstream customization or future
   upstream synchronization.
7. Run the relevant validation commands after making the change.

Do not make architectural changes based only on assumptions.

---

## 3. Architecture

Provelopment follows Hexagonal Architecture / Ports and Adapters principles.

The major application boundaries are:

- `src/app`
- `src/components`
- `src/core`
- `src/application`
- `src/adapters`
- `src/config`
- `content`
- `public`
- `tests`

See `ARCHITECTURE.md` for the authoritative architectural description.

---

## 4. Dependency Direction

The intended dependency direction is:

`core`
↓
`application`
↓
`adapters`

Presentation and framework code compose these capabilities.

Rules:

- `core` must remain framework-independent.
- `core` must not import from `application`.
- `core` must not import from `adapters`.
- `core` must not import from React or Next.js.
- `application` may depend on `core`.
- `application` must not depend directly on concrete adapters.
- `adapters` may depend on external technologies.
- `src/app` is a Next.js framework boundary and should remain thin.
- `src/components` contains presentation concerns and should not contain
  domain business rules.

When uncertain where code belongs, stop and inspect the existing architecture
rather than placing it in the nearest convenient directory.

---

## 5. Framework Isolation

Next.js is an implementation technology, not the domain architecture.

Avoid allowing:

- Next.js APIs
- React-specific behavior
- browser APIs
- Vercel-specific APIs
- Tailwind-specific concerns
- external SDKs

to leak into framework-independent core logic.

Framework-specific code belongs at the appropriate outer boundary.

---

## 6. Configuration and Re-brandability

Provelopment is intended to be re-branded and customized by downstream users.

Common downstream customization should prefer configuration and content over
modification of platform logic.

Potential customization areas include:

- business name
- logo
- colors
- typography
- navigation
- contact information
- social links
- SEO defaults
- content
- enabled features

Do not hard-code Provelopment-specific business information into reusable
platform components.

When implementing a feature, consider whether it should be:

1. platform behavior,
2. configuration,
3. content,
4. or a downstream customization.

Keep those concerns separate.

---

## 7. Content

Human-authored content should remain separate from application implementation.

Do not embed large amounts of business copy directly into reusable components.

Prefer the established content system once it exists.

Content changes should generally not require changes to application logic.

---

## 8. UI Components

Reusable UI components belong under `src/components`.

Prefer:

- semantic HTML
- accessible interactions
- keyboard support
- responsive behavior
- composability
- design tokens
- explicit component APIs

Avoid:

- duplicated UI implementations
- unnecessary page-specific components
- business logic inside presentational components
- arbitrary hard-coded styling when a design token exists

Do not introduce a component abstraction merely because two lines of markup
look similar. Abstract when there is a meaningful reusable concept.

---

## 9. Configuration Before Duplication

Before creating a new hard-coded value, ask whether it represents:

- configuration,
- content,
- a design token,
- a domain concept,
- or a true implementation constant.

Do not scatter branding values throughout the application.

---

## 10. AI-Generated Changes

Agents must make the smallest coherent change that solves the requested
problem.

Do not rewrite unrelated code.

Do not perform broad refactors unless explicitly requested or required to
preserve architectural integrity.

Do not introduce dependencies without a clear reason.

Before adding a dependency, consider whether the capability can be implemented
using existing platform functionality.

---

## 11. Dependency Discipline

Prefer the smallest dependency set that provides the required capability.

When introducing a dependency:

1. Identify why it is required.
2. Confirm it is compatible with the current Next.js version.
3. Confirm it does not violate architectural boundaries.
4. Consider whether the capability can remain replaceable.
5. Update documentation when the dependency materially changes development
   behavior.

Do not install packages merely because they are popular.

---

## 12. Server and Client Components

Prefer Server Components by default where supported by Next.js.

Use Client Components only when client-side behavior requires them, such as:

- browser APIs
- local interactive state
- event-driven UI
- client-only libraries

Do not add `"use client"` without a reason.

Keep client boundaries as small as practical.

---

## 13. Data and Backend Evolution

The current application is frontend-only.

Do not introduce a database, authentication system, API server, or other
backend infrastructure unless specifically requested.

However, when designing application behavior, preserve the ability to introduce
backend infrastructure later.

Prefer application ports and adapters over direct coupling to infrastructure.

---

## 14. Testing

Tests should verify behavior and architectural contracts where practical.

At minimum, maintain confidence in:

- TypeScript
- linting
- production build
- critical user behavior

Do not write tests solely to increase a coverage number.

Prefer tests that protect meaningful behavior and architectural boundaries.

---

## 15. Validation

After meaningful changes, run the applicable checks.

The expected baseline commands include:

```text
pnpm exec tsc --noEmit
pnpm lint
pnpm build
````

When tests exist, run the relevant test suite as well.

Do not claim a change is complete if the relevant validation has not been
performed.

---

## 16. Git Discipline

Keep commits focused and understandable.

Prefer commit messages following conventional commit terminology, for example:

* `feat:`
* `fix:`
* `docs:`
* `refactor:`
* `test:`
* `ci:`
* `chore:`

Do not mix unrelated changes into a single commit.

Do not commit:

* secrets
* API keys
* credentials
* local environment files containing secrets
* generated dependency directories
* build output

---

## 17. Upstream / Downstream Compatibility

Provelopment is intended to evolve as an upstream project while supporting
downstream customized websites.

When making a change, consider whether the change will be:

* platform-level,
* configuration-level,
* content-level,
* or downstream-specific.

Avoid modifying platform files merely to implement a customization that could
be represented through configuration or content.

When practical, preserve clean separation between upstream-owned platform
capabilities and downstream-owned customization.

---

## 18. Do Not Fight the Framework

Use Next.js conventions where they provide a clear benefit.

Do not create custom abstractions merely to make the framework look like a
different framework.

Architecture should isolate meaningful business/application concerns, not
eliminate every framework convention.

---

## 19. Do Not Over-Engineer

The architecture is designed for extensibility, but extensibility does not
justify speculative abstractions.

Do not create:

* empty interfaces without a real purpose
* unnecessary factories
* unnecessary dependency injection containers
* premature repositories
* speculative services
* generic abstractions without a concrete use case

Prefer simple code until complexity is demonstrated.

---

## 20. Change Strategy

When implementing a feature:

1. Understand the requested behavior.
2. Locate the appropriate architectural boundary.
3. Inspect existing related code.
4. Reuse existing capabilities where appropriate.
5. Implement the smallest coherent change.
6. Preserve architectural boundaries.
7. Validate the change.
8. Review the resulting diff.
9. Document important architectural decisions.

---

## 21. Stop Conditions

An agent should stop and request clarification rather than guessing when:

* requirements conflict,
* an architectural boundary must be violated,
* a secret or credential is requested,
* destructive repository operations are required,
* a dependency choice has significant architectural consequences,
* the requested behavior contradicts existing documented requirements,
* or the correct implementation cannot be determined from the available
  context.

Do not silently invent requirements.

---

## 22. Source of Truth

When instructions conflict, use this priority:

1. Explicit current user request
2. Repository-specific instructions
3. `ARCHITECTURE.md`
4. Existing implementation and established conventions
5. Framework conventions
6. General engineering preference

When a higher-priority requirement conflicts with a lower-priority convention,
follow the higher-priority requirement and document the consequential change
when appropriate.

---

## 23. Preserve Context for Future Agents

When implementing significant architectural decisions, leave useful context
in:

* code structure,
* names,
* documentation,
* tests,
* and focused commit messages.

Do not rely on an AI agent remembering decisions from a previous conversation.

The repository must contain enough information for a new agent to understand
the project independently.
