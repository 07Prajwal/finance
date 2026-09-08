---
version: alpha
name: Apple Clean Light
description: A minimal, high-contrast, content-first system with precise spacing and restrained blue accents.
colors:
  primary: "#0071E3"
  primary-60: "#2B8AF0"
  primary-80: "#005BBB"
  secondary: "#0066CC"
  tertiary: "#1D1D1F"
  neutral: "#FFFFFF"
  surface: "#F5F5F7"
  on-surface: "#1D1D1F"
  muted: "#6E6E73"
  border: "#E5E7EB"
  error: "#D92D20"
typography:
  headline-display:
    fontFamily: SF Pro Display
    fontSize: 56px
    fontWeight: 700
    lineHeight: 67px
    letterSpacing: 0px
  headline-lg:
    fontFamily: SF Pro Display
    fontSize: 47px
    fontWeight: 600
    lineHeight: 60px
    letterSpacing: -0.28px
  headline-md:
    fontFamily: SF Pro Display
    fontSize: 40px
    fontWeight: 600
    lineHeight: 44px
    letterSpacing: 0px
  headline-sm:
    fontFamily: SF Pro Text
    fontSize: 33px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: 0px
  body-lg:
    fontFamily: SF Pro Display
    fontSize: 28px
    fontWeight: 400
    lineHeight: 42px
    letterSpacing: 0.196px
  body-md:
    fontFamily: SF Pro Text
    fontSize: 17px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0px
  body-sm:
    fontFamily: SF Pro Text
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0px
  label-lg:
    fontFamily: SF Pro Text
    fontSize: 17px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0px
  label-md:
    fontFamily: SF Pro Text
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0px
  label-sm:
    fontFamily: SF Pro Text
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.02em
  nav-sm:
    fontFamily: SF Pro Text
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0px
  caption:
    fontFamily: SF Pro Text
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0px
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 12px
  md: 20px
  lg: 58px
  xl: 70px
  gutter: 24px
  section: 80px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    padding: "11px 21px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-60}"
    textColor: "{colors.neutral}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    padding: "11px 21px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    padding: "11px 21px"
    height: "44px"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "0px"
  card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "16px"
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.tertiary}"
    typography: "{typography.nav-sm}"
---
# Apple Clean Light

## Overview
This system feels polished, quiet, and highly disciplined, with a premium consumer-tech tone rather than a playful or experimental one. The layout is spacious and editorial, letting large visuals and short headlines carry the message. It suits a broad audience that expects clarity, speed, and trust.

## Colors
- **Primary (#0071E3):** Apple blue used for the strongest calls to action and important interactive states. It is vivid but controlled, standing out against the otherwise neutral interface.
- **Secondary (#0066CC):** A slightly deeper link blue for secondary actions and navigational affordances. It supports interaction without competing with the primary accent.
- **Tertiary (#1D1D1F):** The core text color, a near-black ink that gives headlines and body copy strong readability.
- **Neutral (#FFFFFF):** The main background and button base color, creating the cleanest possible canvas.
- **Surface (#F5F5F7):** A soft off-white used for gentle section separation and card-like backgrounds when needed.
- **On-surface (#1D1D1F):** The default foreground color on light surfaces, maintaining Apple’s crisp contrast.
- **Muted (#6E6E73):** For less prominent supporting information, metadata, or inactive labels.
- **Border (#E5E7EB):** A very light hairline border for subtle delineation without adding visual weight.
- **Error (#D92D20):** Reserved for validation or destructive feedback; it should remain rare and highly legible.

## Typography
The type system is led by SF Pro Display for large headlines and SF Pro Text for smaller UI and navigation text. Headlines are bold to semibold and highly restrained, with only slight negative tracking in the largest display styles to keep them airy but compact. Body copy stays comfortable and readable, and labels remain compact without uppercase treatment; the overall feel is sentence case and understated rather than shouted.

## Layout
The layout is built around centered, full-width hero sections with generous vertical breathing room and narrow, focused text columns. Spacing follows a stepped rhythm using 4px, 12px, 20px, 58px, and 70px increments, which creates calm separation between navigation, hero, and promotional blocks. Buttons and cards should feel lightly padded and avoid crowded compositions; the system prefers large visual areas over dense grids.

## Elevation & Depth
Depth is intentionally minimal. Most surfaces are flat, relying on contrast, whitespace, and subtle borders instead of heavy shadows. When elevation is needed, it should remain soft and sparse, like a light card boundary rather than a dramatic floating treatment.

## Shapes
The shape language is smooth and approachable, with rounded pills for interactive controls and modest 8px radii for cards and panels. Buttons are especially soft, often using a full radius that reads as polished and friendly. Overall, the system balances precision with softness, avoiding sharp corners on major interactive elements.

## Components
Buttons are highly recognizable: primary buttons use `button-primary` with a solid blue fill, white text, 44px height, and pill rounding. Secondary buttons use `button-secondary` with a white background and blue outline/text, while tertiary actions should remain text-like and minimally framed using `button-tertiary`. Hover states should increase tonal clarity rather than add shadow or motion-heavy effects.

Cards should use `card` with a white background, a 1px light border, and 8px radius. Keep card padding modest and content-led; cards are containers, not featured objects. Inputs should match this restraint with white fills, subtle borders, rounded corners, and 44px minimum height for comfortable touch targets.

Navigation links should remain lightweight and text-forward, using `nav-link` styling with small SF Pro Text sizing and no decorative treatment unless active. Chips, badges, and compact affordances should feel pill-shaped and lightly tinted, never loud. Avoid ornate tooltips, deep shadows, or complex list treatments; the component set should stay simple, precise, and immediately usable.

## Do's and Don'ts
- Do keep interfaces spacious, centered, and content-first.
- Do use the primary blue sparingly for the most important actions.
- Do favor SF Pro Display for hero headlines and SF Pro Text for UI controls.
- Do preserve pill-shaped buttons and restrained 8px card radii.
- Don't add heavy shadows, gradients, or textured surfaces.
- Don't use multiple accent colors for competing actions.
- Don't crowd sections with dense grids or tight vertical rhythm.
- Don't turn labels or navigation into loud, uppercase, or heavily tracked text.