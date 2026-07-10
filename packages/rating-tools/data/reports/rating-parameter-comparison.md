# Wordle Royale Rating Parameter Comparison

Generated at: 2026-06-22T00:00:00.000Z
Algorithm: placement_mmr_v1_candidate

## Parameter Sets

| Config | Algorithm | Initial | Established K | Provisional K | Established cap | Provisional cap | Use |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| conservative_beta | elo_pairwise | 1500 | 20 | 32 | 32 | 48 | Conservative beta |
| baseline_v1 | elo_pairwise | 1500 | 24 | 36 | 40 | 60 | Baseline V1 candidate |
| fast_convergence | elo_pairwise | 1500 | 28 | 48 | 48 | 72 | Fast convergence stress candidate |
| baseline_glicko | glicko_style_internal | 1500 | 24 | 36 | 40 | 64 | Glicko-style internal baseline |

## Mode Ladders

| Mode | Label | Players | Config | Start | Provisional games | Adjudication |
| --- | --- | --- | --- | ---: | ---: | --- |
| standard_1v1 | Standard 1v1 | 1v1 | baseline_glicko | 1500 | 10 | Solver beats non-solver; fewer guesses wins; same guesses draw. |
| speed_1v1 | Speed / Blitz 1v1 | 1v1 | baseline_glicko | 1500 | 10 | Fewer guesses wins; same guesses use server-received solve time. |
| classic_1v1 | Classic 1v1 | 1v1 | conservative_beta | 1500 | 10 | Fewer guesses wins; same guesses draw; slower time pressure. |
| multiplayer_lobby | Multiplayer / Lobby | 2-4 | conservative_beta | 1500 | 10 | Placement converts to pairwise wins/losses/draws with lobby-size averaging. |

## Glicko-style Internal Model Notes

- User-facing rating remains a simple integer rating.
- Internal RD/confidence lets provisional and inactive players move faster without granting unlimited opponent windfalls.
- MVP can ship Elo-compatible deltas while storing RD/volatility-ready fields for migration.

## Scenario Comparison

### 1v1_equal_ratings — 1v1 equal ratings

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:-10 | 10 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:-12 | 12 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:-14 | 14 | 14 | 0 | 0 |
| baseline_glicko | A:+12, B:-12 | 12 | 12 | 0 | 0 |

### 1v1_upset — 1v1 upset

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:-15, B:+15 | 15 | 15 | 0 | 0 |
| baseline_v1 | A:-18, B:+18 | 18 | 18 | 0 | 0 |
| fast_convergence | A:-21, B:+21 | 21 | 21 | 0 | 0 |
| baseline_glicko | A:-18, B:+18 | 18 | 18 | 0 | 0 |

### 1v1_provisional_win — 1v1 provisional win

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+16, B:-10 | 13 | 16 | 0 | 6 |
| baseline_v1 | A:+18, B:-12 | 15 | 18 | 0 | 6 |
| fast_convergence | A:+24, B:-14 | 19 | 24 | 0 | 10 |
| baseline_glicko | A:+21, B:-8 | 14.5 | 21 | 0 | 13 |

### 1v1_draw_equal_guesses — 1v1 draw equal guesses

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+0, B:+0 | 0 | 0 | 0 | 0 |
| baseline_v1 | A:+0, B:+0 | 0 | 0 | 0 | 0 |
| fast_convergence | A:+0, B:+0 | 0 | 0 | 0 | 0 |
| baseline_glicko | A:+0, B:+0 | 0 | 0 | 0 | 0 |

### 1v1_inactive_return_win — 1v1 inactive return win

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:-10 | 10 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:-12 | 12 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:-14 | 14 | 14 | 0 | 0 |
| baseline_glicko | A:+17, B:-10 | 13.5 | 17 | 0 | 7 |

### 3p_mixed_skill — 3-player mixed skill placements

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+6, B:+0, C:-6 | 4 | 6 | 0 | 0 |
| baseline_v1 | A:+7, B:+0, C:-7 | 4.67 | 7 | 0 | 0 |
| fast_convergence | A:+8, B:+0, C:-8 | 5.33 | 8 | 0 | 0 |
| baseline_glicko | A:+7, B:+0, C:-7 | 4.67 | 7 | 0 | 0 |

### 4p_equal_placements — 4-player equal ratings

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:+3, C:-3, D:-10 | 6.5 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:+4, C:-4, D:-12 | 8 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:+5, C:-5, D:-14 | 9.5 | 14 | 0 | 0 |
| baseline_glicko | A:+12, B:+4, C:-4, D:-12 | 8 | 12 | 0 | 0 |

### 4p_upset — 4-player upset

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:-3, B:+10, C:-3, D:-4 | 5 | 10 | 0 | 0 |
| baseline_v1 | A:-3, B:+12, C:-4, D:-5 | 6 | 12 | 0 | 0 |
| fast_convergence | A:-4, B:+14, C:-5, D:-5 | 7 | 14 | 0 | 0 |
| baseline_glicko | A:-3, B:+12, C:-4, D:-5 | 6 | 12 | 0 | 0 |

### 4p_middle_tie — 4-player middle tie

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:+0, C:+0, D:-10 | 5 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:+0, C:+0, D:-12 | 6 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:+0, C:+0, D:-14 | 7 | 14 | 0 | 0 |
| baseline_glicko | A:+12, B:+0, C:+0, D:-12 | 6 | 12 | 0 | 0 |

### abandon_last_after_meaningful_play_placeholder — Abandon placeholder — last after meaningful play

Policy note: Meaningful-play threshold is not locked; this scenario models only the candidate last-place treatment.

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:+3, C:-3, D:-10 | 6.5 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:+4, C:-4, D:-12 | 8 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:+5, C:-5, D:-14 | 9.5 | 14 | 0 | 0 |
| baseline_glicko | A:+12, B:+4, C:-4, D:-12 | 8 | 12 | 0 | 0 |

## Abandon/Void Policy Placeholders

These policies are intentionally marked not locked; the simulator includes placeholders without pretending final ranked abandon policy is approved.

| Policy | Status | Simulation treatment | Open decision |
| --- | --- | --- | --- |
| Last-place after meaningful play | not_locked | Model abandoning player as last only after product-approved meaningful-play threshold. | Exact meaningful-play threshold is still required. |
| Fixed penalty plus no opponent windfall | not_locked | Reserved for future simulation; not applied to current candidate comparison. | Need policy decision on whether opponents should receive full, partial, or no rating gains. |
| Void early/no meaningful play | not_locked | No rating deltas should be emitted for early/server-integrity voids. | Need server-side definition of early abandon, server fault, and admin void states. |

## Recommendation

Recommend baseline_glicko as the internal MVP target for Standard and Speed/Blitz if Ticket 112 can store RD/confidence fields; otherwise ship baseline_v1 Elo-compatible deltas while preserving Glicko-ready columns. Keep Classic conservative and Multiplayer/Lobby feature-flagged until abuse and abandon policy are locked.

