# BumpOne.lol — UI/UX Specification

## Design Direction

BumpOne.lol should feel:

- internet-native
- playful
- competitive
- visually addictive
- premium enough to trust with payment
- slightly chaotic
- immediately understandable
- like a living visual arena

Avoid:

- corporate SaaS design
- generic dashboards
- excessive gradients
- complicated navigation
- excessive text
- traditional advertising aesthetics
- static leaderboard feel

---

# The Bumped Wall

The primary experience is a dynamic visual wall where rank controls visual prominence.

The wall is NOT a conventional leaderboard. It is a visually hierarchical grid.

Layout example:

        #1
     HUGE TILE

   #2    #3    #4

 #5 #6 #7 #8 #9 ...

When someone bumps into a higher position, the wall visibly rearranges and tiles shift positions.

The visual wall is core product identity, not UI decoration.

---

# Homepage

Primary sections:

1. Header
2. Hero/message
3. Category navigation
4. The Bumped Wall (live board)
5. Live Bump Feed
6. Take Your Spot CTA
7. How It Works
8. Footer

---

# Header

Logo:

BUMPED.LOL

Navigation:

- Board
- How It Works
- Activity

Primary CTA:

TAKE YOUR SPOT

---

# Hero

Possible messaging:

"How high can you climb?"

or

"Buy a spot. Bump the rest."

Avoid explaining every rule in the hero.

---

# Category Navigation

Display category tabs above the wall:

All | AI | Apps | Websites | Creators | Games | Design | Tech

The "All" tab shows the global wall (default view).

Clicking a category tab filters the wall to show only profiles in that category.

The category tab should show the user's rank in that category if they are in the top 100.

Do not show dozens of tabs. Keep the category list concise.

---

# The Bumped Wall (Board)

The wall is the primary visual element.

Do not make it look like a conventional 100-cell spreadsheet.

Use:

- variable tile sizes based on rank
- strong rank hierarchy
- animated movement when positions change
- image-first presentation
- visible category badges on tiles

---

# Tile

Each profile tile contains:

- image
- rank
- optional name
- current active value
- category badge
- reaction counts (🔥, 👀, ❤️, 😂)

Lower-ranked tiles minimize text.

The category badge is subtle but visible (small pill or icon).

---

# Hover

Desktop hover shows:

- global rank
- category rank
- active value
- profile name
- destination preview
- category
- reaction counts

---

# Live Bump Feed

A real-time activity feed displayed alongside or below the wall.

Shows bump events:

🔥 Alex bumped #17 → #4
💥 Nova entered at #23
🚀 Sam took #1
↘ 31 profiles moved down

The feed updates in real time after successful purchases.

Clicking an event opens the profile passport.

---

# Users Below #100

Users pushed below #100 remain in the system and can climb back into the visible top 100.

The UI must support:

1. **Profile search**: Users can search for any profile by name, even if below #100.
2. **Passport access**: Anyone can view a profile's passport via direct URL (e.g., `/profile/:id`).
3. **Rank journey**: Below-100 profiles can view their full rank history and see their position relative to #100.
4. **Climb-back notification**: When a below-100 user purchases and re-enters the top 100, they receive a notification.
5. **Category visibility**: A user may be below #100 globally but still appear in their category's top 100 if their category rank is high enough.

Do NOT show below-100 profiles on the main homepage wall.

Do NOT delete or hide below-100 profiles from the system.

---

# Post-Bump Result Screen

After successful payment, a result screen appears:

You're now #12

You just moved above 38 profiles.

Shows:

- Previous rank → New rank
- Number of profiles displaced
- New active value
- Share button
- Close button

The result feels like an event, not a generic payment confirmation.

---

# Shareable Bump Moment

After a successful bump, a shareable visual card is generated:

I just bumped to #7 on BumpOne.lol

46 profiles moved.

The card:

- Matches the Bumped Wall visual identity
- Shows new rank and profiles displaced
- Includes BumpOne.lol branding
- Is publicly accessible via URL
- Can be shared to social platforms

---

# Social Reactions

Visitors can react to profiles with emoji reactions.

Available reactions:

🔥 fire
👀 eyes
❤️ heart
😂 laugh

Reaction counts displayed on profile tiles.

Reactions NEVER change rank.
Reactions NEVER affect Active Value.

Rate-limited to prevent abuse.

---

# Bumped Passport (Profile Journey)

Each profile has a permanent public profile page.

Passport shows:

- Profile image
- Display name
- Category
- Peak Rank
- Current Rank
- Current Active Value
- Joined date
- Times Bumped
- Times Climbed
- Profile Views
- Full Rank Journey visualization
- Reaction counts

The profile's ranking journey becomes part of its identity.

---

# Mobile

The wall must remain usable on mobile.

Do not simply shrink the desktop grid.

Create a responsive composition.

The wall should feel native on mobile.

---

# Purchase UI

The purchase experience shows:

Current position

Current active value

New position preview

Top-up amount

Image upload

Destination URL

Category selection

Checkout CTA

---

# Pre-Payment Disclosures

Before payment, users should be able to understand:

* current active value
* amount they are paying now
* resulting active value
* expected resulting rank
* that another user can subsequently move above them
* that ranking is dynamic
* that payment is for ranking/visibility service
* the applicable refund policy
* that the shown expected rank is a 10-minute quote and the final position is recomputed at payment confirmation if the board moved

Do not hide important pricing/ranking behavior in small print.

---

# Confirmation

After successful payment:

"YOU'RE IN."

Then trigger the bump animation and show the post-bump result screen.

---

# Bump Animation

The UI should visually show:

new profile entering the wall

↓

target position highlights

↓

existing tiles shift positions

↓

lower profiles cascade downward

↓

profile leaving top 100 exits the visible wall

↓

wall settles

↓

bump event appears in live feed

↓

post-bump result screen appears

---

# Active Value Display

Active values should be visible but secondary to the visual identity.

Example:

#37
$60

In category view, also show global rank if different.

---

# Rules

Keep detailed rules behind:

HOW IT WORKS

Do not force users to understand the database model.

---

# Accessibility

Must support:

- keyboard navigation
- readable contrast
- alt text
- focus states
- reduced motion preference
- accessible buttons
- screen reader labels
