# Figma Plugin API pitfalls

Each of these was hit while rebuilding a real site in Figma through `use_figma`. They fail silently or with unhelpful errors, so check for them up front.

## Paints and colour

**Opacity on a variable-bound paint renders as fully opaque.** `setBoundVariableForPaint({ ..., opacity: 0.1 }, "color", v)` stores `opacity: 0.1`, but the canvas draws the colour solid. Two fixes:

- Put the alpha in the variable value instead (for example `foreground-subtle` = foreground at 70%, with light and dark values). Bind that.
- For colours that never change with theme (white overlays on a black footer), use a plain unbound paint with `opacity`.

**`setRangeTextDecorationColor` wants a paint, not an RGBA.** Use `{ value: { type: "SOLID", color: { r, g, b } } }`.

**Gradients can't bind variables.** Hard-code gradient stops (accent glows, edge fades) and name the layer so it's findable.

## Variables

**Variable names can't contain `.`.** `space/1.5` throws "invalid variable name". Use `space/1-5`.

## Auto-layout sizing

**`resize()` resets both sizing modes to FIXED.** A vertical frame created with `createAutoLayout` and then `resize(305, 10)` stays 10px tall and clips its children. After any `resize()`, set the hugging axis back: `primaryAxisSizingMode = "AUTO"` on vertical stacks, or `counterAxisSizingMode = "AUTO"` on wrapping rows.

**Wrap rows need a fixed primary axis.** For `layoutWrap = "WRAP"`, set `primaryAxisSizingMode = "FIXED"`, resize to the column width, then set `counterAxisSizingMode = "AUTO"`.

**FILL doesn't divide a row evenly when content differs.** In a three-column row with one card and two empty cells, FILL gave 350/310/310 because the grow basis is each child's hug width. For partial rows, set `layoutSizingHorizontal = "FIXED"` and resize every cell to the column width.

**Equal-height cards need explicit heights.** Measure the tallest card in each row, then set every card to `primaryAxisSizingMode = "FIXED"` at that height. Re-run this whenever card content changes (for example after fixing a line clamp).

## Text

**Re-assigning `componentPropertyReferences` reset `maxLines` to 1.** Set `maxLines` and `textTruncation = "ENDING"` last, after every property reference is wired, and read them back to confirm.

**Load fonts before touching any text node,** including setting `textStyleId`. Use `setTextStyleIdAsync`.

## Components and instances

**`combineAsVariants` re-keys component properties.** `Role#10:3` becomes `Role#15:0`. Don't hard-code property keys across calls; look them up by name prefix (see the `setP` helper).

**Cloning a variant into an existing set drops its property references.** Variants added with `variant.clone()` + `set.appendChild()` keep their text but lose `componentPropertyReferences`, so instances ignore overrides. Relink each text node to the set's keys after cloning.

**Transforms can't be overridden on nested instances.** Rotating a chevron inside an instance throws "This property cannot be overridden in an instance: relative-transform". Make it a variant (for example `Open=true` with the chevron rotated in the main component).

**Instances can override padding, item spacing, font size and fills,** which is enough for "same component, smaller" uses such as compact pills. Prefer a variant if the difference is reused.

**Component-set frames clip by default.** After `combineAsVariants`, set the set's `layoutMode` and both sizing modes to `AUTO`, or variants get cut off in screenshots.

## Calls, size and recovery

**Each `use_figma` script is capped at 50,000 characters.** Chunk large SVG payloads (around 38 KB each) and run the chunks in parallel. Dedupe icons by path first.

**A thrown error rolled back the whole call in practice.** Even so, read the canvas once after a failure before retrying, so you never create duplicates (guard with "does this frame already exist?").

**Page context resets every call.** Start each script with `await figma.setCurrentPageAsync(page)`, once.

**Parallel page builds are safe** if each call creates its own top-level frame at a fixed, non-overlapping canvas position.

## Code Connect

**Mappings are refused on Free and Professional plans** ("Code connections can only be made in libraries that are in Organization or Enterprise plans"). `get_code_connect_suggestions` still works, which is misleading; test one `add_code_connect_map` before writing templates.
