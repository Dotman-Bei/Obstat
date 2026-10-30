// Sample dataset records for the console's replay fixture. Invented in the shape of
// jigjoy-ai/einstein-matchmaker-data; the trap IDs follow PRD §2 (R0139/R0539, R0128/R0881, R0068).
// Replace with the real in-memory index served by the UI Bridge (GET /api/records/:id).
import type { DatasetRecord } from '../src/data/types.ts';

const researcher = (r: Record<string, unknown>): DatasetRecord => ({ id: r.researcher_id as string, type: 'researcher', title: r.name as string, record: r });
const publication = (r: Record<string, unknown>): DatasetRecord => ({ id: r.publication_id as string, type: 'publication', title: r.title as string, record: r });
const project = (r: Record<string, unknown>): DatasetRecord => ({ id: r.project_id as string, type: 'project', title: r.title as string, record: r });
const patent = (r: Record<string, unknown>): DatasetRecord => ({ id: r.patent_id as string, type: 'patent', title: r.title as string, record: r });
const company = (r: Record<string, unknown>): DatasetRecord => ({ id: r.company_id as string, type: 'company', title: r.name as string, record: r });
const challenge = (r: Record<string, unknown>): DatasetRecord => ({ id: r.challenge_id as string, type: 'challenge', title: r.title as string, record: r });

export const records: DatasetRecord[] = [
  // ---- researchers ----
  researcher({
    researcher_id: 'R0412', name: 'Vesna Lazić', title: 'Associate Professor',
    faculty: 'Faculty of Technical Sciences', department: 'Department of Power, Electronic and Telecommunication Engineering',
    research_areas: ['condition monitoring', 'induction motors', 'motor current signature analysis'],
    bio: 'Works on diagnosing faults in electrical machines from current and vibration signals.',
    notes: 'Open to joint projects with industry from 2026. Teaching load is lighter in the spring term.',
    open_to: ['joint_project', 'contract_research'], status: 'active',
  }),
  researcher({
    researcher_id: 'R0539', name: 'Mirjana Jeremić', title: 'Full Professor',
    faculty: 'Faculty of Technology Novi Sad', department: 'Department of Carbohydrate Food Engineering',
    research_areas: ['cereal technology', 'mycotoxins', 'wheat milling'],
    bio: 'Studies how cleaning, sorting and milling steps change mycotoxin levels in cereals.',
    notes: 'Currently supervises three doctoral candidates; room for one more from autumn 2027.',
    open_to: ['industrial_phd', 'joint_project'], status: 'active',
  }),
  researcher({
    researcher_id: 'R0139', name: 'Jeremić Mirjana', title: 'Professor',
    faculty: 'Tehnološki fakultet Novi Sad', department: 'Katedra za inženjerstvo ugljenohidratne hrane',
    research_areas: ['cereal technology'],
    bio: '', notes: 'Imported from a second source.', open_to: [], status: 'active',
  }),
  researcher({
    researcher_id: 'R0128', name: 'Nina Mamužić', title: 'Assistant Professor',
    faculty: 'Faculty of Technology Novi Sad', department: 'Department of Food Preservation Engineering',
    research_areas: ['minimally processed fruit', 'edible coatings', 'modified-atmosphere packaging'],
    bio: 'Works on extending the shelf life of fresh-cut fruit and vegetables.',
    notes: 'Taking on industry projects of under a year.',
    open_to: ['joint_project', 'contract_research'], status: 'active',
  }),
  researcher({
    researcher_id: 'R0881', name: 'Nina Mamužić', title: 'Research Associate',
    faculty: 'Faculty of Agriculture', department: 'Department of Fruit Growing, Viticulture, Horticulture and Landscape Architecture',
    research_areas: ['pomology', 'rootstocks', 'apple orchards'],
    bio: 'Studies rootstock and canopy effects on apple yield and fruit quality.',
    notes: '', open_to: ['joint_project'], status: 'active',
  }),
  researcher({
    researcher_id: 'R0068', name: 'Stevan Radovanović', title: 'Associate Professor',
    faculty: 'Faculty of Technical Sciences', department: 'Department of Mechatronics, Robotics and Automation',
    research_areas: ['unmanned aerial vehicles', 'computational fluid dynamics'],
    bio: 'Models rotor downwash and spray transport for agricultural drones.',
    notes: 'Left the faculty in March 2026.', open_to: ['industrial_phd'], status: 'left',
  }),
  researcher({
    researcher_id: 'R0217', name: 'Milica Kovačević', title: 'Associate Professor',
    faculty: 'Faculty of Agriculture', department: 'Department of Agricultural Engineering',
    research_areas: ['spray application technology', 'drift reduction', 'nozzles'],
    bio: 'Measures spray drift from field sprayers and tests drift-reducing nozzles.',
    notes: 'Open to co-supervising one industrial PhD starting 2027.',
    open_to: ['industrial_phd', 'joint_project'], status: 'active',
  }),

  // ---- publications ----
  publication({
    publication_id: 'SYN-PUB-03318', title: 'Early detection of outer-race bearing faults in induction motors from stator current',
    year: 2024, venue: 'Electrical Engineering',
    authors: [{ name: 'Vesna Lazić', researcher_id: 'R0412' }, { name: 'Đorđe Ilić', researcher_id: null }],
    keywords: ['bearing fault', 'MCSA', 'induction motor'],
  }),
  publication({
    publication_id: 'SYN-PUB-02210', title: 'Optical sorting of Fusarium-damaged kernels and its effect on deoxynivalenol in wheat',
    year: 2023, venue: 'Food Control',
    authors: [{ name: 'Mirjana Jeremić', researcher_id: 'R0539' }, { name: 'Aleksandar Popov', researcher_id: null }],
    keywords: ['deoxynivalenol', 'optical sorting', 'wheat'],
  }),
  publication({
    publication_id: 'SYN-PUB-01827', title: 'Debranning as a pre-milling step to reduce deoxynivalenol in wheat',
    year: 2021, venue: 'Journal of Cereal Science',
    authors: [{ name: 'Ivana Đukić', researcher_id: null }, { name: 'Mirjana Jeremić', researcher_id: 'R0539' }],
    keywords: ['debranning', 'deoxynivalenol', 'milling'],
  }),
  publication({
    publication_id: 'SYN-PUB-02944', title: 'Rootstock effects on fruit firmness of apple cv. Idared',
    year: 2022, venue: 'Scientia Horticulturae',
    authors: [{ name: 'Nina Mamužić', researcher_id: 'R0881' }, { name: 'Petar Simić', researcher_id: null }],
    keywords: ['rootstock', 'apple', 'firmness'],
  }),
  publication({
    publication_id: 'SYN-PUB-01562', title: 'Alginate coatings with ascorbic acid for fresh-cut apple',
    year: 2023, venue: 'Postharvest Biology and Technology',
    authors: [{ name: 'Nina Mamužić', researcher_id: 'R0128' }, { name: 'Jovana Petrić', researcher_id: null }],
    keywords: ['edible coating', 'fresh-cut', 'browning'],
  }),
  publication({
    publication_id: 'SYN-PUB-01095', title: 'Modified-atmosphere packaging of minimally processed fruit',
    year: 2020, venue: 'Food Packaging and Shelf Life',
    authors: [{ name: 'Nina Mamužić', researcher_id: 'R0128' }],
    keywords: ['MAP', 'shelf life'],
  }),
  publication({
    publication_id: 'SYN-PUB-00731', title: 'Rotor downwash and spray transport under a hexacopter',
    year: 2019, venue: 'Biosystems Engineering',
    authors: [{ name: 'Stevan Radovanović', researcher_id: 'R0068' }],
    keywords: ['CFD', 'downwash', 'UAV spraying'],
  }),
  publication({
    publication_id: 'SYN-PUB-02675', title: 'Drift from air-induction and flat-fan nozzles in crosswind',
    year: 2024, venue: 'Crop Protection',
    authors: [{ name: 'Milica Kovačević', researcher_id: 'R0217' }, { name: 'Luka Tomić', researcher_id: null }],
    keywords: ['spray drift', 'nozzles', 'crosswind'],
  }),

  // ---- projects and patents ----
  project({
    project_id: 'SYN-PRJ-0231', title: 'Test rig for bearing-fault diagnostics in electrical machines',
    years: '2022–2024', funder: 'Science Fund of the Republic of Serbia',
    participants: [{ name: 'Vesna Lazić', researcher_id: 'R0412', role: 'lead' }],
  }),
  project({
    project_id: 'SYN-PRJ-0158', title: 'Mycotoxin analysis laboratory for cereals (HPLC-MS/MS)',
    years: '2021–2025', funder: 'Provincial Secretariat for Higher Education and Scientific Research',
    participants: [{ name: 'Mirjana Jeremić', researcher_id: 'R0539', role: 'lead' }],
  }),
  project({
    project_id: 'SYN-PRJ-0304', title: 'Drift test stand for agricultural spray application',
    years: '2024–2027', funder: 'Science Fund of the Republic of Serbia',
    participants: [{ name: 'Milica Kovačević', researcher_id: 'R0217', role: 'lead' }],
  }),
  patent({
    patent_id: 'SYN-PAT-0087', title: 'Low-cost vibration sensing module for rotating machines',
    year: 2023, office: 'Intellectual Property Office of Serbia',
    inventors: [{ name: 'Vesna Lazić', researcher_id: 'R0412' }, { name: 'Đorđe Ilić', researcher_id: null }],
  }),

  // ---- companies ----
  company({
    company_id: 'C011', name: 'Elektromotori Bačka d.o.o.', city: 'Sombor', sector: 'Electric motor manufacturing',
    employees: 240, description: 'Builds low-voltage induction motors; every motor runs a 10-minute end-of-line test. Keeps test logs for 31,400 motors from 2023–2025.',
  }),
  company({
    company_id: 'C017', name: 'Panonija Mlin a.d.', city: 'Zrenjanin', sector: 'Flour milling',
    employees: 180, description: 'Wheat mill with a capacity of 420 t a day, buying from about 300 farms in Banat.',
  }),
  company({
    company_id: 'C031', name: 'Fruktal Srem d.o.o.', city: 'Šid', sector: 'Fresh-cut fruit',
    employees: 65, description: 'Grows apples on 140 ha and packs fresh-cut apple slices for chilled retail.',
  }),
  company({
    company_id: 'C009', name: 'Agrodron Sistemi d.o.o.', city: 'Novi Sad', sector: 'Agricultural drone services',
    employees: 34, description: 'Sprays crops with drones for farms in Vojvodina; 2,300 ha sprayed in 2025.',
  }),
  company({ company_id: 'C004', name: 'Vojvodina Biotek d.o.o.', city: 'Novi Sad', sector: 'Biotechnology', employees: 41, description: 'Develops diagnostic kits for veterinary use.' }),
  company({ company_id: 'C006', name: 'Termo Ventil d.o.o.', city: 'Subotica', sector: 'HVAC equipment', employees: 120, description: 'Makes industrial ventilation units.' }),
  company({ company_id: 'C012', name: 'Dunav Logistika d.o.o.', city: 'Novi Sad', sector: 'Logistics', employees: 310, description: 'Runs bonded warehouses on the Danube.' }),
  company({ company_id: 'C021', name: 'Pametna Njiva d.o.o.', city: 'Novi Sad', sector: 'Agritech start-up', employees: 9, description: 'Sells soil-moisture sensors to farms.' }),
  company({ company_id: 'C023', name: 'Hidro Sonar d.o.o.', city: 'Pančevo', sector: 'Marine electronics', employees: 22, description: 'Builds sonar transducers.' }),
  company({ company_id: 'C027', name: 'Banat Tekstil a.d.', city: 'Kikinda', sector: 'Textiles', employees: 205, description: 'Makes technical textiles for export.' }),
  company({ company_id: 'C036', name: 'Vinarija Fruška d.o.o.', city: 'Sremski Karlovci', sector: 'Wine', employees: 28, description: 'Family winery exporting to Romania and Germany.' }),
  company({ company_id: 'C040', name: 'Kofein Lab d.o.o.', city: 'Novi Sad', sector: 'Coffee roasting', employees: 17, description: 'Roasts and sells speciality coffee.' }),

  // ---- challenges ----
  challenge({
    challenge_id: 'C011-CH2', company_id: 'C011', title: 'Bearing failures on the end-of-line test bench',
    description: 'In 2025 the test bench stopped 14 times because a bearing failed in a motor under test, 6.5 hours per stoppage on average. We want a failing bearing flagged within the first 90 seconds of the 10-minute test.',
  }),
  challenge({
    challenge_id: 'C017-CH1', company_id: 'C017', title: 'Deoxynivalenol in incoming wheat',
    description: 'In 2025, 9% of incoming wheat lots exceeded 1,250 µg/kg DON and were sold as feed, a loss of about €310,000. We need a cleaning step that keeps more lots food grade.',
  }),
  challenge({
    challenge_id: 'C031-CH2', company_id: 'C031', title: 'Shelf life of fresh-cut apple slices',
    description: 'Our apple slices keep 6 days in chilled retail. Two retail chains require 10 days before they will list them.',
  }),
  challenge({
    challenge_id: 'C009-CH2', company_id: 'C009', title: 'Spray drift from drone application',
    description: 'In winds above 3 m/s, about 18% of the product sprayed from our drones lands outside the field edge. We need nozzle and flight settings that keep drift under 5%.',
  }),
  challenge({ challenge_id: 'C004-CH4', company_id: 'C004', title: 'Licensing delay for a veterinary test kit', description: 'Our registration with the ministry has been pending for 11 months.' }),
  challenge({ challenge_id: 'C021-CH3', company_id: 'C021', title: 'Closing a seed round', description: 'We are raising €400,000 and need introductions to investors.' }),
  challenge({ challenge_id: 'C006-CH3', company_id: 'C006', title: 'Hiring sales engineers for Germany', description: 'We need two German-speaking sales engineers by spring.' }),
  challenge({ challenge_id: 'C012-CH1', company_id: 'C012', title: 'ERP migration deadline', description: 'Our ERP vendor ends support in June; we must migrate 14 years of records.' }),
  challenge({ challenge_id: 'C023-CH1', company_id: 'C023', title: 'Calibrating deep-water sonar transducers', description: 'We need a test tank deeper than 40 m to calibrate transducers.' }),
  challenge({ challenge_id: 'C027-CH3', company_id: 'C027', title: 'Export credit insurance', description: 'Our insurer has cut cover for buyers in two markets.' }),
  challenge({ challenge_id: 'C036-CH2', company_id: 'C036', title: 'Trademark dispute in Romania', description: 'A Romanian winery registered a mark close to ours.' }),
  challenge({ challenge_id: 'C040-CH1', company_id: 'C040', title: 'Rebranding before a café opening', description: 'We need a new brand identity before opening our first café.' }),
];

export const recordById = new Map(records.map((r) => [r.id, r]));
