# Machine-Learning-Assisted Automated GPR Hyperbola Detection for Underground Utility Mapping

**Pair** pair-2 · **Researcher** Mirjana Jeremić (R0539), Faculty of Technical Sciences · **Company** Terramap Subotica d.o.o. (C062) · **Challenge** C062-CH1 · **Format** Industrial PhD

## Problem

Terramap Subotica d.o.o. states that their ground-penetrating radar surveys miss about one in five utility pipes because operators disagree on what they see in raw B-scan images [1]. A missed gas pipe on a construction site last year caused a major incident that shut the site for nine days and cost a combined settlement [2]. Terramap holds roughly four terabytes of raw GPR B-scan files going back to 2017 with excavation ground truth from completed projects [3].

## Research questions

1. How can convolutional neural networks be effectively adapted to process Terramap's historical GPR B-scan archives and automatically identify hyperbolic reflections from buried utility pipes?
2. What calibration methods and confidence scoring mechanisms can minimize operator disagreement and reduce the incidence of missed pipes during routine surveys?
3. How can automated detection layers be integrated into Terramap's daily operational workflow without disrupting survey processing timelines?

## Plan

| Period | Work | Output |
|---|---|---|
| Year 1 | Audit and curate Terramap's four terabytes of historical GPR B-scan files [3], establish ground-truth labels from excavation records, and adapt existing convolutional neural network architectures for automated hyperbola detection [4]. | Curated training dataset and baseline automated hyperbola detection model. |
| Year 2 | Train, validate, and test machine learning models on urban GPR B-scans, integrate confidence scoring for probable pipe locations, and perform field-testing on active Terramap survey projects. | Validated detection layer with confidence scoring and field-test evaluation report. |
| Year 3 | Refine user interface integration for Terramap operators, establish escalation workflows for disputed scans, finalize the industrial PhD dissertation, and prepare joint publications. | Deployed detection workflow, completed doctoral dissertation, and submitted manuscripts. |

## What each side brings

**Company.** Terramap Subotica d.o.o. contributes four terabytes of historical Gpr b-scan files with known excavation ground truth [3], two senior surveyors with postgraduate geodesy backgrounds dedicating ten to fifteen hours per week, and industrial domain expertise in underground infrastructure mapping {C062}.

**Faculty.** Mirjana Jeremić {R0539} brings academic expertise in ground-penetrating radar, machine-learning-assisted hyperbola detection in B-scans [4], subsurface utility engineering, and positional accuracy assessment of utility surveys [5, 6].

## Why this pair

This collaboration pairs Terramap Subotica d.o.o., a commercial underground infrastructure mapping company facing operational challenges with missed utility pipes {1, C062}, with Mirjana Jeremić {R0539}, an expert in machine-learning-assisted hyperbola detection in B-scans [4] from the Faculty of Technical Sciences at the University of Novi Sad. By combining Terramap's four terabytes of historical survey data [3] with academic research in automated interpretation [4], the partnership directly addresses the critical need to reduce operator dependency and prevent costly utility strikes [1, 2].

## Agreed up front

Data access will utilize Terramap's internal server containing four terabytes of historical GPR B-scan files with excavation ground truth. Intellectual property resulting from the industrial PhD will be shared between Terramap Subotica d.o.o. and the University of Novi Sad under an agreed commercialization and confidentiality framework. Joint publications in peer-reviewed journals will be pursued based on the findings of the automated detection models.

## Claims and evidence

Every bracketed number above points to a claim here. The Critic checked each one against the dataset before this file was written.

| # | Claim | Kind | Researcher | Dataset IDs | Critic verdict |
|---|---|---|---|---|---|
| 1 | Terramap Subotica d.o.o. states that their ground-penetrating radar surveys miss about one in five utility pipes because operators disagree on what they see in raw B-scan images. | challenge |  | C062-CH1 | Pass (C1, C7, C9, C10) |
| 2 | A missed gas pipe on a construction site last year caused a major incident that shut the site for nine days and cost a combined settlement. | challenge |  | C062-CH1 | Pass (C1, C7, C9, C10) |
| 3 | Terramap Subotica d.o.o. holds roughly four terabytes of raw GPR B-scan files going back to 2017 with excavation ground truth from completed projects. | challenge |  | C062-CH1 | Pass (C1, C7, C9, C10) |
| 4 | Mirjana Jeremić trained and tested a convolutional neural network to detect hyperbolic reflections indicative of buried point and linear targets in GPR B-scans. | authored | R0539 | SYN-PUB-01827 | Pass (C1, C2, C3, C4, C9, C10) |
| 5 | Mirjana Jeremić assessed positional discrepancies between independent GPR-based cadastre surveys and operator GIS records for low-voltage cable routes in Vojvodina. | authored | R0539 | SYN-PUB-01828 | Pass (C1, C2, C3, C4, C9, C10) |
| 6 | Mirjana Jeremić evaluated horizontal positioning accuracy of RTK-GNSS for utility location work across different street types in Novi Sad. | authored | R0539 | SYN-PUB-01829 | Pass (C1, C2, C3, C4, C9, C10) |

Proposal-level checks: C1 ID exists pass, C3 Duplicate profile pass, C7 Research problem pass, C8 Sections complete pass, C9 No ranking of people pass.

Released by the Critic in rv_07 (round 2, W2); written 2026-10-30T18:26:59.473Z.
