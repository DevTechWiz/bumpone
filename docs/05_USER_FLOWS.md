# BumpOne.lol — User Flows

## Flow 1 — Visitor (Browsing, No Account Required)

```text
Open Bumped
→ Browse wall
→ Browse categories
→ View profile
→ View ranking history
```

No account required for ordinary browsing.

## Flow 1b — Visitor Decides to Act (Authentication Required)

When user wants to:

* create a profile
* claim a profile
* buy
* top-up
* edit their profile
* manage their purchases

require authentication.

Keep authentication lightweight.

Click TAKE YOUR SPOT
↓
Select position
↓
Upload image
↓
Enter destination link
↓
Review quoted top-up + expected rank
↓
Checkout
↓
Payment
↓
Success
↓
Watch bump animation
↓
Profile appears on board

---

# Flow 2 — Existing User

Visit site
↓
Find current profile
↓
See current rank
↓
See current active value
↓
Choose a higher position
↓
Purchase
↓
Existing profile is reinserted
↓
Ranking changes
↓
Board animates

---

# Flow 3 — User Falls Below #100

User currently #99.

Another purchase occurs above them.

User becomes #100.

Another purchase occurs above them.

User becomes #101.

Homepage:

User disappears.

User profile:

Still exists.

User can return and purchase another position.

---

# Flow 4 — Failed Payment

User selects position
↓
Checkout
↓
Payment fails/cancelled
↓
No ranking change
↓
No charge captured
↓
Return to board

---

# Flow 5 — User Profile

Click image
↓
Open profile/destination

The profile should clearly indicate:

- image
- display name
- current rank
- link
- optional purchase information

---

# Flow 6 — How It Works

Homepage
↓
HOW IT WORKS
↓
Short visual explanation

Do not expose the entire technical rule set on the first screen.

---

# Flow 7 — Category Browsing

Homepage (global board)
↓
Click category tab (e.g., AI, Apps, Design)
↓
Category board loads
↓
View top 100 profiles in that category
↓
Same visual hierarchy as global board
↓
Category badge shown on profile tiles

---

# Flow 8 — Category Selection During Purchase

Click TAKE YOUR SPOT
↓
Select position
↓
Upload image
↓
Enter destination link
↓
Select category from dropdown
↓
Review quoted top-up + expected rank
↓
Checkout
↓
Payment
↓
Success
↓
Profile appears in global board AND category board

---

# Flow 9 — Category Switching

User views their profile
↓
Sees current category
↓
Chooses to change category
↓
Selects new category
↓
Profile moves to new category ranking
↓
No payment required
↓
Active value unchanged
↓
Global rank unchanged

---

# Flow 10 — Post-Bump Result

Successful payment
↓
Post-bump result screen appears
↓
Shows: previous rank → new rank
↓
Shows: profiles displaced
↓
Shows: new active value
↓
Shows: share button
↓
User can share or close

---

# Flow 11 — Share Bump Moment

Post-bump result screen
↓
Click share button
↓
Shareable visual card generated
↓
Card shows: new rank, profiles moved, Bumped branding
↓
User copies link or shares to social platform
↓
Card is publicly accessible via URL

---

# Flow 12 — Social Reaction

Visitor views profile on wall
↓
Clicks reaction button (🔥, 👀, ❤️, 😂)
↓
Reaction count increments
↓
Reaction is recorded
↓
No effect on ranking
↓
Rate limit enforced

---

# Flow 13 — Bumped Passport

Visitor clicks profile on wall
↓
Opens Bumped Passport page
↓
Sees: profile image, name, category
↓
Sees: peak rank, current rank, active value
↓
Sees: times bumped, times climbed, profile views
↓
Sees: full rank journey visualization
↓
Sees: reaction counts
↓
Can share passport page

---

# Flow 14 — Live Bump Feed

Visitor views homepage
↓
Live bump feed visible on page
↓
New bump event appears in real time
↓
Event shows: display name, old rank → new rank
↓
Event shows: profiles displaced
↓
Clicking event opens profile passport

---

# Flow 15 — Purchase (Canonical)

```text
Choose / enter amount
→ Server calculates resulting rank
→ Show exact amount + expected rank (quote valid 10 minutes, informational)
→ Authenticate if necessary
→ Checkout
→ Provider confirms
→ Webhook verifies
→ Ranking recomputed against current board using amount paid
→ Wall moves
→ Bump result shown
```