# Helpers for page-building scripts

`use_figma` keeps no state between calls, so paste these at the top of each script. Replace the variable and style IDs with the ones returned when the foundations were created.

```js
const page = await figma.getNodeByIdAsync("PAGE_ID");
await figma.setCurrentPageAsync(page);

// Load every font the script will touch, up front.
await Promise.all(
  [["Inter", "Regular"], ["Inter", "Medium"], ["Display Font", "Bold"]].map(([family, style]) =>
    figma.loadFontAsync({ family, style }),
  ),
);

// Theme variables by short name.
const V = {};
for (const [k, id] of Object.entries({ bg: "VariableID:…", fg: "VariableID:…", muted: "VariableID:…" })) {
  V[k] = await figma.variables.getVariableByIdAsync(id);
}

// Bound solid paint. Don't pass opacity here (it renders opaque); use an alpha variable instead.
const P = (k) =>
  figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", V[k]);

// Text styles by name, so scripts survive style ID changes.
const ST = Object.fromEntries((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s.id]));

async function txt(chars, style, fill, name, width) {
  const t = figma.createText();
  await t.setTextStyleIdAsync(ST[style]);
  t.characters = chars;
  t.fills = [fill];
  if (name) t.name = name;
  if (width) {
    t.resize(width, t.height);
    t.textAutoResize = "HEIGHT";
  }
  return t;
}

// Transparent auto-layout frame.
const AL = (dir, props = {}) => {
  const f = figma.createAutoLayout(dir, props);
  f.fills = [];
  return f;
};

// Set instance properties by name, ignoring the "#id" suffix Figma appends
// (and changes when variants are combined).
const setP = (instance, values) => {
  const keys = Object.keys(instance.componentProperties);
  const out = {};
  for (const [name, value] of Object.entries(values)) {
    const key = keys.find((k) => k.split("#")[0] === name);
    if (key) out[key] = value;
  }
  instance.setProperties(out);
};
```

## Section divider glow

A 1px gradient line pinned to the top of a section, for designs that use a glow instead of a border:

```js
function glow(section, width) {
  const g = figma.createRectangle();
  g.name = "Section glow";
  section.appendChild(g);
  g.layoutPositioning = "ABSOLUTE";
  g.resize(width, 1);
  g.x = 0;
  g.y = 0;
  g.constraints = { horizontal: "STRETCH", vertical: "MIN" };
  g.fills = [{
    type: "GRADIENT_LINEAR",
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [
      { position: 0, color: { r: 1, g: 0.24, b: 0, a: 0 } },
      { position: 0.5, color: { r: 1, g: 0.24, b: 0, a: 0.28 } },
      { position: 1, color: { r: 1, g: 0.24, b: 0, a: 0 } },
    ],
  }];
}
```
