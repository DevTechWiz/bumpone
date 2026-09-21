# Bumped.lol — Pricing System

## Core Principle

The ranking is determined by each user's `current_active_value`.

Higher active value = higher position.

Each user's active value carries forward and grows with each top-up.

---

## Initial Board State (Genesis Pricing)

Empty slots start with face values $1–$100:

#1   = $100
#2   = $99
#3   = $98
...
#100 = $1

These are the initial active values. They establish the starting ranking.

Once a slot is filled, every takeover adds +$10: `required_top_up = target_value - current_active_value + $10`, with the buyer's existing active value carrying forward.

---

## Active Value Carries Forward

A user's current active value acts as credit toward a higher position.

They do NOT have to repay their full value every time they bump upward.

Example:

User has active value $500.
Target #1 has active value $700.

Required top-up:

$700 - $500 + $10 = $210

New active value:

$500 + $210 = $710

User becomes #1.

---

## What `current_active_value` Is (and Is Not)

`current_active_value` is the user's current ranking value.

Important:

* It is NOT a wallet balance.
* It cannot be withdrawn.
* It cannot be transferred.
* It cannot be spent outside the ranking system.
* It only represents the user's current active ranking value.

When moving upward:

```text
required_top_up =
target_value - current_active_value + minimum_increment
```

Where `minimum_increment = $10` (whole USD only).

Example:

```text
Current Active Value = $500
Current #1 Value     = $700

Required top-up      = $210  ($700 - $500 + $10)
New Active Value     = $710
```

The user does not repay the original $500.

Historical purchases remain historical transaction records and are not separately reusable as additional credit.

> Minimum-amount rule: Bumped.lol always increases by **+$10** — a **$10** minimum entry value and **$10** minimum increment, whole USD only.

---

## Top-Up Formula

top_up = target_value - current_active_value + minimum_increment

Where minimum_increment = $10. Payments and active values use whole USD only.

The new active value must be strictly greater than the target's active value.

---

## Ranking Constraint

The ranking always satisfies:

active_value(#1) >= active_value(#2) >= active_value(#3) >= ...

The top-up formula guarantees a new purchase strictly exceeds its target. Residual equal values (e.g. after a refund rollback) are ordered by earliest rank-event sequence (monotonic `global_event_sequence`).

---

## Example

Initial state:

#1   $100
#2   $90
#3   $80
#4   $70
#5   $60

User (active value $0) pays $150:

#1   $150  ← new user
#2   $100
#3   $90
#4   $80
#5   $70
#6   $60

User (active value $0) pays $110:

#1   $150
#2   $110  ← new user
#3   $100
#4   $90
#5   $80
#6   $70
#7   $60

---

## Existing User Bumping Up

User has active value $100 at #3.
#1 has active value $700.

User wants to reach #1.

top_up = $700 - $100 + $10 = $610

New active value = $100 + $610 = $710

User becomes #1. Previous #1 becomes #2.

---

## What Changed From v2

v2 model: Payment-based ranking. Each user's paid amount determined their position. No active value carry-forward.

v3 model (current): Active Value + Top-Up. Each user's current active value carries forward. Top-ups increase the active value. Strict exceed required. No ties possible.

---

## Currency

MVP uses USD.

Currency architecture should remain extensible.

---

## Decimal Handling

Never use floating-point arithmetic for money.

Store monetary values as integer USD units for the MVP.

---

## Stripe Fees

Stripe/payment processing fees are separate from the Bumped ranking logic.

The ranking system operates on the amount the product defines as the purchase value.

Payment-provider fees must never alter ranking calculations.
