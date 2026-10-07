# Pricing-Transp-Navy

## Marine loading component (`cmpMarineLoader`)

A minimalist, single-colour loading overlay for Power Apps canvas apps. An outlined container ship bobs on scrolling wave lines, with smoke rings rising from the funnel and a blinking mast light. Under the drawing there are animated "Loading..." dots and a thin progress bar that slides back and forth. Everything is orange line art on white by default.

![Marine loader frames](docs/marine-loader-preview.png)

| File | Use |
|---|---|
| `components/cmpMarineLoader.pa.yaml` | Full component definition (custom properties + controls) |
| `components/cmpMarineLoader.controls.paste.yaml` | Controls only, ready for **Paste code** in Studio |

### How it animates

One hidden `Timer` (4 s, repeating) drives everything. The SVG is rebuilt from `tmrMarineLoader.Value`. Every motion completes a whole number of cycles in those 4 s, so the loop has no visible jump. The SVG has no SMIL or CSS animation, so it behaves the same on web, mobile and Teams.

`AccentColor` sets the line colour of the drawing, the main text and the progress bar. The formula converts it to hex for the SVG with `Mid(JSON(color), 2, 7)`. To use another colour, change that one property.

### Add it to your app

1. **Components** tab → **New component** → rename it to `cmpMarineLoader`.
2. Add these custom properties (all **Input**):

   | Name | Type | Default |
   |---|---|---|
   | `IsLoading` | Boolean | `true` |
   | `LoadingText` | Text | `"Loading"` |
   | `SubText` | Text | `"Charting the best route"` |
   | `AccentColor` | Color | `RGBA(255, 122, 0, 1)` |
   | `BackgroundColor` | Color | `RGBA(255, 255, 255, 1)` |

3. Set the component's `Fill` to `cmpMarineLoader.BackgroundColor`. Set its size to 640 × 420 or any size you like. The drawing and text scale with the component, so stretched over a full screen the drawing takes about 70% of the height.
4. Open `cmpMarineLoader.controls.paste.yaml` and copy all of it. Then right-click the component in the Tree view → **Paste code**.

If you use source control or `pac canvas` with `.pa.yaml` sources, you can drop in `cmpMarineLoader.pa.yaml` as is.

### Use it on a screen

Insert the component, stretch it over the screen and bring it to the front:

```
X: =0
Y: =0
Width: =App.Width
Height: =App.Height
Visible: =locIsLoading
IsLoading: =locIsLoading
LoadingText: ="Calculating freight"
SubText: ="Fetching vessel rates"
```

Toggle it around slow work:

```
UpdateContext({ locIsLoading: true });
ClearCollect(colRates, 'Freight Rates');
UpdateContext({ locIsLoading: false })
```

> Timers only run in **Preview** (F5) or the published app, so the scene stays still while you edit in Studio.

## Sidebar navigation component (`cmpSidebar`)

The app's left menu: logo, product label, a menu split into sections with icons, and the signed-in user at the bottom. The menu is driven by one `Items` table, so you add, rename or reorder entries without touching any controls. Set `Expanded` to `false` to get an icons-only rail for tablet widths. Hovering an icon then shows its label as a tooltip.

![Sidebar expanded and collapsed](docs/sidebar-preview.png)

| File | Use |
|---|---|
| `components/cmpSidebar.pa.yaml` | Full component definition (custom properties + controls) |
| `components/cmpSidebar.controls.paste.yaml` | Controls only, ready for **Paste code** in Studio |
| `components/cmpSidebar.items.fx` | Default value of the `Items` property, ready for the formula bar |

### Add it to your app

1. **Components** tab → **New component** → rename it to `cmpSidebar`. Set Width `218` and Height `784`.
2. In the component's right panel, turn on **Access app scope**. Without it, the menu can't navigate to your screens.
3. Add these custom properties (all **Input**):

   | Name | Type | Default |
   |---|---|---|
   | `Items` | Table | contents of `cmpSidebar.items.fx` |
   | `ActiveItemID` | Text | `"exec"` |
   | `Expanded` | Boolean | `true` |
   | `LogoText` | Text | `"galp"` |
   | `LogoImage` | Image | `Blank()` |
   | `ProductLabel` | Text | `"PRICING · T&D"` |
   | `UserName` | Text | `User().FullName` |
   | `UserSubtitle` | Text | `"TRP · PT"` |
   | `AccentColor` | Color | `RGBA(255, 95, 0, 1)` |
   | `AvatarColor` | Color | `RGBA(22, 163, 77, 1)` |

4. Copy all of `cmpSidebar.controls.paste.yaml`, then right-click the component in the Tree view → **Paste code**.

### Connect the menu to your screens

In the `Items` default, replace each `Screen: App.ActiveScreen` with the screen that row should open, for example `Screen: scrExecucaoSemanal`. Section rows (`Kind: "section"`) are not clickable, so their `Screen` value doesn't matter.

To add an entry, copy an `item` row, then give it a new `ItemID`, a `Label` and an `Icon`. `Icon` is the inner SVG of any 24×24 stroke icon. The defaults come from [Lucide](https://lucide.dev), so copy the elements inside `<svg>` from there and switch their double quotes to single quotes.

### Use it on a screen

Insert the component at the left of each screen and set:

```
X: =0
Y: =0
Height: =App.Height
Width: =If(App.Width >= 1200, 218, 64)
Expanded: =App.Width >= 1200
ActiveItemID: ="exec"
```

Set `ActiveItemID` to the `ItemID` of the screen it sits on, so that row is highlighted. If you've uploaded the official logo to **Media**, set `LogoImage` to it to replace the text wordmark.
