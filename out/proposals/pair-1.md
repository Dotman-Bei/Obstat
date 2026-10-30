# Motion-Aware Filtering and False Alarm Reduction for Wearable Patch ECG Arrhythmia Detection

**Pair** pair-1 · **Researcher** Maja Popović (R0906), Faculty of Technical Sciences · **Company** CardioTrack d.o.o. (C091) · **Challenge** C091-CH1 · **Format** Industrial PhD

## Problem

CardioTrack d.o.o. faces a high false-positive rate where roughly one in four atrial fibrillation alerts in the clinician portal are caused by patient movement artifacts [2]. With a dataset of about 1,400 completed patient recordings and limited R&D capacity, the company needs to reduce this false-positive rate below ten percent without missing confirmed events [3, 4].

## Research questions

1. How can three-axis accelerometer data be optimally fused with single-lead patch ECG to suppress motion artifacts during ambulatory patient movement?
2. What adaptive thresholding strategies can maintain high sensitivity for true atrial fibrillation while suppressing false alarms below the ten percent target?
3. How can the developed classification pipeline be efficiently integrated into CardioTrack d.o.o.'s existing Python processing workflow?

## Plan

| Period | Work | Output |
|---|---|---|
| Year 1 | Analyze the 1,400 patient recordings dataset and design baseline motion-aware filtering algorithms fusing single-lead ECG and three-axis accelerometry | Validated motion-artifact suppression pipeline on retrospective data |
| Year 2 | Integrate and optimize the motion-aware classification models within the company Python processing pipeline and test against target false-positive metrics | Integrated prototype model meeting the sub-ten-percent false-positive threshold |
| Year 3 | Conduct clinical validation, finalize industrial PhD dissertation, and prepare joint publications on motion-artifact reduction in wearable patch ECG | Completed industrial PhD thesis and validated deployment-ready algorithm |

## What each side brings

**Company.** CardioTrack d.o.o. provides access to its 1,400 patient recordings dataset, engineering context, and a co-supervised industrial PhD environment at NTP Novi Sad [1, 3].

**Faculty.** Faculty of Technical Sciences brings specialized expertise in motion-aware biomedical signal filtering, wearable ECG processing, and arrhythmia detection algorithms [6, 8].

## Why this pair

The collaboration pairs CardioTrack d.o.o.'s commercial patch ECG platform at NTP Novi Sad with Professor Maja Popović's academic expertise in motion-aware ECG signal processing and false alarm reduction [1, 6].

## Agreed up front

Data access will be provided securely through CardioTrack d.o.o. infrastructure in compliance with patient privacy regulations. Intellectual property generated within the industrial PhD will be shared in accordance with institutional guidelines, and results will be published in peer-reviewed venues.

## Claims and evidence

Every bracketed number above points to a claim here. The Critic checked each one against the dataset before this file was written.

| # | Claim | Kind | Researcher | Dataset IDs | Critic verdict |
|---|---|---|---|---|---|
| 1 | CardioTrack d.o.o. is a medical devices company with 12 employees located at NTP Novi Sad. | company_fact |  | C091 | Pass (C1, C9, C10) |
| 2 | Roughly one in four atrial fibrillation alerts landing in the clinician portal turns out to be a motion artifact upon review. | challenge |  | C091-CH1 | Pass (C1, C7, C9, C10) |
| 3 | The company holds a dataset of about 1,400 completed patient recordings tagged by reviewing cardiologists as true AF, other arrhythmia, or noise. | challenge |  | C091-CH1 | Pass (C1, C7, C9, C10) |
| 4 | CardioTrack d.o.o. aims to achieve a false-positive rate below ten percent without missing confirmed atrial fibrillation events. | challenge |  | C091-CH1 | Pass (C1, C7, C9, C10) |
| 5 | Professor Popović is "industrial PhD supervision" and "joint projects" enabled. | available_for | R0906 | R0906 | Pass (C1, C3, C4, C5, C6, C9, C10) |
| 6 | Maja Popović published work on cutting false atrial fibrillation alarms in patch ECG with motion-aware filtering. | authored | R0906 | SYN-PUB-09638 | Pass (C1, C2, C3, C4, C9, C10) |
| 7 | Maja Popović leads the HEARTWATCH project investigating remote cardiac monitoring solutions for long-term atrial fibrillation screening. | project | R0906 | SYN-PRJ-0014 | Pass (C1, C2, C3, C4, C9, C10) |
| 8 | Maja Popović authored research on benchmark datasets for motion-corrupted patch ECG and simultaneous accelerometry in free-living adults. | authored | R0906 | SYN-PUB-09641 | Pass (C1, C2, C3, C4, C9, C10) |

Proposal-level checks: C1 ID exists pass, C3 Duplicate profile pass, C7 Research problem pass, C8 Sections complete pass, C9 No ranking of people pass.

Released by the Critic in rv_05 (round 2, W1); written 2026-10-30T18:26:25.325Z.
