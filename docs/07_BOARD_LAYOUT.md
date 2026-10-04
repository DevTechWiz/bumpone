# BumpOne.lol — Board Layout

## Goal

Create a visually hierarchical wall where rank directly affects visual prominence.

The wall is NOT a conventional leaderboard. It is a dynamic visual arena.

---

# The Bumped Wall

The wall is the primary visual identity of BumpOne.lol.

### Global Board

```text
#1 → #100
```

### Category Board

```text
AI
#1 → #100

Design
#1 → #100

Creators
#1 → #100
```

Category rankings are derived from the same Active Value system.

No separate category currencies.

No category-specific inflation.

The same profile may have:

```text
Global: #18
AI:     #3
```

Layout example:

        #1
     HUGE TILE

   #2    #3    #4

 #5 #6 #7 #8 #9 ...

When someone bumps into a higher position, the wall visibly rearranges and tiles shift positions.

---

# Rank Groups (Concentric Tiers — Adopted)

The wall uses a concentric grid: the #1 citadel at center, elites ringing it, remaining ranks radiating outward by distance from center. All tiles keep natural square proportions (no stretched dominoes).

## Rank #1 — Supreme King (Hero Citadel)

Central sovereign anchor (3×3 units in mobile/desktop mosaic). Dramatically larger than all other tiles, with gold accent treatment and coronation spotlight.

## Ranks #2–#5 — Champions

Four cardinal 2×2 anchor tiles (North, South, East, West) framing the King, purple accent treatment.

## Ranks #6–#15 — Elite Council

Ten inner-ring display cards with glowing sky-blue accents.

## Ranks #16–#40 — Vanguard

Twenty-five mid-tier cards with emerald borders.

## Ranks #41–#100 — Perimeter Contenders

Sixty single-cell outer cards with subtle border treatment, ending at the #100 Drop Brink.

## Rank #101+ — The Graveyard (Billboard Archive)

Profiles displaced past rank #100 are archived in the **Billboard Archive**. Their profiles, metrics, and active values are preserved permanently. A 1-click **"Reclaim Turf"** button allows them to calculate the top-up needed to re-enter the live Top 100.

## Layout Geometry

Landscape: 16 cols × 12 rows (king at rows 4–7, cols 6–9). Portrait: 12 cols × 16 rows. Total: 16 + 48 + 87 = 151 units. Rankings beyond #100 are never laid out; category views re-rank onto the identical geometry.

---

# Important

These are visual guidelines, not a rigid CSS requirement.

The wall should be allowed to use a custom layout if it produces a stronger visual result.

---

# Desktop

The wall should occupy the majority of the viewport.

The first-ranked profile should be immediately obvious.

The wall should feel dense and alive.

---

# Mobile

Use a dedicated mobile composition.

Do not force a 10x10 desktop grid into a narrow viewport.

The wall should feel native on mobile.

---

# Ranking Hierarchy

Visual prominence should generally decrease with rank.

However:

The wall should remain visually dense and interesting.

---

# Infinite Backend

The layout only receives:

rank <= 100

The frontend should never attempt to render thousands of profiles.

---

# Empty Positions

During initial growth, empty positions can be represented subtly.

Do not make empty spaces visually dominate the experience.

Possible treatment:

"Your spot could be here."

---

# Full Board

When top 100 are occupied, the wall should visually feel dense.

A new bump should cause a visible cascade.

---

# Category Views

Category views use the same wall layout as the global view.

The category name should be displayed above the wall when viewing a category.

The visual hierarchy remains the same: higher rank = larger tile.

A category badge should appear on each profile tile.

When a category has fewer than 100 profiles, empty positions can be represented subtly.

Do not make the category view feel different from the global view. The wall layout should be consistent.

---

# Tile Content

Each profile tile contains:

- image (primary)
- rank
- optional name
- category badge
- reaction counts (🔥, 👀, ❤️, 😂)

Lower-ranked tiles minimize text.

The wall is image-first.

---

# Live Feed Placement

The live bump feed should be positioned alongside or below the wall.

It should be visible without scrolling on desktop.

On mobile, it can be positioned below the wall.

The feed should not obstruct the wall view.
