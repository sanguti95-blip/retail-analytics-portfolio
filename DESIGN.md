# Design System

## Strategy
Restrained: Pure white background + 1 saturated primary accent (<= 10%). Product default for analytical rigor and executive clarity. La data es el centro, el color solo subraya la acción y el estado.

## Tokens

### Color
- **bg**: `oklch(1.000 0.000 0)` (Pure White) - Maximizes clarity for dense data.
- **surface**: `oklch(0.980 0.002 350)` (Off-white) - Used for cards and secondary panels.
- **ink**: `oklch(0.120 0.010 350)` (Deep near-black) - High contrast text.
- **muted**: `oklch(0.550 0.005 350)` - Secondary text, borders, subtle dividers.
- **primary**: `oklch(0.420 0.163 350.0)` (Deep Magenta/Red) - Action colors, key highlights.
- **accent**: `oklch(0.550 0.120 250.0)` (Cool Indigo) - Distinct secondary accent for charts or alternate states.
- **danger**: `oklch(0.500 0.200 25.0)` (Vibrant Red-Orange) - For "Agotado" or negative metrics.
- **warning**: `oklch(0.750 0.150 70.0)` (Amber) - For "Reorden".
- **success**: `oklch(0.600 0.150 145.0)` (Green) - For "Normal".

### Typography
- **Font Family**: Inter, sans-serif (Ya incluido en el proyecto, excelente legibilidad para números).
- **Scale**: 
  - Base: 14px (Data tables)
  - Small: 12px (Badges, subtext)
  - H1/Hero: 24px (Dashboard Title)
  - H2/Section: 18px (Card Titles)
  - H3/Metric: 32px (KPI Numbers)
- **Weight**: 400 (Regular) for data, 500 (Medium) for UI elements, 600 (Semi-bold) for headers.
- **Tabular Nums**: `font-variant-numeric: tabular-nums` must be used for all metric and table columns to align decimals perfectly.

### Spacing & Layout
- **Rhythm**: 4px, 8px, 16px, 24px, 32px.
- **Borders**: 1px solid `oklch(0.900 0.005 350)`. Never use thick side-stripes for cards.
- **Radius**: `4px` for badges, `8px` for cards/inputs. No excessive rounding (no 24px+ pills unless specifically a tiny tag).
- **Shadows**: Single distinct soft shadow `0 2px 8px rgba(0,0,0,0.05)` for floating elements (modals), flat borders for inline cards. No ghost cards (border + large shadow).

### Motion
- **Ease**: `ease-out` (cubic-bezier(0.16, 1, 0.3, 1)) for hover states.
- **Duration**: 150ms for micro-interactions (buttons, rows).
