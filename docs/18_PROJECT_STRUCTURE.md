# Bumped.lol — Project Structure

Recommended:

src/
├── app/
│   ├── page.tsx
│   ├── how-it-works/
│   ├── profile/
│   ├── purchase/
│   └── api/
│       ├── board/
│       ├── purchase/
│       ├── profile/
│       ├── reports/
│       └── webhooks/
│
├── components/
│   ├── board/
│   ├── profile/
│   ├── purchase/
│   ├── activity/
│   └── ui/
│
├── lib/
│   ├── supabase/
│   ├── stripe/
│   ├── ranking/
│   ├── pricing/
│   ├── moderation/
│   └── validation/
│
├── types/
│
└── styles/

supabase/
├── migrations/
├── functions/
└── seed/

docs/