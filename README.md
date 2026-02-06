# DARQ Credit Protocol v2

**Facilitator Architecture — P2P Credit Lending on XRPL**

A peer-to-peer credit lending marketplace built entirely from native XRPL transaction primitives. The protocol matches borrowers with lenders, orchestrates transaction flows, and monitors for defaults — but never holds or intermediates capital. All funds flow directly between participants.

```
                    ┌─────────────────────────┐
                    │   DARQ Credit Protocol   │
                    │                         │
                    │   Holds: ZERO capital    │
                    │   Role:  Matchmaker      │
                    │   Risk:  Non-custodial   │
                    └─────────────────────────┘
```

---

## Protocol Architecture

```mermaid
graph TB
    subgraph PROTOCOL["DARQ Protocol (Facilitator)"]
        PI[Protocol Issuer<br/><i>Issues dCREDIT, dRECEIPT, dSCORE</i>]
        LE[Liquidation Engine<br/><i>Seizes collateral on default</i>]
        TR[Treasury<br/><i>Collects fees & bonuses</i>]
        OR[Oracle Committee<br/><i>Price & utilization feeds</i>]
    end

    subgraph LENDERS["Three-Tier Lending Pools"]
        LC[Conservative Lender<br/><b>3% APR</b> — 20 XRP]
        LB[Balanced Lender<br/><b>5% APR</b> — 30 XRP]
        LA[Aggressive Lender<br/><b>8% APR</b> — 15 XRP]
    end

    subgraph BORROWER_SIDE["Borrower"]
        BW[Borrower Account<br/><i>Receives loan, posts collateral</i>]
    end

    subgraph VAULT["Blackholed Vault (Per-Loan)"]
        CV[Collateral Vault<br/><i>Permanently immutable</i>]
        HE[Hash-Locked Escrow<br/><i>60% collateral return</i>]
        LT[Liquidation Trigger<br/><i>Time-locked escrow</i>]
        SO[Standing DEX Offer<br/><i>Liquidation price</i>]
    end

    LC -->|"Direct XRP"| BW
    LB -->|"Direct XRP"| BW
    LA -->|"Direct XRP"| BW

    BW -->|"CheckCreate"| LC
    BW -->|"CheckCreate"| LB
    BW -->|"CheckCreate"| LA

    BW -->|"Collateral XRP"| CV
    CV --- HE
    CV --- LT
    CV --- SO

    PI -.->|"dCREDIT"| BW
    PI -.->|"dRECEIPT"| LC
    PI -.->|"dRECEIPT"| LB
    PI -.->|"dRECEIPT"| LA
    PI -.->|"dSCORE"| BW

    HE -->|"On repay"| BW
    LT -->|"On default"| LE
    SO -->|"On default"| LE

    style PROTOCOL fill:#1a1a2e,stroke:#e94560,color:#fff
    style LENDERS fill:#16213e,stroke:#0f3460,color:#fff
    style BORROWER_SIDE fill:#1a1a2e,stroke:#e94560,color:#fff
    style VAULT fill:#0f3460,stroke:#533483,color:#fff
    style CV fill:#533483,stroke:#e94560,color:#fff
```

---

## Financial Engineering

### The Core Mechanism: CheckCreate/CheckCash

XRPL Checks are pre-authorized payment pulls. The borrower signs a `CheckCreate` at loan origination, granting each lender the right to pull their proportional repayment at any time. The borrower does not participate in the collection — the lender calls `CheckCash` unilaterally.

This inverts the trust model: instead of trusting borrowers to repay voluntarily, lenders hold an irrevocable authorization to collect.

```mermaid
sequenceDiagram
    participant B as Borrower
    participant L1 as Conservative<br/>Lender (3%)
    participant L2 as Balanced<br/>Lender (5%)
    participant L3 as Aggressive<br/>Lender (8%)
    participant P as Protocol<br/>Issuer

    Note over B,P: ORIGINATION

    L1->>B: 13.85 XRP (direct transfer)
    L2->>B: 20.77 XRP (direct transfer)
    L3->>B: 10.38 XRP (direct transfer)

    Note over B: Total received: 45 XRP

    B->>L1: CheckCreate (13.86 XRP)
    B->>L2: CheckCreate (20.78 XRP)
    B->>L3: CheckCreate (10.39 XRP)

    P->>B: 45 dCREDIT (debt token)

    Note over B,P: MATURITY — FORCED COLLECTION

    B->>P: Return 45 dCREDIT (debt cleared)

    Note over L1,L3: Lenders act independently.<br/>Borrower does NOT participate.

    L1->>L1: CheckCash 13.86 XRP ✓
    L2->>L2: CheckCash 20.78 XRP ✓
    L3->>L3: CheckCash 10.39 XRP ✓

    Note over L1,L3: Total collected: 45.03 XRP<br/>Borrower cooperation: NONE
```

### Three-Tier Weighted Average Pricing

Loans are filled pro-rata across three risk-tiered pools. Each lender contributes proportionally to their available balance, producing a blended interest rate:

```
Weighted Rate = Σ(Lender_Amount × Lender_Rate) / Total_Loan

Example — 45 XRP loan:
  Conservative: 13.85 XRP × 3.0% = 0.4155
  Balanced:     20.77 XRP × 5.0% = 1.0385
  Aggressive:   10.38 XRP × 8.0% = 0.8304
                                    ──────
  Weighted Rate = 2.2844 / 45 = 5.08% blended APR
```

Each lender receives their own isolated Check. No commingling, no shared pool risk. The conservative lender's 3% return is unaffected by whether the aggressive lender's 8% position performs.

### Blackholed Vault — Immutable Collateral Custody

```mermaid
graph TD
    subgraph CREATION["Vault Creation (Mutable Phase)"]
        F[Fund Fresh Account] --> TL[Set Trustlines]
        TL --> DC[Deposit Collateral<br/><b>90 XRP</b>]
        DC --> DA[Enable DepositAuth]
        DA --> DP1[DepositPreauth Borrower]
        DP1 --> DP2[DepositPreauth Liquidation Engine]
        DP2 --> E1[EscrowCreate: Hash-Locked<br/><b>54 XRP</b> — 60% collateral<br/><i>PREIMAGE-SHA-256 + time-lock</i>]
        E1 --> E2[EscrowCreate: Liquidation Trigger<br/><b>5 XRP</b> — time-lock only]
        E2 --> OF[OfferCreate: Standing DEX Offer<br/><b>19 XRP</b> for dCREDIT]
    end

    subgraph BLACKHOLE["Blackholing (Irreversible)"]
        OF --> SK[SetRegularKey<br/><code>rrrrrrrrrrrrrrrrrrrrBZbvji</code>]
        SK --> DM[AccountSet: DisableMasterKey<br/><b>PERMANENT — NO UNDO</b>]
    end

    subgraph IMMUTABLE["Post-Blackhole State (Consensus-Enforced)"]
        DM --> IM1["Hash-Locked Escrow<br/><i>Only released with SHA-256 preimage</i>"]
        DM --> IM2["Liquidation Trigger Escrow<br/><i>Only finishable after time-lock</i>"]
        DM --> IM3["Standing DEX Offer<br/><i>Only crossable with dCREDIT</i>"]
        DM --> IM4["❌ No new transactions possible<br/><i>Keys are destroyed</i>"]
    end

    style CREATION fill:#16213e,stroke:#0f3460,color:#fff
    style BLACKHOLE fill:#e94560,stroke:#fff,color:#fff
    style IMMUTABLE fill:#0f3460,stroke:#533483,color:#fff
```

After blackholing, no human, key, or protocol upgrade can alter the vault. The pre-programmed escrows and offers execute according to their conditions — enforced by XRPL consensus, not by trust.

### Dual-Enforcement Collateral Release

Collateral return requires two independent verifications:

1. **Application layer**: Borrower's `dCREDIT` balance must equal zero (all debt tokens returned to protocol issuer, verifiable via `account_lines`)
2. **Consensus layer**: Borrower must reveal the SHA-256 preimage that satisfies the escrow's cryptographic condition (`EscrowFinish` with `Fulfillment`)

The preimage is only revealed after on-chain debt clearance is confirmed. Neither condition alone is sufficient.

### Liquidation: Graceful Degradation

```mermaid
sequenceDiagram
    participant OR as Oracle
    participant L1 as Conservative<br/>Lender
    participant L2 as Balanced<br/>Lender
    participant L3 as Aggressive<br/>Lender
    participant LE as Liquidation<br/>Engine
    participant V as Blackholed<br/>Vault
    participant TR as Treasury

    Note over OR: XRP/USD crashes<br/>$2.50 → $1.00

    Note over L1,L3: STEP 1: Attempt Check Collection

    L1->>L1: CheckCash 13.86 XRP ✓ SUCCESS
    L2->>L2: CheckCash 20.78 XRP ✗ tecPATH_PARTIAL
    L3->>L3: CheckCash 10.39 XRP ✗ tecPATH_PARTIAL

    Note over L1,L3: Recovery: 30.8% (13.86 / 45.03 XRP)<br/>Shortfall: 31.17 XRP

    Note over LE,V: STEP 2: Collateral Seizure

    LE->>V: EscrowFinish (liquidation trigger)
    LE->>V: Cross standing DEX offer<br/>(seize collateral with dCREDIT)

    Note over LE,TR: STEP 3: Distribute Recovery

    LE->>L2: 72.00 XRP (proportional share)
    LE->>L3: 36.00 XRP (proportional share)
    LE->>TR: 2.00 XRP (liquidation bonus)

    Note over L1,TR: All lenders made whole.<br/>Credit score: 700 → 600 (Clawback)
```

When CheckCash fails (`tecPATH_PARTIAL` — borrower drained account), the protocol doesn't stop. It:

1. Records which Checks succeeded and which failed
2. Calculates the shortfall
3. Seizes collateral from the blackholed vault via the standing DEX offer
4. Distributes recovered XRP proportionally to underpaid lenders
5. Penalizes the borrower's credit score via `Clawback` (-100 dSCORE)

---

## Token System

| Token | Encoding | Purpose |
|-------|----------|---------|
| **dCREDIT** | `6443524544495400000000000000000000000000` | Debt obligation. Issued at origination, returned at repayment. Non-zero balance = outstanding debt. |
| **dRECEIPT** | `6452454345495054000000000000000000000000` | Lender deposit receipt. 1:1 for each XRP committed. Proves lending position. |
| **dSCORE** | `6453434F52450000000000000000000000000000` | On-chain credit score. Starts at 700. +50 on-time repay. -100 (Clawback) on liquidation. |

All tokens are issued by the Protocol Issuer with `asfAllowTrustLineClawback` enabled, allowing the protocol to enforce credit penalties.

---

## Complete Lifecycle Flow

```mermaid
graph LR
    subgraph INIT["1. Initialize"]
        I1[Fund 8 Accounts] --> I2[Configure Issuer<br/><i>Clawback + DefaultRipple</i>]
        I2 --> I3[Establish 10 Trustlines]
        I3 --> I4[Access Control<br/><i>DepositAuth + Preauth</i>]
        I4 --> I5[Oracle Feeds]
    end

    subgraph DEPOSIT["2. Lender Deposits"]
        D1[Issue dRECEIPT] --> D2[Mint Position NFT]
        D2 --> D3[Transfer NFT to Lender]
    end

    subgraph BORROW["3. Borrow"]
        B1[Credit Assessment<br/><i>dSCORE check</i>] --> B2[Pool Matching<br/><i>Pro-rata allocation</i>]
        B2 --> B3[Create & Blackhole Vault<br/><i>Escrows + DEX offer</i>]
        B3 --> B4[Direct Lending<br/><i>Lender → Borrower</i>]
        B4 --> B5[CheckCreate × 3<br/><i>Forced repayment setup</i>]
        B5 --> B6[Issue dCREDIT<br/><i>Debt token</i>]
    end

    subgraph RESOLVE["4. Resolution"]
        R1{Borrower<br/>Repays?}
        R1 -->|Yes| R2[Return dCREDIT<br/>Lenders CheckCash<br/>Release Collateral<br/><b>+50 dSCORE</b>]
        R1 -->|No| R3[Attempt CheckCash<br/>Seize Collateral<br/>Distribute Recovery<br/><b>-100 dSCORE</b>]
    end

    INIT --> DEPOSIT --> BORROW --> RESOLVE

    style INIT fill:#16213e,stroke:#0f3460,color:#fff
    style DEPOSIT fill:#1a1a2e,stroke:#e94560,color:#fff
    style BORROW fill:#0f3460,stroke:#533483,color:#fff
    style RESOLVE fill:#533483,stroke:#e94560,color:#fff
```

---

## Transaction Primitives

Every operation uses native XRPL transaction types. No smart contracts, no VM, no external dependencies.

| Primitive | Protocol Usage |
|-----------|---------------|
| `CheckCreate` / `CheckCash` | Forced repayment — lenders pull without borrower |
| `EscrowCreate` + `PREIMAGE-SHA-256` | Hash-locked collateral return |
| `EscrowCreate` (time-locked) | Liquidation trigger mechanism |
| `EscrowFinish` + `Fulfillment` | Collateral release with preimage reveal |
| `SetRegularKey` + `DisableMasterKey` | Permanent vault blackholing |
| `OfferCreate` | Standing liquidation DEX offer |
| `Clawback` | Credit score penalty enforcement |
| `DepositPreauth` | Access control on Treasury and vault |
| `NFTokenMint` / `NFTokenAcceptOffer` | Position records (Loan, Repayment, Liquidation) |
| `TrustSet` + `Payment` (tokens) | dCREDIT, dRECEIPT, dSCORE issuance |
| `OracleSet` | Price and utilization feeds |

---

## Running the Protocol

### Prerequisites

- Node.js v18+
- XRPL Testnet access (no API keys needed)

### Install

```bash
npm install
```

### Demo Modes

```bash
# Happy path: borrow → forced repayment → collateral release
node src/demo.js repay

# Default path: borrow → drain → partial check recovery → collateral seizure
node src/demo.js liquidate
```

### Step-by-Step Execution

```bash
node src/index.js init        # Fund accounts, configure trustlines
node src/index.js deposit     # Register 3 lenders across tiers
node src/index.js borrow      # Originate 45 XRP loan
node src/index.js repay       # Force-collect via Checks + release collateral
node src/index.js liquidate   # Attempt Checks + seize collateral
```

---

## Project Structure

```
├── package.json
├── src/
│   ├── config.js              # Constants, currency codes, pool tiers
│   ├── utils/
│   │   ├── tx.js              # submitTx(), ledger time, wait utilities
│   │   ├── state.js           # Balance queries, Check/NFT/Escrow lookups
│   │   ├── crypto.js          # PREIMAGE-SHA-256 condition generation
│   │   └── pools.js           # Pro-rata allocation, weighted average
│   ├── flows/
│   │   ├── initialize.js      # Fund 8 accounts, trustlines, access control
│   │   ├── deposit.js         # Register lenders, issue dRECEIPT + NFTs
│   │   ├── borrow.js          # Pool matching, vault, direct lending, Checks
│   │   ├── repay.js           # dCREDIT return, forced Check collection, escrow release
│   │   ├── liquidate.js       # Check attempts, collateral seizure, distribution
│   │   └── summary.js         # Final protocol state display
│   ├── index.js               # Step-by-step CLI runner
│   └── demo.js                # Full lifecycle: repay or liquidate mode
```

---

## Testnet Results

Both lifecycle modes verified on XRPL Testnet (`wss://s.altnet.rippletest.net:51233`):

**Repay Mode:**
- 3/3 CheckCash: `tesSUCCESS` (45.03 XRP collected, zero borrower cooperation)
- EscrowFinish with SHA-256 fulfillment: `tesSUCCESS` (54 XRP collateral released)
- Credit score: 700 → 750

**Liquidation Mode:**
- 1/3 CheckCash: `tesSUCCESS` (13.86 XRP), 2/3: `tecPATH_PARTIAL` (borrower drained)
- Collateral seized via DEX offer crossing: `tesSUCCESS`
- Recovered XRP distributed to unpaid lenders: `tesSUCCESS`
- Clawback 100 dSCORE: `tesSUCCESS` (700 → 600)

---

## Dependencies

```json
{
  "xrpl": "^4.2.0",
  "five-bells-condition": "^5.0.1"
}
```

---

## License

Copyright (c) 2026 DARQ Labs LLC. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, modification, or use of this software, in whole or in part, is strictly prohibited without prior written permission from DARQ Labs.
