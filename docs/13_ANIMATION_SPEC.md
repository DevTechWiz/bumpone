# BumpOne.lol — Animation Specification

## Animation Is Core Product Behavior

The bump should feel satisfying.

Do not instantly replace the wall.

The wall rearranging is the product experience.

---

# Purchase Animation Sequence

1. New buyer appears at target position.
2. Target position highlights.
3. New tile enters with entrance animation.
4. Existing tiles shift positions (wall rearranges).
5. Lower profiles cascade downward.
6. Profile leaving top 100 exits the visible wall with exit animation.
7. Wall settles into new state.
8. Active value labels update.
9. Bump event appears in live feed with entrance animation.
10. Post-bump result screen appears.

Visual consequence of a successful bump:

```text
New profile moves into position
↓
Existing tiles shift
↓
Affected profiles move downward
↓
Top-100 boundary changes if applicable
↓
Live activity event appears
```

The animation must not be the source of truth.

On reconnect or state mismatch, refresh from the server.

---

# Duration

Target:

600–1200ms

Avoid excessive animation duration.

The wall rearrange should feel physical and satisfying.

---

# Wall Rearrange Animation

The wall rearrange is the signature animation.

When a bump occurs:

- Tiles physically shift positions
- #1 tile grows/shrinks based on new occupant
- Displaced tiles slide downward
- Exiting tiles fade out at bottom
- New tile enters with bounce/highlight

The animation should feel like tiles are physically moving on a wall.

---

# Sound

Sound should be optional.

Default:

muted.

Potential sounds:

- bump impact sound
- tile slide sound
- success chime

---

# Reduced Motion

If prefers-reduced-motion is enabled:

Use instant/short transitions.

Do not remove functional updates.

Wall rearrange can be simplified to fade transitions.

---

# Microinteractions

Effects:

- tile bounce on bump
- rank number transition
- active value counter animation
- "BUMPED" indicator
- entrance highlight for new profile
- exit animation for displaced profile
- reaction button press feedback
- share card generation animation
- live feed event entrance animation

---

# Post-Bump Result Animation

After wall settles:

- Result screen slides in
- Rank number animates to new value
- Profiles displaced counter animates
- Share button appears with subtle animation

---

# Share Card Animation

When share button clicked:

- Card generates with visual effect
- Card appears with scale/fade animation
- Share options appear

---

# Important

Animation must never determine actual ranking.

It is purely presentation.

The wall rearrange should always feel satisfying but never misleading.
