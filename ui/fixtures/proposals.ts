// Sample proposals for the replay fixture. `{n}` in a section marks the sentence that claim n supports.
// Each pair keeps every round's claims, so the hold detail can show what changed between rounds.
import type { Claim, ParticipantId, ProposalFormat, ProposalSections } from '../src/data/types.ts';

export interface PairDraft {
  pairId: string;
  writerId: ParticipantId;
  researcherId: string;
  companyId: string;
  challengeId: string;
  format: ProposalFormat;
  sections: ProposalSections;
  /** Claims as submitted in each round, first round first. */
  rounds: Claim[][];
  abandoned?: { reason: string; replacedBy: string };
}

export const pairs: PairDraft[] = [
  {
    pairId: 'pair-1', writerId: 'W1', researcherId: 'R0412', companyId: 'C011', challengeId: 'C011-CH2', format: 'joint_project',
    sections: {
      title: 'Early bearing-fault detection on the end-of-line motor test bench',
      problem: 'Elektromotori Bačka’s end-of-line test bench stopped 14 times in 2025 because a bearing failed in a motor under test, at 6.5 hours per stoppage, 91 hours in all {1}. Today a fault is found only when the motor seizes. The company wants a failing bearing flagged within the first 90 seconds of the 10-minute test {1}.',
      researchQuestions: [
        'Which vibration and stator-current features separate a healthy bearing from an early outer-race fault within 90 seconds of run-up?',
        'Can a classifier trained on the bench’s own 2023–2025 test logs keep false alarms under 1 in 200 motors?',
        'Does one accelerometer plus current sensing detect as many faults as a three-axis set-up?',
      ],
      plan: 'Months 1–4 | Instrument the bench; label faults in the 2023–2025 logs | Labelled dataset of 31,400 test runs\nMonths 5–10 | Feature study on the faculty’s bearing-fault rig and the bench | Feature set; first paper\nMonths 11–18 | Classifier running beside the bench in shadow mode | Go/no-go report with the false-alarm rate',
      eachSideBrings: {
        company: 'Bench access two half-days a week, test logs for 31,400 motors from 2023–2025 {6}, and a test engineer for 20% of the project.',
        faculty: 'Vesna Lazić’s group brings motor-current signature analysis {2}, a patented low-cost vibration sensing module {3}, and time on the department’s bearing-fault rig {4}.',
      },
      whyThisPair: 'Lazić has published on detecting outer-race bearing faults from stator current {2}, a method the bench can add without stopping production. Her profile note says she is open to joint projects with industry from 2026 {5}.',
      agreedUpFront: 'Test-log data stays on company servers; the faculty works on an anonymised export. Results may be published after a 60-day review by the company. New IP is jointly owned, with the first licence option for Elektromotori Bačka.',
    },
    rounds: [[
      { n: 1, kind: 'challenge', text: 'The bench stopped 14 times in 2025, 6.5 hours each; the target is a flag within 90 seconds.', ids: ['C011-CH2'] },
      { n: 2, kind: 'authored', text: 'Vesna Lazić published on detecting outer-race bearing faults from stator current.', researcherId: 'R0412', ids: ['SYN-PUB-03318'] },
      { n: 3, kind: 'patent', text: 'Lazić is a co-inventor of a low-cost vibration sensing module.', researcherId: 'R0412', ids: ['SYN-PAT-0087'] },
      { n: 4, kind: 'project', text: 'Lazić led the project that built the department’s bearing-fault rig.', researcherId: 'R0412', ids: ['SYN-PRJ-0231'] },
      { n: 5, kind: 'available_for', text: 'Lazić is open to joint projects with industry from 2026.', researcherId: 'R0412', ids: ['R0412'] },
      { n: 6, kind: 'company_fact', text: 'The company keeps test logs for 31,400 motors from 2023–2025.', ids: ['C011'] },
    ]],
  },
  {
    pairId: 'pair-2', writerId: 'W2', researcherId: 'R0539', companyId: 'C017', challengeId: 'C017-CH1', format: 'industrial_phd',
    sections: {
      title: 'Optical sorting and debranning to keep DON-contaminated wheat food grade',
      problem: 'In 2025, 9% of the wheat lots Panonija Mlin received exceeded 1,250 µg/kg deoxynivalenol (DON) and were sold as feed, a loss of about €310,000 {1}. The mill cleans by size and density only; no step targets kernels damaged by Fusarium.',
      researchQuestions: [
        'How far do optical sorting and light debranning, alone and combined, lower DON in Vojvodina wheat lots that start between 1,250 and 2,500 µg/kg?',
        'Which kernel features seen by a sorter’s camera predict DON well enough to set a reject threshold per lot?',
        'What flour yield does each step cost, and where is the break-even against selling the lot as feed?',
      ],
      plan: 'Year 1 | Literature, sampling plan, DON baseline for 120 lots from the 2027 harvest | Baseline dataset; first paper\nYear 2 | Pilot sorting and debranning trials on 40 lots at the mill | Reject-threshold model per lot\nYear 3 | Full-scale trial on one cleaning line; yield and cost study; thesis | Operating procedure; thesis defence',
      eachSideBrings: {
        company: 'A co-supervisor from quality control, access to the cleaning line and the mill’s lab at 420 t a day {6}, DON records for every lot from 2023–2025, and the candidate’s salary.',
        faculty: 'Mirjana Jeremić supervises. Her group has measured how optical sorting {2} and debranning {3} change DON in wheat, and she leads the faculty’s mycotoxin laboratory {4}.',
      },
      whyThisPair: 'Jeremić’s published work is on this exact step: removing mycotoxins from wheat before milling {2}{3}. Her note says she has room for one more doctoral candidate from autumn 2027 {5}.',
      agreedUpFront: 'The candidate is employed by Panonija Mlin and enrolled at the Faculty of Technology Novi Sad. Lot data is shared under an NDA; the thesis is public after a 6-month embargo. The company owns its operating procedure; methods may be published.',
    },
    rounds: [
      [
        { n: 1, kind: 'challenge', text: '9% of 2025 lots exceeded 1,250 µg/kg DON and were sold as feed, about €310,000 lost.', ids: ['C017-CH1'] },
        { n: 2, kind: 'authored', text: 'Mirjana Jeremić measured how optical sorting changes DON in wheat.', researcherId: 'R0539', ids: ['SYN-PUB-02210'] },
        { n: 3, kind: 'authored', text: 'Jeremić Mirjana (R0139) co-authored a study of debranning’s effect on DON in wheat.', researcherId: 'R0139', ids: ['SYN-PUB-01827'] },
        { n: 4, kind: 'project', text: 'Jeremić leads the faculty’s mycotoxin laboratory.', researcherId: 'R0539', ids: ['SYN-PRJ-0158'] },
        { n: 5, kind: 'available_for', text: 'Jeremić has room for one more doctoral candidate from autumn 2027.', researcherId: 'R0539', ids: ['R0539'] },
        { n: 6, kind: 'company_fact', text: 'The mill processes 420 t of wheat a day.', ids: ['C017'] },
      ],
      [
        { n: 1, kind: 'challenge', text: '9% of 2025 lots exceeded 1,250 µg/kg DON and were sold as feed, about €310,000 lost.', ids: ['C017-CH1'] },
        { n: 2, kind: 'authored', text: 'Mirjana Jeremić measured how optical sorting changes DON in wheat.', researcherId: 'R0539', ids: ['SYN-PUB-02210'] },
        { n: 3, kind: 'authored', text: 'Mirjana Jeremić (R0539) co-authored a study of debranning’s effect on DON in wheat.', researcherId: 'R0539', ids: ['SYN-PUB-01827'] },
        { n: 4, kind: 'project', text: 'Jeremić leads the faculty’s mycotoxin laboratory.', researcherId: 'R0539', ids: ['SYN-PRJ-0158'] },
        { n: 5, kind: 'available_for', text: 'Jeremić has room for one more doctoral candidate from autumn 2027.', researcherId: 'R0539', ids: ['R0539'] },
        { n: 6, kind: 'company_fact', text: 'The mill processes 420 t of wheat a day.', ids: ['C017'] },
      ],
    ],
  },
  {
    pairId: 'pair-3', writerId: 'W3', researcherId: 'R0128', companyId: 'C031', challengeId: 'C031-CH2', format: 'joint_project',
    sections: {
      title: 'Ten days of shelf life for fresh-cut apple slices',
      problem: 'Fruktal Srem’s fresh-cut apple slices keep 6 days in chilled retail; two retail chains require 10 days before they will list them {1}. Browning and softening set the limit, and both show by day 5.',
      researchQuestions: [
        'Which edible coating, with ascorbic acid or calcium, holds the colour and firmness of fresh-cut apple for 10 days at 4 °C?',
        'How do the coating and modified-atmosphere packaging work together on the existing packing line?',
        'Does the coating change the taste enough for a consumer panel to notice?',
      ],
      plan: 'Months 1–3 | Screen 6 coating formulations in the lab | Two candidate coatings\nMonths 4–8 | Line trials with modified-atmosphere packs on two apple varieties | Shelf-life curves to day 12\nMonths 9–12 | Retail-condition trial, sensory panel, cost per kg | Go/no-go report',
      eachSideBrings: {
        company: 'Line time for 6 trial runs, apples from its own 140 ha of orchards {5}, packaging, and a technologist for 30% of the project.',
        faculty: 'Nina Mamužić’s lab has tested edible coatings on fresh-cut apple {2} and modified-atmosphere packaging for minimally processed fruit {3}.',
      },
      whyThisPair: 'Mamužić works on preserving minimally processed fruit {2}{3}, which is the product’s problem. Her note says she is taking on industry projects of under a year {4}.',
      agreedUpFront: 'Coating recipes developed in the project belong to Fruktal Srem; the faculty may publish shelf-life data without the recipe. Trial costs are paid by the company at the faculty’s standard rates.',
    },
    rounds: [
      [
        { n: 1, kind: 'challenge', text: 'Slices keep 6 days; two retail chains require 10.', ids: ['C031-CH2'] },
        { n: 2, kind: 'authored', text: 'Nina Mamužić has tested how treatments hold the firmness of apple.', researcherId: 'R0128', ids: ['SYN-PUB-02944'] },
        { n: 3, kind: 'authored', text: 'Mamužić published on modified-atmosphere packaging of minimally processed fruit.', researcherId: 'R0128', ids: ['SYN-PUB-01095'] },
        { n: 4, kind: 'available_for', text: 'Mamužić is taking on industry projects of under a year.', researcherId: 'R0128', ids: ['R0128'] },
        { n: 5, kind: 'company_fact', text: 'The company grows apples on 140 ha.', ids: ['C031'] },
      ],
      [
        { n: 1, kind: 'challenge', text: 'Slices keep 6 days; two retail chains require 10.', ids: ['C031-CH2'] },
        { n: 2, kind: 'authored', text: 'Nina Mamužić tested alginate coatings with ascorbic acid on fresh-cut apple.', researcherId: 'R0128', ids: ['SYN-PUB-01562'] },
        { n: 3, kind: 'authored', text: 'Mamužić published on modified-atmosphere packaging of minimally processed fruit.', researcherId: 'R0128', ids: ['SYN-PUB-01095'] },
        { n: 4, kind: 'available_for', text: 'Mamužić is taking on industry projects of under a year.', researcherId: 'R0128', ids: ['R0128'] },
        { n: 5, kind: 'company_fact', text: 'The company grows apples on 140 ha.', ids: ['C031'] },
      ],
    ],
  },
  {
    pairId: 'pair-4', writerId: 'W1', researcherId: 'R0068', companyId: 'C009', challengeId: 'C009-CH2', format: 'industrial_phd',
    sections: {
      title: 'Keeping drone spray drift under 5% in crosswinds',
      problem: 'In winds above 3 m/s, about 18% of the product Agrodron Sistemi sprays from drones lands outside the field edge {1}. Customers ask for under 5%.',
      researchQuestions: [
        'How does rotor downwash interact with crosswind across the swath at 2–4 m flight height?',
        'Which nozzle and flight settings keep off-target deposit under 5% in crosswinds of 3–6 m/s?',
      ],
      plan: 'Year 1 | CFD model of downwash in crosswind | Validated model\nYear 2 | Field drift trials | Drift curves\nYear 3 | Settings tested in operations; thesis | Thesis defence',
      eachSideBrings: {
        company: 'Two spraying drones with an operator for trials, flight logs, a co-supervisor and the candidate’s salary.',
        faculty: 'Stevan Radovanović has modelled rotor downwash and spray transport {2} and would supervise {3}.',
      },
      whyThisPair: 'Radovanović’s published model of downwash under a hexacopter {2} is the starting point for the drift problem.',
      agreedUpFront: 'The candidate is employed by Agrodron Sistemi. Flight logs stay with the company.',
    },
    rounds: [
      [
        { n: 1, kind: 'challenge', text: 'About 18% of product lands outside the field edge in winds over 3 m/s.', ids: ['C009-CH2'] },
        { n: 2, kind: 'authored', text: 'Stevan Radovanović modelled rotor downwash and spray transport under a hexacopter.', researcherId: 'R0068', ids: ['SYN-PUB-00731'] },
        { n: 3, kind: 'available_for', text: 'Radovanović is open to supervising an industrial PhD.', researcherId: 'R0068', ids: ['R0068'] },
      ],
      [
        { n: 1, kind: 'challenge', text: 'About 18% of product lands outside the field edge in winds over 3 m/s.', ids: ['C009-CH2'] },
        { n: 2, kind: 'authored', text: 'Stevan Radovanović modelled rotor downwash and spray transport under a hexacopter.', researcherId: 'R0068', ids: ['SYN-PUB-00731'] },
        { n: 3, kind: 'available_for', text: 'Radovanović is available as an external adviser to the candidate.', researcherId: 'R0068', ids: ['R0068'] },
      ],
      [
        { n: 1, kind: 'challenge', text: 'About 18% of product lands outside the field edge in winds over 3 m/s.', ids: ['C009-CH2'] },
        { n: 2, kind: 'authored', text: 'Stevan Radovanović modelled rotor downwash and spray transport under a hexacopter.', researcherId: 'R0068', ids: ['SYN-PUB-00731'] },
        { n: 3, kind: 'available_for', text: 'Radovanović can be reached through the department for advice.', researcherId: 'R0068', ids: ['R0068'] },
      ],
    ],
    abandoned: {
      reason: 'C5 failed in all 3 rounds: R0068 left the faculty in March 2026. Without that claim the proposal names no supervisor, so “What each side brings” is incomplete.',
      replacedBy: 'pair-5',
    },
  },
  {
    pairId: 'pair-5', writerId: 'W1', researcherId: 'R0217', companyId: 'C009', challengeId: 'C009-CH2', format: 'industrial_phd',
    sections: {
      title: 'Drift-reducing nozzles and flight patterns for spraying drones',
      problem: 'In winds above 3 m/s, about 18% of the product Agrodron Sistemi sprays from drones lands outside the field edge {1}. Customers ask the company to stay under 5% so that no crop is lost to buffer strips.',
      researchQuestions: [
        'Which nozzle type and droplet size keep off-target deposit under 5% in crosswinds of 3–6 m/s at 2–4 m flight height?',
        'How does rotor downwash interact with crosswind across the swath, measured with water-sensitive paper and a tracer?',
        'Can the drone set its height, speed and swath overlap from its own wind estimate?',
      ],
      plan: 'Year 1 | Drift-stand and field tests of 4 nozzle types | Drift curves per nozzle; first paper\nYear 2 | Field trials over 60 ha of maize and sunflower with a tracer | Model of drift against wind, height and nozzle\nYear 3 | Automatic flight settings tested in the company’s operations; thesis | Settings in production; thesis defence',
      eachSideBrings: {
        company: 'Two spraying drones with an operator for trials, flight logs from 2,300 ha sprayed in 2025 {5}, a co-supervisor, and the candidate’s salary.',
        faculty: 'Milica Kovačević supervises. She has measured drift from air-induction and flat-fan nozzles in crosswind {2} and leads the faculty’s project that built a drift test stand {3}.',
      },
      whyThisPair: 'Kovačević’s work is on spray drift and nozzle choice {2}, the two levers this problem turns on. Her note says she is open to co-supervising one industrial PhD starting 2027 {4}.',
      agreedUpFront: 'The candidate is employed by Agrodron Sistemi and enrolled at the Faculty of Agriculture. Flight logs stay with the company; the thesis and drift data are public. The automatic settings belong to the company; the faculty keeps the right to use the test methods.',
    },
    rounds: [[
      { n: 1, kind: 'challenge', text: 'About 18% of product lands outside the field edge in winds over 3 m/s.', ids: ['C009-CH2'] },
      { n: 2, kind: 'authored', text: 'Milica Kovačević measured drift from air-induction and flat-fan nozzles in crosswind.', researcherId: 'R0217', ids: ['SYN-PUB-02675'] },
      { n: 3, kind: 'project', text: 'Kovačević leads the project that built the faculty’s drift test stand.', researcherId: 'R0217', ids: ['SYN-PRJ-0304'] },
      { n: 4, kind: 'available_for', text: 'Kovačević is open to co-supervising one industrial PhD starting 2027.', researcherId: 'R0217', ids: ['R0217'] },
      { n: 5, kind: 'company_fact', text: 'The company sprayed 2,300 ha in 2025.', ids: ['C009'] },
    ]],
  },
];

/** Challenges the Industry Analyst turned away (F7). A sample of the run's total; the full list is out/no-match.md. */
export const noMatch = {
  total: 118,
  byClass: [{ cls: 'not_research' as const, count: 96 }, { cls: 'no_uns_fit' as const, count: 22 }],
  byReason: [
    { reason: 'Funding or investment', count: 21 },
    { reason: 'Licensing or registration', count: 19 },
    { reason: 'Hiring', count: 17 },
    { reason: 'Marketing and branding', count: 15 },
    { reason: 'IT systems', count: 13 },
    { reason: 'Legal', count: 11 },
    { reason: 'No matching group at UNS', count: 22 },
  ],
  items: [
    { challengeId: 'C004-CH4', cls: 'not_research' as const, reason: 'A licensing delay at the ministry, not an open technical question.' },
    { challengeId: 'C021-CH3', cls: 'not_research' as const, reason: 'A seed round; the company needs investors, not research.' },
    { challengeId: 'C006-CH3', cls: 'not_research' as const, reason: 'A hiring need.' },
    { challengeId: 'C012-CH1', cls: 'not_research' as const, reason: 'A software migration with a known solution.' },
    { challengeId: 'C027-CH3', cls: 'not_research' as const, reason: 'An insurance question.' },
    { challengeId: 'C036-CH2', cls: 'not_research' as const, reason: 'A trademark dispute.' },
    { challengeId: 'C040-CH1', cls: 'not_research' as const, reason: 'A branding brief.' },
    { challengeId: 'C023-CH1', cls: 'no_uns_fit' as const, reason: 'No UNS group works on underwater acoustics or has a deep test tank.' },
  ],
};
