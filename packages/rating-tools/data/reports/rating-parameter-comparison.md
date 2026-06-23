# Wordle Royale Rating Parameter Comparison

Generated at: 2026-06-22T00:00:00.000Z
Algorithm: placement_mmr_v1_candidate

## Parameter Sets

| Config | Established K | Provisional K | Established cap | Provisional cap | Use |
| --- | ---: | ---: | ---: | ---: | --- |
| conservative_beta | 20 | 32 | 32 | 48 | Conservative beta |
| baseline_v1 | 24 | 36 | 40 | 60 | Baseline V1 candidate |
| fast_convergence | 28 | 48 | 48 | 72 | Fast convergence stress candidate |

## Scenario Comparison

### 1v1_equal_ratings — 1v1 equal ratings

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:-10 | 10 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:-12 | 12 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:-14 | 14 | 14 | 0 | 0 |

### 1v1_upset — 1v1 upset

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:-15, B:+15 | 15 | 15 | 0 | 0 |
| baseline_v1 | A:-18, B:+18 | 18 | 18 | 0 | 0 |
| fast_convergence | A:-21, B:+21 | 21 | 21 | 0 | 0 |

### 1v1_provisional_win — 1v1 provisional win

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+16, B:-10 | 13 | 16 | 0 | 6 |
| baseline_v1 | A:+18, B:-12 | 15 | 18 | 0 | 6 |
| fast_convergence | A:+24, B:-14 | 19 | 24 | 0 | 10 |

### 3p_mixed_skill — 3-player mixed skill placements

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+6, B:+0, C:-6 | 4 | 6 | 0 | 0 |
| baseline_v1 | A:+7, B:+0, C:-7 | 4.67 | 7 | 0 | 0 |
| fast_convergence | A:+8, B:+0, C:-8 | 5.33 | 8 | 0 | 0 |

### 4p_equal_placements — 4-player equal ratings

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:+3, C:-3, D:-10 | 6.5 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:+4, C:-4, D:-12 | 8 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:+5, C:-5, D:-14 | 9.5 | 14 | 0 | 0 |

### 4p_upset — 4-player upset

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:-3, B:+10, C:-3, D:-4 | 5 | 10 | 0 | 0 |
| baseline_v1 | A:-3, B:+12, C:-4, D:-5 | 6 | 12 | 0 | 0 |
| fast_convergence | A:-4, B:+14, C:-5, D:-5 | 7 | 14 | 0 | 0 |

### 4p_middle_tie — 4-player middle tie

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:+0, C:+0, D:-10 | 5 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:+0, C:+0, D:-12 | 6 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:+0, C:+0, D:-14 | 7 | 14 | 0 | 0 |

### abandon_last_after_meaningful_play_placeholder — Abandon placeholder — last after meaningful play

Policy note: Meaningful-play threshold is not locked; this scenario models only the candidate last-place treatment.

| Config | Deltas | Avg abs delta | Max abs delta | Cap hits | Total delta |
| --- | --- | ---: | ---: | ---: | ---: |
| conservative_beta | A:+10, B:+3, C:-3, D:-10 | 6.5 | 10 | 0 | 0 |
| baseline_v1 | A:+12, B:+4, C:-4, D:-12 | 8 | 12 | 0 | 0 |
| fast_convergence | A:+14, B:+5, C:-5, D:-14 | 9.5 | 14 | 0 | 0 |

## Abandon/Void Policy Placeholders

These policies are intentionally marked not locked; the simulator includes placeholders without pretending final ranked abandon policy is approved.

| Policy | Status | Simulation treatment | Open decision |
| --- | --- | --- | --- |
| Last-place after meaningful play | not_locked | Model abandoning player as last only after product-approved meaningful-play threshold. | Exact meaningful-play threshold is still required. |
| Fixed penalty plus no opponent windfall | not_locked | Reserved for future simulation; not applied to current candidate comparison. | Need policy decision on whether opponents should receive full, partial, or no rating gains. |
| Void early/no meaningful play | not_locked | No rating deltas should be emitted for early/server-integrity voids. | Need server-side definition of early abandon, server fault, and admin void states. |

## Recommendation

Start ranked beta with baseline_v1 for 1v1 only; keep 3–4 player ranked feature-flagged until QA and telemetry pass.

