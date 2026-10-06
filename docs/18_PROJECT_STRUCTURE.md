# BumpOne.lol — Project Structure

Actual implementation layout (repository root, no `web/` wrapper):

```text
.
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # landing / board page (HomePageClient)
│   │   ├── HomePageClient.tsx
│   │   ├── not-found.tsx
│   │   ├── opengraph-image.tsx
│   │   ├── profile/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx           # public profile passport
│   │   ├── project/[id]/
│   │   │   ├── page.tsx
│   │   │   └── ProjectShowcaseClient.tsx
│   │   ├── share/[id]/page.tsx
│   │   ├── admin/page.tsx
│   │   ├── contact/ | privacy/ | terms/ | refund/
│   │   └── api/
│   │       ├── board/route.ts
│   │       ├── profile/[id]/route.ts
│   │       ├── profile/check-handle/route.ts
│   │       ├── war-room/events/route.ts
│   │       ├── war-room/messages/route.ts
│   │       ├── purchase/create/route.ts
│   │       ├── webhooks/dodo/route.ts
│   │       ├── reactions/route.ts
│   │       ├── uploads/image/route.ts
│   │       ├── reports/route.ts
│   │       ├── auth/sync/route.ts
│   │       └── admin/
│   │           ├── overview/route.ts
│   │           ├── moderate/route.ts
│   │           └── emergency/route.ts
│   ├── components/
│   │   ├── GridBoard.tsx
│   │   ├── GridFilterBar.tsx
│   │   ├── TakeOverModal.tsx
│   │   ├── SlotDetailModal.tsx
│   │   ├── ProfileView.tsx
│   │   ├── WarRoomDrawer.tsx
│   │   ├── GraveyardDrawer.tsx
│   │   ├── LeaderboardModal.tsx
│   │   ├── RadarMiniMap.tsx
│   │   ├── ReactionCanvas.tsx
│   │   ├── BumpNotification.tsx
│   │   ├── BumpResultModal.tsx
│   │   ├── AlertSettingsModal.tsx
│   │   ├── AuthModal.tsx
│   │   ├── GoogleOneTap.tsx
│   │   ├── UserMenu.tsx
│   │   ├── RulesModal.tsx
│   │   ├── CosmicBackground.tsx
│   │   └── ui/                         # Avatar, Badge, Button, Card, Drawer, GridCell, Input, Modal, Skeleton, SocialIcons, StatDisplay, tokens
│   └── lib/
│       ├── supabase/                   # client.ts, server.ts, admin.ts
│       ├── adminAuth.ts
│       ├── board.ts
│       ├── boardCache.ts
│       ├── boardClient.ts
│       ├── boardLayout.ts
│       ├── dodo.ts
│       ├── getBoard.ts
│       ├── getProject.ts
│       ├── imageOptimization.ts
│       ├── r2.ts
│       ├── rateLimit.ts
│       ├── slotTypes.ts
│       ├── sound.ts
│       ├── storage.ts
│       ├── urls.ts
│       ├── useAuth.ts
│       └── userSync.ts
│
├── supabase/
│   └── migrations/                     # 001..016 (source of truth; never edit applied migrations)
│       ├── 001_initial_schema.sql
│       ├── ...
│       └── 016_drop_image_positioning_and_frame.sql
│
├── docs/                               # numbered specification documents
├── vitest.config.ts                    # tests run from src/__tests__ (npx tsc --noEmit && npm test)
├── next.config.ts
├── open-next.config.ts                 # Cloudflare Workers build (OpenNext)
├── wrangler.jsonc                      # Workers deploy config (bumpone-assets R2 binding)
└── AGENTS.md
```

Removed relative to earlier planning docs (do not reintroduce):

- `src/app/api/categories/route.ts` — categories are static config, not an endpoint.
- `src/app/api/profile/[id]/journey/route.ts` — journey is embedded in the profile response.
- `src/app/api/bump-feed/route.ts` — replaced by `/api/war-room/events`.
- `src/lib/dodo/webhooks.ts` / `validation/schemas.ts` — folded into `src/lib/dodo.ts` and route-level Zod schemas.
- `supabase/seed/seed.sql` — seed data lives in `004_seed.sql`.
- `admin/pause` path — the emergency endpoint is `POST /api/admin/emergency`.
