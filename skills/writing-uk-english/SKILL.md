---
name: writing-uk-english
description: Writes in British English spelling and conventions (colour, organise, behaviour, licence, catalogue) instead of American English. Use for any prose written for a person, including documentation, READMEs, commit message bodies, code comments, UI text, blog posts and replies, unless the project or user asks for American English.
---

# UK English

Write all prose in British English. This applies to documentation, READMEs, comments, commit bodies, UI text and conversation.

Don't change:

- Code identifiers, CSS properties, API fields and config keys (`color`, `initialize()`, `license` in `package.json`).
- Product and company names, and quoted text.
- A codebase that already uses American English for its UI text. Follow the codebase and mention it to the user.

## Spelling

| Pattern | UK | Not |
| ------- | -- | --- |
| -our | colour, behaviour, favour, honour, neighbour | color, behavior |
| -ise | organise, recognise, prioritise, optimise, customise, initialise | organize, optimize |
| -yse | analyse, paralyse, catalyse | analyze |
| -re | centre, fibre, metre, theatre | center, fiber |
| -ogue | catalogue, dialogue, analogue | catalog, dialog |
| -ence | defence, licence (noun), offence, practice (noun) | defense, offense |
| Doubled l | travelled, cancelled, modelling, labelled, fuelled | traveled, canceled |
| Single l | enrol, fulfil, instil, skilful | enroll, fulfill |
| Others | grey, judgement, ageing, programme (a schedule or plan), sceptical, aluminium, cheque, tyre | gray, judgment, aging |

Noun and verb pairs:

- **licence / license.** "A software licence", "licensed under MIT".
- **practice / practise.** "Best practice", "practise regularly".
- **program / programme.** Software is a "program" and so is the verb "to program". A plan or series is a "programme".

`dialog` stays when it's a UI element name (`<dialog>`, `role="dialog"`). Use "dialogue" in prose about conversation.

## Words and usage

- "Maths", not "math".
- "Full stop", not "period", for the punctuation mark.
- "Whilst" and "amongst" are fine but optional. "While" and "among" are also correct UK English.
- Collective nouns can take a plural verb: "the team are deciding" is fine.
- "Got" is the past participle: "I've got", not "I've gotten".

## Dates, numbers and money

- Dates: `16 October 2026` in prose, `2026-10-16` (ISO) in data and file names. Never `10/16/2026`.
- Times: 24-hour (`14:30`) or `2.30pm`.
- Money: `£12.50`. Put the currency symbol first, with no space.
- Use metric units first, adding imperial in brackets only when it helps.

## Punctuation

- Single quotation marks are common in UK publishing, but double quotes are fine, especially in technical writing. Follow what the project already uses.
- The serial (Oxford) comma is optional. Use it when it removes ambiguity.
