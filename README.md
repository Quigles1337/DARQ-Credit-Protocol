# DARQ Credit Protocol v3

**AMM-Backed Overlender Architecture — P2P Credit Lending on XRPL**

A peer-to-peer credit lending marketplace built entirely from native XRPL transaction primitives. The Originator (Protocol Issuer) matches borrowers with lenders, orchestrates transaction flows, and handles default recovery — but never intermediates capital. All funds flow directly between participants via RLUSD Checks.

```
                    ┌─────────────────────────┐
                    │   DARQ Credit Protocol   │
                    │                         │
                    │   Denomination: RLUSD    │
                    │   Role:  Originator      │
                    │   Accounts: 7            │
                    └─────────────────────────┘
```

---

## Protocol Architecture

```mermaid
graph TB
    subgraph PROTOCOL["DARQ Protocol (Originator)"]
        PI[Protocol Issuer<br/><i>Issues dCREDIT, dRECEIPT, dSCORE<br/>Crosses vault offers, distributes LP tokens</i>]
    end

    subgraph AMM_POOL["XRP/RLUSD AMM"]
        AMM[AMM Account<br/><i>Bootstrapped by ammBootstrapper</i>]
    end

    subgraph LENDERS["Two-Tier Lending"]
        OL1[Overlender 1<br/><b>3% APR</b> — LP collateral]
        OL2[Overlender 2<br/><b>3% APR</b> — LP collateral]
        UL1[Underlender 1<br/><b>6% APR</b> — Direct RLUSD]
    end

    subgraph BORROWER_SIDE["Borrower"]
        BW[Borrower Account<br/><i>Receives RLUSD loan</i>]
    end

    subgraph VAULT["Blackholed Vault (Per-Loan)"]
        CV[LP Token Vault<br/><i>Permanently immutable</i>]
        LT[Liquidation Trigger<br/><i>Time-locked escrow</i>]
        SO[Standing DEX Offer<br/><i>LP tokens for dCREDIT</i>]
    end

    RLUSD_ISS[RLUSD Issuer<br/><i>Stablecoin issuer</i>]

    OL1 -->|"LP tokens"| PI
    OL2 -->|"LP tokens"| PI
    UL1 -->|"Direct RLUSD"| BW

    BW -->|"CheckCreate RLUSD"| OL1
    BW -->|"CheckCreate RLUSD"| OL2
    BW -->|"CheckCreate RLUSD"| UL1

    PI -->|"LP tokens"| CV
    CV --- LT
    CV --- SO

    PI -.->|"dCREDIT"| BW
    PI -.->|"dSCORE"| BW
    PI -.->|"seizure via dCREDIT"| CV

    RLUSD_ISS -.->|"issues RLUSD"| OL1
    RLUSD_ISS -.->|"issues RLUSD"| OL2
    RLUSD_ISS -.->|"issues RLUSD"| UL1

    style PROTOCOL fill:#1a1a2e,stroke:#e94560,color:#fff
    style AMM_POOL fill:#0f3460,stroke:#533483,color:#fff
    style LENDERS fill:#16213e,stroke:#0f3460,color:#fff
    style BORROWER_SIDE fill:#1a1a2e,stroke:#e94560,color:#fff
    style VAULT fill:#0f3460,stroke:#533483,color:#fff
    style CV fill:#533483,stroke:#e94560,color:#fff
```

---

## Financial Engineering

### The Core Mechanism: CheckCreate/CheckCash (RLUSD)

XRPL Checks are pre-authorized payment pulls. The borrower signs a `CheckCreate` at loan origination, granting each lender the right to pull their proportional RLUSD repayment at any time. The borrower does not participate in the collection — the lender calls `CheckCash` unilaterally.

This inverts the trust model: instead of trusting borrowers to repay voluntarily, lenders hold an irrevocable authorization to collect.

### Two-Tier Lending: Overlender + Underlender

Loans are backed by two tiers of capital:

- **Overlenders** deposit XRP + RLUSD into the AMM, receive LP tokens. These LP tokens serve as collateral locked in a blackholed vault.
- **Underlenders** provide direct RLUSD capital that flows to the borrower.

```
Weighted Rate = Σ(Lender_Amount × Lender_Rate) / Total_Loan

Example — 50 RLUSD loan:
  Overlender 1:   12.50 RLUSD backing × 3.0% = 0.375
  Overlender 2:   12.50 RLUSD backing × 3.0% = 0.375
  Underlender 1:  25.00 RLUSD capital  × 6.0% = 1.500
                                                ──────
  Weighted Rate = 2.250 / 50 = 4.50% blended APR
```

### Blackholed Vault — Immutable LP Token Custody

```mermaid
graph TD
    subgraph CREATION["Vault Creation (Mutable Phase)"]
        F[Fund Fresh Account] --> TL[Set LP Token + dCREDIT Trustlines]
        TL --> DC[Deposit LP Tokens<br/><b>All overlender LP tokens</b>]
        DC --> DA[Enable DepositAuth]
        DA --> DP[DepositPreauth Originator]
        DP --> E1[EscrowCreate: Liquidation Trigger<br/><b>5 XRP</b> — time-lock only]
        E1 --> OF[OfferCreate: Standing DEX Offer<br/><b>LP tokens for dCREDIT</b>]
    end

    subgraph BLACKHOLE["Blackholing (Irreversible)"]
        OF --> SK[SetRegularKey<br/><code>rrrrrrrrrrrrrrrrrrrrBZbvji</code>]
        SK --> DM[AccountSet: DisableMasterKey<br/><b>PERMANENT — NO UNDO</b>]
    end

    subgraph IMMUTABLE["Post-Blackhole State (Consensus-Enforced)"]
        DM --> IM1["Liquidation Trigger Escrow<br/><i>Only finishable after time-lock</i>"]
        DM --> IM2["Standing DEX Offer<br/><i>Only crossable with dCREDIT (by Originator)</i>"]
        DM --> IM3["No new transactions possible<br/><i>Keys are destroyed</i>"]
    end

    style CREATION fill:#16213e,stroke:#0f3460,color:#fff
    style BLACKHOLE fill:#e94560,stroke:#fff,color:#fff
    style IMMUTABLE fill:#0f3460,stroke:#533483,color:#fff
```

After blackholing, no human, key, or protocol upgrade can alter the vault. The pre-programmed escrow and offer execute according to their conditions — enforced by XRPL consensus, not by trust.

### Repayment: Forced RLUSD Collection + LP Token Return

```mermaid
sequenceDiagram
    participant B as Borrower
    participant OL1 as Overlender 1
    participant OL2 as Overlender 2
    participant UL1 as Underlender 1
    participant PI as Originator<br/>(Protocol Issuer)
    participant V as Blackholed<br/>Vault

    Note over B,PI: STEP 1: Return dCREDIT
    B->>PI: Return 50 dCREDIT (debt cleared)

    Note over OL1,UL1: STEP 2: Forced RLUSD Check Collection
    OL1->>OL1: CheckCash RLUSD (interest)
    OL2->>OL2: CheckCash RLUSD (interest)
    UL1->>UL1: CheckCash RLUSD (principal + interest)

    Note over PI,V: STEP 3: LP Token Return
    PI->>V: OfferCreate dCREDIT (crosses vault standing offer)
    V-->>PI: LP tokens released
    PI->>OL1: Return LP tokens
    PI->>OL2: Return LP tokens

    Note over B: STEP 4: +50 dSCORE bonus
```

### Liquidation: Default Recovery via AMM

```mermaid
sequenceDiagram
    participant OL1 as Overlender 1
    participant OL2 as Overlender 2
    participant UL1 as Underlender 1
    participant PI as Originator<br/>(Protocol Issuer)
    participant V as Blackholed<br/>Vault
    participant AMM as XRP/RLUSD<br/>AMM

    Note over OL1,UL1: STEP 1: Borrower drains RLUSD (default)

    Note over OL1,UL1: STEP 2: Attempt Check Collection
    OL1->>OL1: CheckCash RLUSD — BOUNCED
    OL2->>OL2: CheckCash RLUSD — BOUNCED
    UL1->>UL1: CheckCash RLUSD — BOUNCED

    Note over PI,V: STEP 3: Collateral Seizure
    PI->>V: EscrowFinish (liquidation trigger)
    PI->>V: OfferCreate dCREDIT (crosses vault offer)
    V-->>PI: LP tokens seized

    Note over PI,AMM: STEP 4: AMMWithdraw 1-sided
    PI->>AMM: AMMWithdraw (LP tokens → RLUSD)
    AMM-->>PI: RLUSD recovered

    Note over PI,UL1: STEP 5: Payment Waterfall (80/20)
    PI->>OL1: RLUSD (overlender paid FIRST)
    PI->>OL2: RLUSD (overlender paid FIRST)
    PI->>UL1: RLUSD (interest only, absorbs 80% loss)

    Note over PI: Surplus retained by Originator
    Note over PI: -100 dSCORE penalty (Clawback)
```

### Payment Waterfall (Default Split)

```
                    ┌─────────────────────────┐
                    │   RLUSD Recovered (AMM)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Tier 1: OVERLENDER    │
                    │   Paid FIRST            │
                    │   Absorbs 20% of loss   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Tier 2: UNDERLENDER   │
                    │   Interest only          │
                    │   Absorbs 80% of loss   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Tier 3: SURPLUS       │
                    │   Retained by Originator │
                    └─────────────────────────┘
```

---

## Account Architecture

| Account | Role | Count |
|---------|------|-------|
| **Protocol Issuer** | Originator — issues dCREDIT/dRECEIPT/dSCORE, crosses vault offers, distributes LP tokens, handles waterfall | 1 |
| **RLUSD Issuer** | Stablecoin issuer (separate from protocol) | 1 |
| **AMM Bootstrapper** | Seeds the initial XRP/RLUSD AMM pool | 1 |
| **Overlender 1 & 2** | Deposit into AMM, receive LP tokens as collateral | 2 |
| **Underlender 1** | Provides direct RLUSD capital | 1 |
| **Borrower** | Receives RLUSD loan, signs RLUSD Checks | 1 |
| | **Total** | **7** |

---

## Token System

| Token | Encoding | Purpose |
|-------|----------|---------|
| **dCREDIT** | `6443524544495400000000000000000000000000` | Debt obligation. Issued at origination, returned at repayment. Also used as vault crossing key. |
| **dRECEIPT** | `6452454345495054000000000000000000000000` | Lender deposit receipt. Proves lending position. |
| **dSCORE** | `6453434F52450000000000000000000000000000` | On-chain credit score. Starts at 700. +50 on-time repay. -100 (Clawback) on liquidation. |

All tokens are issued by the Protocol Issuer with `asfAllowTrustLineClawback` enabled.

---

## Complete Lifecycle Flow

```mermaid
graph LR
    subgraph INIT["1. Initialize"]
        I1[Fund 7 Accounts] --> I2[Configure Issuers<br/><i>Clawback + DefaultRipple</i>]
        I2 --> I3[Establish Trustlines]
        I3 --> I4[Create AMM Pool]
        I4 --> I5[Overlender LP Deposits]
    end

    subgraph BORROW["2. Borrow"]
        B1[Credit Assessment<br/><i>dSCORE check</i>] --> B2[Pool Matching<br/><i>Overlender/Underlender split</i>]
        B2 --> B3[Create & Blackhole Vault<br/><i>LP tokens + standing offer</i>]
        B3 --> B4[RLUSD Lending<br/><i>Underlender → Borrower</i>]
        B4 --> B5[CheckCreate RLUSD<br/><i>Forced repayment setup</i>]
        B5 --> B6[Issue dCREDIT<br/><i>Debt token</i>]
    end

    subgraph RESOLVE["3. Resolution"]
        R1{Borrower<br/>Repays?}
        R1 -->|Yes| R2[Return dCREDIT<br/>Lenders CheckCash RLUSD<br/>Originator returns LP tokens<br/><b>+50 dSCORE</b>]
        R1 -->|No| R3[CheckCash fails<br/>Originator seizes LP tokens<br/>AMMWithdraw → RLUSD<br/>80/20 waterfall<br/><b>-100 dSCORE</b>]
    end

    INIT --> BORROW --> RESOLVE

    style INIT fill:#16213e,stroke:#0f3460,color:#fff
    style BORROW fill:#0f3460,stroke:#533483,color:#fff
    style RESOLVE fill:#533483,stroke:#e94560,color:#fff
```

---

## Transaction Primitives

Every operation uses native XRPL transaction types. No smart contracts, no VM, no external dependencies.

| Primitive | Protocol Usage |
|-----------|---------------|
| `CheckCreate` / `CheckCash` | Forced repayment — lenders pull RLUSD without borrower |
| `EscrowCreate` (time-locked) | Liquidation trigger mechanism |
| `EscrowFinish` | Liquidation trigger release |
| `SetRegularKey` + `DisableMasterKey` | Permanent vault blackholing |
| `OfferCreate` | Standing vault offer (LP tokens for dCREDIT) |
| `AMMCreate` / `AMMDeposit` / `AMMWithdraw` | LP token pool management |
| `Clawback` | Credit score penalty enforcement |
| `DepositPreauth` | Access control on vault |
| `NFTokenMint` / `NFTokenAcceptOffer` | Position records (Loan, Repayment, Liquidation) |
| `TrustSet` + `Payment` (tokens) | dCREDIT, dRECEIPT, dSCORE, RLUSD issuance |

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
# Happy path: borrow → forced RLUSD repayment → LP token return
npm run demo:repay

# Default path: borrow → drain → RLUSD Checks bounce → LP seizure → AMM withdrawal → 80/20 waterfall
npm run demo:liquidate
```

---

## Project Structure

```
├── package.json
├── src/
│   ├── config.js              # Constants, currency codes, AMM config, 7 accounts
│   ├── utils/
│   │   ├── tx.js              # submitTx(), ledger time, wait utilities
│   │   ├── state.js           # Balance queries, Check/NFT/Escrow lookups
│   │   ├── crypto.js          # PREIMAGE-SHA-256 condition generation
│   │   ├── amm.js             # AMM create, deposit, withdraw, LP balance
│   │   └── pools.js           # Overlender/underlender allocation
│   ├── flows/
│   │   ├── initialize.js      # Fund 7 accounts, trustlines, AMM, LP deposits
│   │   ├── borrow.js          # Pool matching, vault, RLUSD lending, Checks
│   │   ├── repay.js           # dCREDIT return, forced Check collection, LP return
│   │   ├── liquidate.js       # Check attempts, LP seizure, AMMWithdraw, waterfall
│   │   └── summary.js         # Final protocol state display
│   ├── index.js               # Step-by-step CLI runner
│   └── demo.js                # Full lifecycle: repay or liquidate mode
```

---

## Testnet Results

Both lifecycle modes verified on XRPL Testnet (`wss://s.altnet.rippletest.net:51233`):

**Repay Mode:**
- All CheckCash: `tesSUCCESS` (RLUSD collected, zero borrower cooperation)
- LP tokens returned via vault standing offer crossing: `tesSUCCESS`
- Credit score: 700 → 750

**Liquidation Mode:**
- All CheckCash: `tecPATH_PARTIAL` (borrower drained RLUSD)
- LP tokens seized via standing offer: `tesSUCCESS`
- AMMWithdraw 1-sided: `tesSUCCESS` (LP tokens → RLUSD)
- Waterfall distribution: `tesSUCCESS` (overlender first, then underlender)
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
