# BumpOne.lol — Project Structure

Recommended implementation layout:

```text
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── profile/[id]/page.tsx
│   │   ├── share/[id]/page.tsx
│   │   ├── purchase/result/page.tsx
│   │   ├── admin/page.tsx
│   │   └── api/
│   │       ├── board/route.ts
│   │       ├── categories/route.ts
│   │       ├── profile/[id]/route.ts
│   │       ├── profile/[id]/journey/route.ts
│   │       ├── bump-feed/route.ts
│   │       ├── purchase/create/route.ts
│   │       ├── webhooks/dodo/route.ts
│   │       ├── reactions/route.ts
│   │       ├── uploads/image/route.ts
│   │       ├── reports/route.ts
│   │       └── admin/
│   │           ├── overview/route.ts
│   │           ├── profiles/[id]/moderate/route.ts
│   │           └── emergency/pause/route.ts
│   ├── components/
│   │   ├── GridBoard.tsx
│   │   ├── TakeOverModal.tsx
│   │   ├── SlotDetailModal.tsx
│   │   ├── WarRoomDrawer.tsx
│   │   ├── GraveyardDrawer.tsx
│   │   ├── LeaderboardModal.tsx
│   │   ├── RadarMiniMap.tsx
│   │   ├── ReactionCanvas.tsx
│   │   ├── BumpNotification.tsx
│   │   └── ui/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── admin.ts
│   │   ├── dodo/
│   │   │   ├── client.ts
│   │   │   └── webhooks.ts
│   │   ├── board.ts
│   │   ├── boardLayout.ts
│   │   ├── sound.ts
│   │   ├── slotTypes.ts
│   │   └── validation/
│   │       └── schemas.ts
│   └── styles/
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_ranking_rpc.sql
│   │   └── 003_rls_policies.sql
│   └── seed/
│       └── seed.sql
│
└── docs/
```