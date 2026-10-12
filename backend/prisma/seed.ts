import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Federal Nigerian public holidays only (per the plan — state-specific
 * holidays are explicitly out of scope). Fixed-date holidays are listed
 * for the given year; Eid al-Fitr and Eid al-Adha are moon-sighting-based,
 * so their dates below are estimates and MUST be confirmed/adjusted by an
 * admin closer to the date once the government announces them.
 */
const HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-01', name: "Workers' Day" },
  { date: '2026-05-20', name: 'Eid al-Fitr (estimated — confirm date)' },
  { date: '2026-06-12', name: 'Democracy Day' },
  { date: '2026-07-27', name: 'Eid al-Adha (estimated — confirm date)' },
  { date: '2026-10-01', name: 'Independence Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day' },
];

/**
 * A starter topic bank. Like the holiday list this is admin-maintained: add or
 * retire rows over time rather than treating it as fixed. Upserting by title
 * means re-running the seed is safe and won't duplicate or clobber edits to
 * fields that already exist.
 */
const TOPICS = [
  {
    title: 'Design and Implementation of an Online Result Checking System',
    field: 'Software Engineering',
    description: 'A secure web portal where students check semester results with an admin upload flow.',
  },
  {
    title: 'A Student Attendance Management System Using QR Codes',
    field: 'Software Engineering',
    description: 'Lecturers generate rotating QR codes; students check in from a mobile page.',
  },
  {
    title: 'A Web-Based Hostel Allocation and Management System',
    field: 'Information Systems',
    description: 'Room allocation, booking and maintenance complaints for campus hostels.',
  },
  {
    title: 'Design of an E-Learning Platform with Offline Access',
    field: 'Software Engineering',
    description: 'Courseware that caches lessons so students can study without a constant connection.',
  },
  {
    title: 'A Campus Lost-and-Found Portal',
    field: 'Information Systems',
    description: 'Report, search and claim lost items, with image uploads and matching.',
  },
  {
    title: 'A Phishing Detection System Using Machine Learning',
    field: 'Cybersecurity',
    description: 'Classify URLs and emails as phishing or legitimate and explain the deciding features.',
  },
  {
    title: 'Design of a Two-Factor Authentication Scheme for University Portals',
    field: 'Cybersecurity',
    description: 'Add a second factor (OTP or authenticator app) to student and staff logins.',
  },
  {
    title: 'Vulnerability Assessment of a Small Business Network',
    field: 'Cybersecurity',
    description: 'Scan, document and rank the findings, then propose and test mitigations.',
  },
  {
    title: 'Development of a Password Manager with AES Encryption',
    field: 'Cybersecurity',
    description: 'A vault that stores credentials under one master password using a modern cipher.',
  },
  {
    title: 'Predicting Student Academic Performance Using Machine Learning',
    field: 'Data Science & AI',
    description: 'Train and compare models on attendance, CA scores and study habits.',
  },
  {
    title: 'A Chatbot for Academic Advising Using Natural Language Processing',
    field: 'Data Science & AI',
    description: 'Answer common course and registration questions from a knowledge base.',
  },
  {
    title: 'Sentiment Analysis of Social Media Posts on Nigerian Elections',
    field: 'Data Science & AI',
    description: 'Scrape posts, classify sentiment and visualise trends over the campaign period.',
  },
  {
    title: 'Crop Yield Prediction Using Regression Models',
    field: 'Data Science & AI',
    description: 'Estimate yield from rainfall, soil and fertiliser data, and measure error.',
  },
  {
    title: 'Design and Simulation of a Campus Area Network',
    field: 'Networking',
    description: 'Plan the topology, subnets and routing, then simulate traffic in a packet tool.',
  },
  {
    title: 'Implementation of a VoIP System for a Small Enterprise',
    field: 'Networking',
    description: 'A low-cost IP telephony setup with call routing and quality measurements.',
  },
  {
    title: 'An IoT-Based Smart Home Automation System',
    field: 'Networking',
    description: 'Sensors and relays controlled from a dashboard or phone over Wi-Fi.',
  },
  {
    title: 'Design of a Network Monitoring Dashboard',
    field: 'Networking',
    description: 'Poll devices, plot availability and alert on downtime or high latency.',
  },
  {
    title: 'A Point-of-Sale and Inventory System for a Retail Store',
    field: 'Information Systems',
    description: 'Sales, stock levels and reorder alerts with a receipt printer hook.',
  },
  {
    title: 'Development of a Hospital Patient Records Management System',
    field: 'Information Systems',
    description: 'Registration, appointments and medical history with role-based access.',
  },
  {
    title: 'An Online Library Management System with Fine Tracking',
    field: 'Information Systems',
    description: 'Catalogue, borrowing, returns and automatic overdue-fine calculation.',
  },
  {
    title: 'A Payroll Management System for Small and Medium Enterprises',
    field: 'Information Systems',
    description: 'Salary, tax and pension computation with payslip generation.',
  },
  {
    title: 'Design of a Mobile Banking Application Prototype',
    field: 'Banking & Finance',
    description: 'Accounts, transfers and statements with a focus on usable, secure flows.',
  },
  {
    title: 'A Fraud Detection Framework for Electronic Payment Systems',
    field: 'Banking & Finance',
    description: 'Flag suspicious transactions using rules and a simple anomaly model.',
  },
  {
    title: 'Development of a Loan Management System for Microfinance Banks',
    field: 'Banking & Finance',
    description: 'Applications, approval workflow, repayment schedules and arrears.',
  },
  {
    title: "Impact of Social Media on Students' Academic Performance",
    field: 'General Research',
    description: 'A study design with survey instruments and statistical analysis.',
  },
  {
    title: 'Assessment of Cybersecurity Awareness Among University Students',
    field: 'General Research',
    description: 'Survey awareness, analyse gaps and recommend a sensitisation plan.',
  },
];

async function main() {
  for (const h of HOLIDAYS_2026) {
    const date = new Date(h.date);
    await prisma.publicHoliday.upsert({
      where: { date_name: { date, name: h.name } },
      update: {},
      create: { date, name: h.name, year: date.getFullYear() },
    });
  }
  console.log(`Seeded ${HOLIDAYS_2026.length} holidays for 2026.`);

  for (const topic of TOPICS) {
    await prisma.projectTopic.upsert({
      where: { title: topic.title },
      update: {},
      create: topic,
    });
  }
  console.log(`Seeded ${TOPICS.length} project topics.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
