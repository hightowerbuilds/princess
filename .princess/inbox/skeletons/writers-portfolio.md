---
title: writers-portfolio
category: website-skeletons
status: draft
createdAt: 2026-05-10T07:16:46.680Z
updatedAt: 2026-05-10T07:16:46.680Z
---

# Writers Portfolio App Prompt

Build a writer's portfolio web app using Vite, SolidJS, and Bun.

Use React Query for data fetching and Tan Stack Router for routing. The app should be structured as a real production-ready skeleton, not a toy demo. Use pure CSS only. Do not use any CSS framework, utility library, component styling library, or CSS-in-JS system.

## Core Pages

Create exactly four primary pages:

1. Home page
2. Portfolio page
3. Story page
4. Contact page

Each page should have its own route, its own clear layout section, and enough structure that content can be expanded later without reorganizing the app.

## Image Presentation

Include a reusable image template component or layout pattern for displaying images throughout the site.

This image template should support:

- A title or caption area
- Optional supporting text
- A consistent aspect ratio or framing system
- Responsive behavior across screen sizes
- Easy reuse across the portfolio and story pages

Treat this as a design system primitive, not a one-off component.

## Visual Direction

The site should avoid cliché AI-era website aesthetics.

Do not use:

- Generic glassmorphism
- Overused gradient blobs
- Safe startup landing-page symmetry
- Default minimal white-on-white SaaS styling
- Buzzword-driven visual language

Instead, aim for a visual identity that feels editorial, literary, and intentional.

The design should feel like a writer's portfolio, not a template. It should have personality, restraint, and a distinctive point of view.

## Implementation Requirements

- Use Bun as the runtime and package manager
- Use Vite as the build tool
- Use SolidJS for the UI
- Use React Query for asynchronous data handling
- Use Tan Stack Router for navigation and route organization

Organize the app so that the route structure, page modules, and shared UI primitives remain easy to extend.

## Typography

Use Atkinson for readable body text and general interface legibility.

Use Courier for stylistic accents, headings, labels, or moments where the design should feel more typewritten and editorial.

Treat the font pairing as intentional: Atkinson carries clarity and usability, while Courier provides character and reinforces the writerly tone of the site.

## Content And UX

The home page should introduce the writer and set the tone for the site.

The portfolio page should highlight selected work in a clean, scannable way.

The portfolio page should be built to display several PDF documents using a two-column layout with a sidebar and a main content section. The sidebar should support navigation, section labels, or document selection, while the main section should be where the active PDF content is presented.

The PDF itself must be displayed inside a fixed container with internal scrolling. The PDF viewer area should scroll within its own container, and the page as a whole should not become the primary scroll surface for reading the document.

The story page should support longer-form narrative content and visual storytelling.

For the story page specifically, incorporate an off-screen canvas workflow using `pretext.js` to render text-based ASCII art video.

The story page should either source or create a video of a person sitting at a typewriter and writing. The motion and facial movement in the source video should be preserved as the visual basis for the ASCII rendering, while the hands and typing action are represented through the `pretext.js` ASCII art output.

This should feel intentional and cinematic, not like a novelty effect. The ASCII video treatment should support the story theme and become part of the page's identity.

The contact page should make it easy to reach the writer without feeling like a generic form dump.

The overall experience should feel calm, polished, and authored.

## Final Goal

Create a portfolio app skeleton that feels like a curated writing site and gives us a strong foundation for later content, images, and case studies.
