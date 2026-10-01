# UI ideas and improvements

> **What this file is.** A durable register of useful **future possibilities** for the Foundation's
> user interface, kept so a good idea is not lost merely because nobody is building it yet.
>
> **What this file is not.** It is **not** architecture authority, **not** a committed roadmap,
> **not** approved implementation, **not** release scope, **not** backlog priority, and **not** a
> promise that anything described here will ever be built. Nothing here is a contract, nothing here
> is tested, and nothing here may be treated as a specification.
>
> **Where authority actually lives.** `ARCHITECTURE.md` owns boundaries and the UI system,
> `CUSTOMIZING.md` owns the configuration schema, `BRAND_ASSETS.md` owns the asset contract, and
> `tests/browser/README.md` owns what the browser gates really prove. If an idea here is ever
> promoted, those documents change **first** — this file is not where a behaviour is defined.
>
> **Where this file lives, and why.** It sits at the repository root because that is where the
> Foundation's own platform documentation lives (the release policy classifies root `.md` files as
> `platform-root-documentation`). The distributed operator manuals in `instruction-manuals/` are a
> byte-identical package owned upstream and are never edited in place, and the deployment capsule
> under `deployment/` documents what a *deployment* owns — so neither is the home for platform-level
> ideas. Non-UI ideas live in sibling files of the same shape, currently
> [`testing-ideas-and-improvements.md`](testing-ideas-and-improvements.md).

## How an idea here becomes work

An idea becomes implementation work only when **all four** of these are true, in order:

1. **the owner explicitly selects it** — presence in this file authorises nothing;
2. **its architecture is defined** — boundaries and, where configuration is involved, the schema
   (`ARCHITECTURE.md`, `src/config/schema.ts` + `CUSTOMIZING.md`);
3. **its scope is bounded** as one coherent change, at the standard the repository already holds;
4. **a separate work order authorises the implementation.**

Until then an idea is unapproved: it may be rejected, deferred, reworded or deleted without notice,
and it may never be used to justify a code change, a test, or a claim about current behaviour.

## Entry format

Every entry uses the same lightweight shape — no dates, no priority ranking, no estimates and no
milestones:

```text
## Idea title

Status: Future idea — not approved for implementation

Opportunity:
...
Current behaviour:
...
Possible future directions:
...
Important constraints:
...
Why deferred:
...
```

## Shared future constraints: interaction and motion

These apply to **every** idea below that proposes a visual or motion-based effect, so they are
recorded once here instead of repeated per entry:

- a hover effect may **never be the only** way an important state is communicated;
- keyboard **focus must stay independently visible** (the current global `:focus-visible` ring is
  the accepted behaviour);
- the **current-page state must stay semantically exposed** (`aria-current="page"` — a decoration
  may be added on top of that meaning, never instead of it);
- **touch interfaces must stay usable** — a device without hover capability
  (`@media (hover: hover)` false) receives no hover styling today, which is deliberate platform
  behaviour rather than a gap;
- **motion must honour reduced-motion preferences** — the platform already ships a reduced-motion
  treatment for its animated surfaces, and any new motion joins that policy instead of bypassing it;
- **visual effects must not destabilise layout** — no size, position or flow change unless a design
  decision explicitly asks for one;
- effects stay **surface-explicit**: ONE shared vocabulary with, at most, controlled per-surface
  overrides — never a second, parallel styling system.

## 1. Optional tooltips for icon-only controls

Status: Future idea — not approved for implementation

Opportunity:
An interactive control presented **only as an icon** gives a pointer user no visible words. The
closed Sidebar's *Show navigation* control is the clearest current example: it carries a localized
`aria-label`, and while the rail is collapsed there is no `title`, no tooltip and no visible label.
An optional tooltip would let a visitor discover what the icon does without opening the rail, and
would give every future icon-only control one consistent place to declare its human-readable purpose.

```text
icon-only control
    ↓
optional tooltip
    ↓
human-readable purpose/label
```

Current behaviour:
- The control is fully accessible and operable today: a real disclosure control with
  `aria-expanded` / `aria-controls`, a localized accessible name, a 24px hit target and a focus ring.
  This idea adds discovery; it does not repair anything.
- A **native `title` tooltip already exists for sidebar navigation items** (the icon-bearing page
  links), and the sidebar page-icon contract asserts that discoverability. The convention therefore
  already exists in the repository — it is simply not applied to icon-only *controls*.

Possible future directions:
- extend the existing native-`title` convention to icon-only controls, declared per control so a
  deployment can switch it off without touching source;
- or a styled tooltip component, if native tooltips prove insufficient — designed once and shared,
  never re-implemented per component.

Important constraints (for future evaluation):
- the tooltip must **supplement** the accessible name, never replace it: the control keeps its
  localized accessible name exactly as today;
- **keyboard and focus access** must be considered — a hover-only tooltip is unreachable by
  keyboard, so `:focus-visible` must reveal it too;
- **touch devices cannot depend on hover**: a tooltip is never the only way to identify the control;
- the tooltip must **not obscure critical controls or content** (the rail edge, the header and the
  Menu Bar are all dense at small widths);
- it must add no layout shift, and must respect reduced-motion preferences if animated.

Why deferred:
It changes interaction presentation and needs an owner decision on mechanism, placement and
enablement, while the control is already correct and accessible — nothing is urgent.

## 2. Configurable hover interaction for links and interactive navigation items

Status: Future idea — not approved for implementation

Opportunity:
Hover presentation is currently one hard-coded effect per element, expressed as utility classes (a
rail link moves to `--foreground`, an ordinary footer link moves to `--primary`, and so on). Making
hover an **extensible, configurable option** — instead of one fixed effect — would let a deployment
choose the interaction that suits its brand without editing source, and would give Sidebar links,
Menu Bar links and ordinary links ONE shared vocabulary rather than three independent decisions.

Current behaviour:
- Hover exists and is asserted, but it is **capability-gated**: Tailwind compiles every `hover:`
  utility inside `@media (hover: hover)`, so a device without hover capability receives no hover
  styling at all — deliberate platform behaviour, not a gap.
- There is exactly one effect per element and no configuration surface for it.

Possible future directions (none of them designed yet):
- highlighting (a subtle surface or tint change);
- slight movement (a small translate — the motion rules below apply);
- bolding (a font-weight change);
- colour change (today's model);
- background / surface change;
- underline treatment;
- other presentation effects an owner may want later.

A future design must decide whether this is a **closed vocabulary** (a fixed set of named effects
validated by the schema, like every other UI leaf) or an open one, and how it composes with the
existing tokens.

Important constraints:
Every constraint in *Shared future constraints* applies, plus: motion must honour reduced-motion,
and the effect must not change the element's size or its row's layout (a weight change that reflows
a rail label is a layout effect, not a colour effect).

Why deferred:
The configuration schema would grow — every leaf needs a schema entry and unit coverage — and the
vocabulary of effects is a product/design decision, not an implementation detail, so the final
schema must not be invented in advance.

## 3. Optional current-page visual presentation

Status: Future idea — not approved for implementation

Opportunity:
The platform already marks the current page for assistive technology, and a sighted visitor gets no
visual confirmation at all. An **optional** current-page presentation would let a deployment
reinforce where the visitor is without changing the semantics it already has.

Current behaviour:
- The current page is exposed semantically: `aria-current="page"` on the internal navigation link,
  with a marker class present in the markup.
- There is deliberately **no separate visual treatment**, and the appearance contract asserts that
  no such styling is assumed. This is a current design position, not a defect.

The three states are conceptually distinct and must not be collapsed into one idea:

```text
current state
!=
hover state
!=
focus state
```

Possible future directions (a marker may combine more than one):
- font weight;
- colour;
- background / surface;
- an indicator (a bar, a dot, a rail-edge mark);
- underline treatment;
- other explicit current-page markers.

Important constraints:
Every constraint in *Shared future constraints* applies. In addition, an effect that also changes
size (weight, padding, indicator) must be designed so a navigation row cannot reflow when the
visitor moves between pages.

Why deferred:
It is a design decision about how navigation communicates location, it must hold at every viewport
band and in every retained layout (Sidebar, Menu Bar) at once, and it must not be confused with
hover or focus. Owner decision first.

## 4. Optional independently configurable Sidebar surface

Status: Future idea — not approved for implementation

Opportunity:
A deployment may want its navigation surface to read as a distinct plane from the page canvas. Today
the Sidebar deliberately shares the page's colour authority, so that option does not exist.

Current behaviour:
- `ui.theme.background` → `--background` on the root element, consumed intentionally by the page
  body, the header surface, the Sidebar rail, the layout selector and the Menu Bar surface.
- **No Sidebar-specific colour authority exists.** The shared background is the accepted model, and
  it is asserted as such — an adopter who re-colours the page re-colours the rail with it.

Possible future directions:
- an optional Sidebar surface colour that a deployment may set independently, while an unset value
  keeps today's shared-background behaviour as the default and valid model;
- possibly an accompanying foreground / divider relationship, so a darker or lighter rail keeps its
  text and its divider readable against the chosen surface.

Important constraints:
- today's shared behaviour must remain the default: an unconfigured deployment must render exactly
  what it renders now, and the existing appearance contract must stay true for it;
- if a foreground or divider relationship is added, the contrast of rail text and rail divider
  against the configured surface becomes the deployment's responsibility, so guidance (and possibly
  a documented minimum) would be needed — the platform does not currently measure contrast;
- no new token, no new schema leaf and no theme change is authorised by this entry.

Why deferred:
It is a genuine design capability that needs an owner decision about the shape of the configuration
(a surface alone, or surface + foreground + divider), and it would add schema, defaults, resolved
configuration, documentation and browser coverage.

## 5. Optional Menu Bar interaction styling

Status: Future idea — not approved for implementation

Opportunity:
The Menu Bar's links carry no hover colour effect today, so the platform's two navigation layouts
behave differently under the pointer. A future interaction styling option would let both layouts
offer a consistent interaction without inventing a second mechanism for the Menu Bar alone.

Current behaviour:
- Menu Bar navigation links carry no `hover:` colour utility, and no hover recolouring is asserted
  for them. This is current behaviour, recorded rather than repaired.
- Sidebar links and ordinary links each carry their own single effect.

Possible future directions:
- **one** interaction-style vocabulary shared by Sidebar links, Menu Bar links and ordinary
  navigation links (see idea 2), with controlled per-surface overrides only where a surface
  genuinely needs a different treatment;
- explicitly deciding that a surface has **no** interaction effect, recorded as a decision rather
  than left as an accident of which utility class was typed.

This entry deliberately specifies no separate Menu Bar implementation: a Menu Bar-only mechanism
would be the duplicate styling system the platform avoids.

Important constraints:
Every constraint in *Shared future constraints* applies. The Menu Bar is a full-width sticky
surface, so a surface-based effect must read correctly against the page canvas at every width, and
must not change the bar's height (the bar already grows when its links wrap).

Why deferred:
It is the same decision as idea 2 seen from a second surface. The owner should decide the vocabulary
once — including whether the Menu Bar participates — instead of two work orders inventing two
systems.

## 6. Structural hairline contrast in both schemes

Status: Future idea — not approved for implementation

Opportunity:
The shell's structural separators (the rail divider, the footer hairline, the Menu Bar's top border
and the layout selector's edge) all use the same `--border` token, which is deliberately faint. On a
custom canvas it can become effectively invisible, and whether any of those boundaries must be
perceivable is a design position nobody has stated.

Current behaviour (measured, both schemes):
- `--border` `#e2e8f0` against `--background` `#ffffff` = **1.23:1** in the light scheme.
- `--border` `#334155` against `--background` `#0f172a` = **1.72:1** in the dark scheme.
- Every *text* pair in the theme already meets WCAG AA, and the focus ring resolves to the theme
  accent at **7.58:1** (light) / **7.62:1** (dark) against the canvas.

Possible future directions:
- decide per boundary whether it is purely decorative (a whisper) or structural (a control's only
  edge), and give the structural cases a stronger token;
- or keep the current hairlines and record the decision explicitly, so no future work treats the
  measurement as a defect.

Important constraints:
Changing a token changes every consumer at once (both schemes, every surface, all browsers), and
contrast cannot be judged for adopter-configured canvases without guidance (see idea 7). Any change
must keep the appearance contract's token wiring true, or update it deliberately.

Why deferred:
It is an aesthetic/accessibility judgement about how much structure a boundary should express, and
the current values are deliberate and consistent — a decision, not a bug fix.

## 7. Contrast of the platform's own accent against an adopter-configured canvas

Status: Future idea — not approved for implementation

Opportunity:
A deployment can set `ui.theme.background` to any hex value, and the platform's own accent tokens do
not adapt to it. Nothing measures or warns about the result, so a bright or dark custom canvas can
quietly degrade the focus ring, link colour or boundaries.

Current behaviour (measured with the appearance contract's configured fixture, `ui.theme.background = "#00ff00"`):
- the configured colour reaches `--background` and every surface that shares it (page, Sidebar rail,
  selector, Menu Bar) exactly as documented;
- `--ring`, `--primary` and `--border` keep their platform values and do **not** adapt: against that
  canvas the accent link/focus colour still reads **5.52:1** and ordinary text **13.01:1**, but the
  structural hairline falls to **1.11:1** — essentially invisible;
- no token, configuration leaf or browser assertion currently covers this case.

Possible future directions:
- documented guidance in `CUSTOMIZING.md` for choosing a canvas the platform accent still works on;
- or an opt-in "derive the accent relationship from the configured canvas" capability (a much larger
  design, and the reverse of today's direction, where the accent owns the relationship);
- or a build-time/CI check that reports the resolved contrast of the documented pairs for the
  deployment's own configuration.

Important constraints:
The platform must not silently override a deployment's chosen colour, and any derivation must keep
the existing AA guarantee for text (`tests/unit/design-tokens.test.ts` enforces the shipped defaults
only). This is guidance or an opt-in capability — never a silent re-colouring.

Why deferred:
It needs an owner decision on whether an arbitrary canvas is the deployment's responsibility (with
guidance) or the platform's (with a guard), and it could grow into a theme-derivation feature.

## How this list was derived

Every entry above was **surfaced by completed Foundation work** (the NAV1/NAV2/NAV3 navigation and
appearance stream) or was **requested by the owner** for retention:

| Entry | Source | Why retained |
| --- | --- | --- |
| 1. Icon-only tooltips | owner request | an icon-only control shows no visible words to a pointer user; the convention already exists for navigation items |
| 2. Configurable hover interaction | owner request | hover is one hard-coded effect today; extensibility is a product decision, not an implementation detail |
| 3. Current-page visual presentation | owner request (NAV2/NAV3: semantics exist, no visual state) | a real design question, deliberately separated from hover and focus |
| 4. Independently configurable Sidebar surface | owner request (NAV2: no Sidebar-specific authority) | a plausible deployment need the shared-background model cannot express |
| 5. Menu Bar interaction styling | owner request (NAV2/NAV3: no hover effect on Menu Bar links) | the two navigation layouts currently behave differently under the pointer |
| 6. Structural hairline contrast | NAV2 measurements | measured 1.23:1 / 1.72:1 — a design judgement somebody should own |
| 7. Accent contrast on a configured canvas | NAV3 configured-background fixture | a deployment can set any canvas today, and nothing adapts or warns |

Deliberately **not** retained here, to keep the register free of noise: items already implemented
(the reduced-motion treatment, the native `title` tooltip on navigation items, focus-ring
visibility), items that are merely cleanup or documentation, and speculative features nobody has
asked for. A missing entry means "no useful, unimplemented, decision-requiring idea exists" — not
that the idea is impossible.


