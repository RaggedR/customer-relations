/**
 * Seed Script
 *
 * Populates the database with rich test data covering every combination:
 * - Companies with and without contacts
 * - Contacts with and without companies
 * - Contacts with and without deals
 * - Deals at every pipeline stage
 * - Deals with and without companies
 * - Interactions of every type
 * - Contacts with multiple interactions
 * - Contacts with no interactions
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL || "");
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Clearing existing data...");
  await prisma.interaction.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();

  console.log("Creating companies...");
  const companies = await Promise.all([
    prisma.company.create({
      data: { name: "Acme Corp", industry: "Manufacturing", website: "https://acme.example.com" },
    }),
    prisma.company.create({
      data: { name: "Globex Industries", industry: "Technology", website: "https://globex.example.com" },
    }),
    prisma.company.create({
      data: { name: "Stark Enterprises", industry: "Defense", website: "https://stark.example.com" },
    }),
    prisma.company.create({
      data: { name: "Wayne Ventures", industry: "Finance", website: "https://wayne.example.com" },
    }),
    prisma.company.create({
      data: { name: "Umbrella Corp", industry: "Pharmaceuticals", website: "https://umbrella.example.com" },
    }),
    // Company with no contacts (orphan)
    prisma.company.create({
      data: { name: "Empty Holdings LLC", industry: "Real Estate" },
    }),
    // Company with minimal data
    prisma.company.create({
      data: { name: "Mystery Inc" },
    }),
  ]);

  const [acme, globex, stark, wayne, umbrella, emptyHoldings, mystery] = companies;

  console.log("Creating contacts...");
  const contacts = await Promise.all([
    // Acme Corp contacts
    prisma.contact.create({
      data: {
        name: "Alice Johnson",
        email: "alice@acme.example.com",
        phone: "+1-555-0101",
        role: "VP of Sales",
        notes: "Key decision maker. Prefers email communication.",
        companyId: acme.id,
      },
    }),
    prisma.contact.create({
      data: {
        name: "Bob Smith",
        email: "bob@acme.example.com",
        phone: "+1-555-0102",
        role: "CTO",
        notes: "Technical evaluator. Very detail-oriented.",
        companyId: acme.id,
      },
    }),
    // Globex contacts
    prisma.contact.create({
      data: {
        name: "Carol Williams",
        email: "carol@globex.example.com",
        phone: "+1-555-0201",
        role: "CEO",
        companyId: globex.id,
      },
    }),
    prisma.contact.create({
      data: {
        name: "Dave Brown",
        email: "dave@globex.example.com",
        phone: "+1-555-0202",
        role: "Procurement Manager",
        notes: "Budget holder. Needs ROI justification.",
        companyId: globex.id,
      },
    }),
    // Stark Enterprises
    prisma.contact.create({
      data: {
        name: "Eve Davis",
        email: "eve@stark.example.com",
        phone: "+44-20-7946-0958",
        role: "Head of Innovation",
        notes: "Based in London office. Interested in AI features.",
        companyId: stark.id,
      },
    }),
    // Wayne Ventures
    prisma.contact.create({
      data: {
        name: "Frank Miller",
        email: "frank@wayne.example.com",
        phone: "+1-555-0401",
        role: "CFO",
        companyId: wayne.id,
      },
    }),
    // Umbrella Corp
    prisma.contact.create({
      data: {
        name: "Grace Lee",
        email: "grace@umbrella.example.com",
        phone: "+1-555-0501",
        role: "Research Director",
        notes: "Very interested but slow internal approval process.",
        companyId: umbrella.id,
      },
    }),
    // Contact with NO company (freelancer)
    prisma.contact.create({
      data: {
        name: "Henry Wilson",
        email: "henry@freelance.example.com",
        phone: "+1-555-0601",
        role: "Independent Consultant",
        notes: "No company affiliation. Met at conference.",
      },
    }),
    // Contact with minimal data
    prisma.contact.create({
      data: {
        name: "Iris Chen",
        email: "iris@example.com",
      },
    }),
    // Contact with only name and phone
    prisma.contact.create({
      data: {
        name: "Jack Thompson",
        phone: "+61-2-9876-5432",
        notes: "Referral from Alice. No email yet.",
        companyId: mystery.id,
      },
    }),
    // Contact with no deals, no interactions (cold)
    prisma.contact.create({
      data: {
        name: "Karen White",
        email: "karen@example.com",
        phone: "+1-555-0701",
        role: "Marketing Director",
        companyId: wayne.id,
      },
    }),
  ]);

  const [alice, bob, carol, dave, eve, frank, grace, henry, iris, jack, karen] = contacts;

  console.log("Creating deals at every pipeline stage...");
  await Promise.all([
    // Lead stage
    prisma.deal.create({
      data: {
        title: "Acme Annual Contract",
        value: 50000,
        stage: "lead",
        expected_close: new Date("2026-06-15"),
        notes: "Initial inquiry from website form.",
        contactId: alice.id,
        companyId: acme.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: "Mystery Inc Exploration",
        value: 5000,
        stage: "lead",
        notes: "Very early stage. Need to qualify.",
        contactId: jack.id,
        companyId: mystery.id,
      },
    }),
    // Qualified stage
    prisma.deal.create({
      data: {
        title: "Globex Platform License",
        value: 120000,
        stage: "qualified",
        expected_close: new Date("2026-07-01"),
        notes: "Budget confirmed. Technical evaluation next.",
        contactId: carol.id,
        companyId: globex.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: "Freelance Consulting Setup",
        value: 15000,
        stage: "qualified",
        expected_close: new Date("2026-05-20"),
        contactId: henry.id,
        // No company — freelancer deal
      },
    }),
    // Proposal stage
    prisma.deal.create({
      data: {
        title: "Stark Innovation Package",
        value: 250000,
        stage: "proposal",
        expected_close: new Date("2026-08-01"),
        notes: "Proposal sent April 5. Awaiting feedback from London.",
        contactId: eve.id,
        companyId: stark.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: "Globex Add-on Modules",
        value: 35000,
        stage: "proposal",
        expected_close: new Date("2026-06-01"),
        notes: "Upsell to existing platform license.",
        contactId: dave.id,
        companyId: globex.id,
      },
    }),
    // Negotiation stage
    prisma.deal.create({
      data: {
        title: "Wayne Financial Suite",
        value: 180000,
        stage: "negotiation",
        expected_close: new Date("2026-05-15"),
        notes: "Legal reviewing contract terms. Close expected soon.",
        contactId: frank.id,
        companyId: wayne.id,
      },
    }),
    // Closed Won
    prisma.deal.create({
      data: {
        title: "Acme Training Package",
        value: 8000,
        stage: "closed_won",
        expected_close: new Date("2026-03-01"),
        notes: "Delivered and paid. Happy customer.",
        contactId: bob.id,
        companyId: acme.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: "Umbrella Research License",
        value: 95000,
        stage: "closed_won",
        expected_close: new Date("2026-04-01"),
        notes: "Signed after 6 months of evaluation.",
        contactId: grace.id,
        companyId: umbrella.id,
      },
    }),
    // Closed Lost
    prisma.deal.create({
      data: {
        title: "Iris Exploration Deal",
        value: 20000,
        stage: "closed_lost",
        notes: "Went with a competitor. Price was the issue.",
        contactId: iris.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: "Acme Premium Upgrade",
        value: 75000,
        stage: "closed_lost",
        expected_close: new Date("2026-02-15"),
        notes: "Budget was reallocated internally. May revisit Q3.",
        contactId: alice.id,
        companyId: acme.id,
      },
    }),
  ]);

  console.log("Creating interactions of every type...");
  await Promise.all([
    // Alice — multiple interactions (active relationship)
    prisma.interaction.create({
      data: {
        summary: "Initial discovery call. Alice described their needs for contract management.",
        date: new Date("2026-01-15T10:00:00Z"),
        type: "call",
        contactId: alice.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Sent product overview deck and pricing sheet.",
        date: new Date("2026-01-20T14:00:00Z"),
        type: "email",
        contactId: alice.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "On-site demo with Alice and her team. Very positive feedback.",
        date: new Date("2026-02-05T09:00:00Z"),
        type: "meeting",
        contactId: alice.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Alice mentioned budget freeze may delay decision. Follow up in March.",
        date: new Date("2026-02-20T11:00:00Z"),
        type: "note",
        contactId: alice.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Follow-up call after budget freeze lifted. Ready to proceed.",
        date: new Date("2026-03-15T10:00:00Z"),
        type: "call",
        contactId: alice.id,
      },
    }),

    // Bob — technical interactions
    prisma.interaction.create({
      data: {
        summary: "Technical deep-dive call with Bob on API integration requirements.",
        date: new Date("2026-02-10T15:00:00Z"),
        type: "call",
        contactId: bob.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Sent API documentation and sandbox credentials.",
        date: new Date("2026-02-12T09:00:00Z"),
        type: "email",
        contactId: bob.id,
      },
    }),

    // Carol — CEO-level interactions
    prisma.interaction.create({
      data: {
        summary: "Introductory meeting at Tech Summit 2026. Carol very interested.",
        date: new Date("2026-01-28T16:00:00Z"),
        type: "meeting",
        contactId: carol.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Carol forwarded us to Dave for procurement process.",
        date: new Date("2026-02-01T10:00:00Z"),
        type: "email",
        contactId: carol.id,
      },
    }),

    // Dave — procurement interactions
    prisma.interaction.create({
      data: {
        summary: "Call with Dave to discuss pricing tiers and volume discounts.",
        date: new Date("2026-02-15T14:00:00Z"),
        type: "call",
        contactId: dave.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Sent revised proposal with volume pricing to Dave.",
        date: new Date("2026-03-01T09:00:00Z"),
        type: "email",
        contactId: dave.id,
      },
    }),

    // Eve — international interactions
    prisma.interaction.create({
      data: {
        summary: "Video call with Eve in London. Discussed AI roadmap and innovation use cases.",
        date: new Date("2026-03-10T08:00:00Z"),
        type: "call",
        contactId: eve.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Sent proposal to Eve. She needs internal approval from NY office.",
        date: new Date("2026-04-05T12:00:00Z"),
        type: "email",
        contactId: eve.id,
      },
    }),

    // Frank — finance interactions
    prisma.interaction.create({
      data: {
        summary: "Contract negotiation meeting with Frank and legal team.",
        date: new Date("2026-04-02T11:00:00Z"),
        type: "meeting",
        contactId: frank.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Frank requested revised payment terms — net 60 instead of net 30.",
        date: new Date("2026-04-08T15:00:00Z"),
        type: "note",
        contactId: frank.id,
      },
    }),

    // Grace — slow-moving interactions
    prisma.interaction.create({
      data: {
        summary: "Initial call with Grace. Interested but says approval takes months.",
        date: new Date("2025-10-15T10:00:00Z"),
        type: "call",
        contactId: grace.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Quarterly check-in with Grace. Still in internal review.",
        date: new Date("2026-01-10T10:00:00Z"),
        type: "call",
        contactId: grace.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Grace confirmed approval! Sending contract.",
        date: new Date("2026-03-20T14:00:00Z"),
        type: "email",
        contactId: grace.id,
      },
    }),

    // Henry — freelancer interactions
    prisma.interaction.create({
      data: {
        summary: "Met Henry at DevConf 2026. Exchanged cards.",
        date: new Date("2026-02-22T17:00:00Z"),
        type: "meeting",
        contactId: henry.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Henry called to discuss consulting engagement scope.",
        date: new Date("2026-03-05T10:00:00Z"),
        type: "call",
        contactId: henry.id,
      },
    }),

    // Iris — minimal interaction before losing the deal
    prisma.interaction.create({
      data: {
        summary: "Cold email to Iris. She responded with interest.",
        date: new Date("2026-01-05T09:00:00Z"),
        type: "email",
        contactId: iris.id,
      },
    }),
    prisma.interaction.create({
      data: {
        summary: "Iris informed us they chose a competitor. Price was deciding factor.",
        date: new Date("2026-03-25T11:00:00Z"),
        type: "email",
        contactId: iris.id,
      },
    }),

    // Jack — referral with minimal interaction
    prisma.interaction.create({
      data: {
        summary: "Alice referred Jack. Left voicemail, waiting for callback.",
        date: new Date("2026-04-01T10:00:00Z"),
        type: "note",
        contactId: jack.id,
      },
    }),

    // Karen — NO interactions (completely cold contact)
  ]);

  console.log("\nSeed complete! Summary:");
  const companyCount = await prisma.company.count();
  const contactCount = await prisma.contact.count();
  const dealCount = await prisma.deal.count();
  const interactionCount = await prisma.interaction.count();
  console.log(`  Companies:    ${companyCount}`);
  console.log(`  Contacts:     ${contactCount}`);
  console.log(`  Deals:        ${dealCount}`);
  console.log(`  Interactions: ${interactionCount}`);
  console.log("\nRelation coverage:");
  console.log("  - Companies with multiple contacts (Acme, Globex, Wayne)");
  console.log("  - Company with no contacts (Empty Holdings LLC)");
  console.log("  - Company with minimal data (Mystery Inc)");
  console.log("  - Contact with no company (Henry — freelancer)");
  console.log("  - Contact with minimal data (Iris — email only)");
  console.log("  - Contact with no email (Jack — phone only)");
  console.log("  - Contact with no deals or interactions (Karen — cold)");
  console.log("  - Contact with multiple deals (Alice — 2 deals)");
  console.log("  - Contact with multiple interactions (Alice — 5)");
  console.log("  - Deal with no company (Henry's freelance deal)");
  console.log("  - Deal with no expected close date (Mystery, Iris deals)");
  console.log("  - Deals at every stage: lead(2), qualified(2), proposal(2), negotiation(1), closed_won(2), closed_lost(2)");
  console.log("  - Interactions of every type: call, email, meeting, note");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
