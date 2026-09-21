# Bumped.lol — Board Layout

## Goal

Create a visually hierarchical wall where rank directly affects visual prominence.

The wall is NOT a conventional leaderboard. It is a dynamic visual arena.

---

# The Bumped Wall

The wall is the primary visual identity of Bumped.lol.

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

## Rank #1 — Supreme King

4×4 central citadel (16 units). Dramatically larger than all other tiles, with gold accent treatment.

## Ranks #2–#13 — Inner Orbit Elites

Twelve 2×2 tiles (4 units each) directly adjacent to the citadel, silver/platinum treatment.

## Ranks #14–#50 — Mid-Orbit Vanguard

1×1 tiles ordered radially by distance from center, ash/grey treatment.

## Ranks #55–#99 — Perimeter Contenders

1×1 outer-ring tiles, same geometry, quieter treatment.

## Rank #100 — Drop Brink

1×1 tile with crimson beacon treatment: the next climb pushes #100 off the wall (profile kept off-board, never deleted).

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
