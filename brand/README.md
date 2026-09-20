# FitnessKinda — identity

Two readings in one mark: a figure with a raised gesture, and a balloon floating
above a heart. Neither is drawn literally. The body is two open strokes that the
eye closes; the balloon never touches the body, because a stalk between a circle
and a shape is what makes a mark read as a map pin.

Canvas with the full system: see the Design artifact shared with the owner.

## Files

| File | Use |
|---|---|
| `symbol.svg` | Two colour: ink body, persimmon balloon. The default. |
| `symbol-mono.svg` | One colour, inherits `currentColor`. Use this on the web. |
| `symbol-reversed.svg` | Bone body on dark grounds. |
| `symbol-compact.svg` | **Below 32px.** The arms are dropped; four strokes hold where six fill in. |
| `favicon.svg` | Compact cut in ink, for the browser tab. |
| `app-icon.svg` | 1024 rounded tile, mark inset to the safe area. |
| `lockup-horizontal.svg` | Symbol + wordmark, side by side. |
| `lockup-stacked.svg` | Symbol over wordmark. |
| `lockup-horizontal-reversed.svg` | The same on dark. |
| `png/` | 512 and 1024 rasters, transparent background. |

**The lockups carry live text.** Outline the wordmark in a vector editor before
sending anything to a printer or an embroiderer — otherwise it falls back to a
system font on a machine without Instrument Sans.

## Colour

| | Hex | Use |
|---|---|---|
| Ink | `#16150F` | The symbol, text |
| Bone | `#F4F1EA` | Ground |
| Stone | `#CFC8B9` | Rules, quiet marks |
| Persimmon | `#E2553A` | The one accent — the balloon, and nothing else by default |

No second accent. If the mark needs to be single colour, it is ink or it is
persimmon, never a gradient.

## Type

**Instrument Sans**, 600 for the wordmark, tracking −0.035em. 400 and 500 for
interface text. **Instrument Serif** italic for editorial asides, sparingly.

## Rules

- **Clear space**: the balloon's diameter on every side.
- **Minimum size**: 20px for the compact cut, 44px for the full mark.
- Never stretch, rotate, outline, add a shadow, or place the mark on a busy photo.
- Never recolour the balloon to anything but persimmon, bone or the body colour.
- The arms may be dropped (that is `symbol-compact.svg`). Nothing else may be.

## Apparel

Single weight line, one colour — it screen prints and embroiders without fill
problems. For embroidery keep it at 60mm or larger; below that the switchbacks in
the string close up. Use `symbol-mono.svg`.

## Not wired into the product

The app still ships its original icon. Swapping it over is a separate change:
`icon.svg`, `manifest.json` and the theme colour in `index.html` and `sw.js`.
