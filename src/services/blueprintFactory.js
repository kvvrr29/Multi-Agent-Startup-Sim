import { useProjectMemoryStore } from '../store/projectMemoryStore';

// ── Markdown builders for profile-driven sections ────────────────────────────

const buildTargetUsers = (users) =>
  `### Primary User Segments\n${users.map(u => `- **${u.name}:** ${u.description}`).join('\n')}`;

const buildProposedSolution = (solution) =>
  `### Solution Overview\n${solution.summary}\n\n### Key Differentiators\n${solution.differentiators.map(d => `- ${d}`).join('\n')}`;

const buildMvpScope = (mvp) =>
  `### In Scope (MVP)\n${mvp.inScope.map(f => `- ${f}`).join('\n')}\n\n### Explicitly Out of Scope\n${mvp.outOfScope.map(f => `- ${f}`).join('\n')}`;

const buildKeyFeatures = (features) =>
  features.map(f => `### ${f.name}\n${f.description}`).join('\n\n');

const buildTechStack = (stack) =>
  `| Layer | Choice | Rationale |\n|---|---|---|\n${stack.map(s => `| ${s.layer} | ${s.choice} | ${s.rationale} |`).join('\n')}`;

const buildBudget = (budget, totalBudget) =>
  `### Estimated Cost Breakdown\n| Item | Estimate |\n|---|---|\n${budget.items.map(b => `| ${b.item} | ${b.estimate} |`).join('\n')}\n\n**Declared Budget:** ${totalBudget}\n\n${budget.note}`;

const buildRisks = (risks) =>
  `| Risk | Impact | Mitigation |\n|---|---|---|\n${risks.map(r => `| ${r.risk} | ${r.impact} | ${r.mitigation} |`).join('\n')}`;

const buildTimeline = (timeline, declaredTimeline) => {
  let md = `| Phase | Duration | Deliverables |\n|---|---|---|\n${timeline.map(t => `| ${t.phase} | ${t.duration} | ${t.deliverables} |`).join('\n')}`;
  if (declaredTimeline && declaredTimeline !== 'N/A') {
    md += `\n\n**Declared Target Timeline:** ${declaredTimeline}`;
  }
  return md;
};

const buildRecommendations = (recommendations) =>
  recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');

// ── Domain profiles for the newer blueprint sections ─────────────────────────

const DOMAIN_PROFILES = {
  general: {
    users: [
      { name: 'Early Adopters', description: 'Tech-forward professionals looking for a modern alternative to fragmented legacy tools.' },
      { name: 'Team Leads', description: 'Managers who need visibility across workflows without manual reporting.' },
      { name: 'Small Businesses', description: 'Teams of 5-50 that cannot afford enterprise software but need automation.' }
    ],
    solution: {
      summary: 'A unified platform that automates core workflows and consolidates disjointed data into one intuitive workspace.',
      differentiators: ['Single source of truth replacing multiple point tools', 'Automation-first workflow engine', 'Modern UX with fast onboarding']
    },
    mvp: {
      inScope: ['Core authentication and user management', 'Primary dashboard with basic analytics', 'Workflow management engine'],
      outOfScope: ['Enterprise SSO and audit logs', 'Advanced third-party integrations', 'Mobile applications']
    },
    keyFeatures: [
      { name: 'Unified Dashboard', description: 'A single view aggregating status, metrics, and pending actions across all workflows.' },
      { name: 'Workflow Automation', description: 'Configurable rules that eliminate repetitive manual steps.' },
      { name: 'Actionable Analytics', description: 'Built-in reporting that surfaces insights without exports or spreadsheets.' }
    ],
    techStack: [
      { layer: 'Frontend', choice: 'React + Vite', rationale: 'Fast iteration and a large ecosystem' },
      { layer: 'Backend', choice: 'Node.js (Express/Fastify)', rationale: 'Shared language across the stack' },
      { layer: 'Database', choice: 'PostgreSQL', rationale: 'Reliable relational core with JSON support' },
      { layer: 'Cache', choice: 'Redis', rationale: 'Session storage and hot-path caching' },
      { layer: 'Infrastructure', choice: 'Docker on a managed cloud', rationale: 'Simple deploys with room to scale' }
    ],
    budget: {
      items: [
        { item: 'MVP development (3-4 months)', estimate: '55-65% of budget' },
        { item: 'Cloud infrastructure (year 1)', estimate: '10-15% of budget' },
        { item: 'Design & UX', estimate: '10% of budget' },
        { item: 'Marketing & launch', estimate: '15-20% of budget' }
      ],
      note: 'Keep a 10% contingency reserve for scope discovered during development.'
    },
    risks: [
      { risk: 'High customer acquisition cost', impact: 'High', mitigation: 'Target mid-market before enterprise; lean on content marketing' },
      { risk: 'Platform lock-in resistance', impact: 'Medium', mitigation: 'Build lightweight integrations and easy data export' },
      { risk: 'Scope creep in MVP', impact: 'Medium', mitigation: 'Strict MVP boundary; defer requests to Phase 2 backlog' }
    ],
    timeline: [
      { phase: 'Phase 1 — MVP', duration: '3 months', deliverables: 'Auth, dashboard, workflow engine' },
      { phase: 'Phase 2 — Growth', duration: '3 months', deliverables: 'Integrations, reporting, exports' },
      { phase: 'Phase 3 — Scale', duration: '6 months', deliverables: 'Enterprise features, public API' }
    ],
    recommendations: [
      'Validate the workflow engine with 5-10 design partners before public launch.',
      'Instrument analytics from day one to measure activation and retention.',
      'Delay enterprise features until mid-market traction is proven.'
    ]
  },

  food: {
    users: [
      { name: 'Hungry Professionals', description: 'Time-poor office workers ordering lunch and dinner on weekdays.' },
      { name: 'Students', description: 'Price-sensitive frequent orderers concentrated near campuses.' },
      { name: 'Local Restaurants', description: 'Independent eateries seeking lower commissions and better order tooling.' },
      { name: 'Delivery Drivers', description: 'Gig workers who value fair pay-per-delivery and efficient routing.' }
    ],
    solution: {
      summary: 'A hyperlocal delivery platform connecting local restaurants with vetted drivers, featuring real-time GPS tracking and lower commission rates for partnered eateries.',
      differentiators: ['Lower commissions than incumbent platforms', 'Real-time driver tracking with accurate ETAs', 'Restaurant-friendly order management portal']
    },
    mvp: {
      inScope: ['Customer app: browse restaurants, order, checkout', 'Restaurant portal: accept orders, manage menu', 'Driver app: claim deliveries, GPS routing', 'Live order tracking'],
      outOfScope: ['Grocery and pharmacy delivery', 'Loyalty programs and subscriptions', 'Dark kitchen partnerships']
    },
    keyFeatures: [
      { name: 'Real-Time Order Tracking', description: 'Live GPS location of the driver with accurate delivery ETAs for customers and restaurants.' },
      { name: 'Restaurant Order Portal', description: 'One-tap order acceptance, menu management, and prep-time control for restaurant staff.' },
      { name: 'Smart Driver Dispatch', description: 'Automatic assignment of the nearest available driver with route guidance.' },
      { name: 'Integrated Payments', description: 'Card and wallet checkout with automatic split between platform, restaurant, and driver.' }
    ],
    techStack: [
      { layer: 'Mobile Apps', choice: 'React Native', rationale: 'One codebase for customer and driver apps' },
      { layer: 'Backend', choice: 'Node.js microservices', rationale: 'Independent scaling of orders, payments, tracking' },
      { layer: 'Database', choice: 'PostgreSQL', rationale: 'Transactional integrity for orders and payouts' },
      { layer: 'Geospatial', choice: 'Redis GeoSpatial', rationale: 'Sub-second driver location queries' },
      { layer: 'Payments', choice: 'Stripe Connect', rationale: 'Built-in multi-party payout splitting' }
    ],
    budget: {
      items: [
        { item: 'Customer, driver & restaurant apps', estimate: '45-55% of budget' },
        { item: 'Real-time tracking infrastructure', estimate: '10% of budget' },
        { item: 'Driver acquisition incentives', estimate: '15% of budget' },
        { item: 'Restaurant onboarding & promotions', estimate: '15-20% of budget' }
      ],
      note: 'Delivery marketplaces burn cash on both supply and demand sides — model per-order unit economics early.'
    },
    risks: [
      { risk: 'Driver churn', impact: 'High', mitigation: 'Retention bonuses tied to completed deliveries' },
      { risk: 'Aggressive local competition', impact: 'High', mitigation: 'Hyperlocal launch with exclusive restaurant menus' },
      { risk: 'Thin per-order margins', impact: 'Medium', mitigation: 'Dynamic delivery fees and batching of nearby orders' }
    ],
    timeline: [
      { phase: 'Phase 1 — MVP', duration: '3-4 months', deliverables: 'Customer app, restaurant portal, driver app' },
      { phase: 'Phase 2 — Growth', duration: '3 months', deliverables: 'Route optimization, loyalty, subscriptions' },
      { phase: 'Phase 3 — Scale', duration: '6 months', deliverables: 'Grocery expansion, dark kitchens' }
    ],
    recommendations: [
      'Launch in a single dense neighborhood and reach order density before expanding.',
      'Sign 15-20 exclusive restaurants with a 0% introductory commission.',
      'Track cost-per-delivery weekly — unit economics decide survival in this market.'
    ]
  },

  chess: {
    users: [
      { name: 'Improving Players', description: 'Club-level players (800-1800 Elo) seeking structured coaching.' },
      { name: 'Competitive Juniors', description: 'Scholastic players and parents investing in tournament preparation.' },
      { name: 'Coaches & Titled Players', description: 'GMs, IMs, and certified coaches monetizing their expertise.' }
    ],
    solution: {
      summary: 'An all-in-one chess coaching platform featuring a coach marketplace, integrated video calling, and synchronized interactive analysis boards.',
      differentiators: ['Verified coach credentials and titles', 'Video + synchronized board in one lesson room', 'Integrated engine analysis without leaving the platform']
    },
    mvp: {
      inScope: ['Coach profiles with verified titles and availability', 'Lesson booking and payments', 'Interactive 2D chessboard in the lesson room'],
      outOfScope: ['Automated AI game reviews', 'Group lessons and tournaments', 'Native mobile apps']
    },
    keyFeatures: [
      { name: 'Coach Marketplace', description: 'Searchable directory of verified coaches with ratings, hourly rates, and instant booking.' },
      { name: 'Live Lesson Room', description: 'WebRTC video call synchronized with a shared interactive chessboard.' },
      { name: 'Engine Analysis', description: 'Stockfish evaluation of positions and games directly inside lessons.' },
      { name: 'Game Library', description: 'PGN storage of every lesson game for later review by student and coach.' }
    ],
    techStack: [
      { layer: 'Frontend', choice: 'React', rationale: 'Rich interactive board UI' },
      { layer: 'Realtime', choice: 'WebSockets + WebRTC', rationale: 'Board sync and video calling' },
      { layer: 'Backend', choice: 'Node.js', rationale: 'Event-driven realtime workloads' },
      { layer: 'Engine', choice: 'Stockfish cluster', rationale: 'Position evaluation at scale' },
      { layer: 'Database', choice: 'PostgreSQL', rationale: 'Bookings, payments, PGN storage' }
    ],
    budget: {
      items: [
        { item: 'Platform & lesson room development', estimate: '50-60% of budget' },
        { item: 'Engine compute (Stockfish servers)', estimate: '10% of budget' },
        { item: 'Coach acquisition & verification', estimate: '10% of budget' },
        { item: 'Marketing (streamers, clubs)', estimate: '20% of budget' }
      ],
      note: 'Cache engine evaluations for common openings to keep compute costs flat as usage grows.'
    },
    risks: [
      { risk: 'Coaches taking students off-platform', impact: 'High', mitigation: 'Make lesson tooling indispensable; rebooking discounts' },
      { risk: 'Engine compute costs at scale', impact: 'Medium', mitigation: 'Evaluation caching and tiered analysis depth' },
      { risk: 'Two-sided marketplace cold start', impact: 'High', mitigation: 'Seed supply with 20-30 verified coaches before demand launch' }
    ],
    timeline: [
      { phase: 'Phase 1 — MVP', duration: '3 months', deliverables: 'Profiles, booking, payments, interactive board' },
      { phase: 'Phase 2 — Growth', duration: '2-3 months', deliverables: 'WebRTC video, engine integration' },
      { phase: 'Phase 3 — Scale', duration: '6 months', deliverables: 'AI reviews, group lessons, tournaments' }
    ],
    recommendations: [
      'Recruit and verify an initial cohort of titled coaches before opening student signups.',
      'Sponsor two or three mid-size chess streamers for launch rather than one large one.',
      'Build the synchronized board experience so well that off-platform lessons feel worse.'
    ]
  },

  hospital: {
    users: [
      { name: 'Doctors & Nurses', description: 'Clinical staff who need fast, reliable access to patient records.' },
      { name: 'Hospital Administrators', description: 'Operations teams managing scheduling, billing, and compliance.' },
      { name: 'Patients', description: 'Individuals booking appointments and accessing their own health data.' }
    ],
    solution: {
      summary: 'A secure, cloud-based Hospital Management System (HMS) that centralizes electronic health records, staff scheduling, and billing in a HIPAA-compliant environment.',
      differentiators: ['HIPAA-compliant by design with immutable audit logging', 'Unified EHR, scheduling, and billing in one system', 'Role-based access tailored to clinical workflows']
    },
    mvp: {
      inScope: ['Patient registration and appointment scheduling', 'Electronic Health Records (EHR) module', 'Role-based access control (doctors, nurses, admin)'],
      outOfScope: ['Insurance claim processing', 'Pharmacy and inventory management', 'Patient mobile app and telemedicine']
    },
    keyFeatures: [
      { name: 'Electronic Health Records', description: 'Centralized, encrypted patient records with full authoring history.' },
      { name: 'Appointment Scheduling', description: 'Patient booking with doctor availability, reminders, and throughput reporting.' },
      { name: 'Role-Based Access Control', description: 'Granular permissions for doctors, nurses, and administrators with least-privilege defaults.' },
      { name: 'Immutable Audit Trail', description: 'Every record access and change logged for HIPAA compliance reviews.' }
    ],
    techStack: [
      { layer: 'Frontend', choice: 'React', rationale: 'Responsive portals for staff and patients' },
      { layer: 'Backend', choice: 'Java Spring Boot / .NET Core', rationale: 'Mature security and compliance ecosystem' },
      { layer: 'Database', choice: 'Encrypted PostgreSQL', rationale: 'At-rest encryption for PHI' },
      { layer: 'Identity', choice: 'HIPAA-compliant IAM', rationale: 'Role-based clinical access control' },
      { layer: 'Infrastructure', choice: 'HIPAA-eligible cloud (BAA)', rationale: 'Compliance-certified hosting' }
    ],
    budget: {
      items: [
        { item: 'Core HMS development (6-8 months)', estimate: '45-55% of budget' },
        { item: 'HIPAA / SOC2 compliance & audits', estimate: '15-20% of budget' },
        { item: 'Secure infrastructure (year 1)', estimate: '10-15% of budget' },
        { item: 'Enterprise sales & pilots', estimate: '15% of budget' }
      ],
      note: 'Compliance certification is a prerequisite for sales — budget it before marketing.'
    },
    risks: [
      { risk: 'Long enterprise sales cycles (12-18 months)', impact: 'High', mitigation: 'Free pilot with a regional clinic to build reference cases' },
      { risk: 'HIPAA/SOC2 compliance gaps', impact: 'High', mitigation: 'Engage a compliance auditor from the design phase' },
      { risk: 'Data migration from legacy EHRs', impact: 'Medium', mitigation: 'Build HL7/FHIR import tooling early' }
    ],
    timeline: [
      { phase: 'Phase 1 — MVP', duration: '6 months', deliverables: 'Registration, scheduling, EHR, RBAC' },
      { phase: 'Phase 2 — Growth', duration: '4 months', deliverables: 'Billing, insurance claims, pharmacy' },
      { phase: 'Phase 3 — Scale', duration: '6+ months', deliverables: 'Patient portal, telemedicine' }
    ],
    recommendations: [
      'Secure HIPAA compliance certification before any sales outreach.',
      'Partner with an established healthcare integrator for the first rollouts.',
      'Run a 6-month free pilot with a reputable regional clinic to generate case studies.'
    ]
  }
};

export function generateDynamicBlueprint(projectData) {
  const memory = useProjectMemoryStore.getState().memory;

  const idea = (projectData?.idea || '').toLowerCase();
  const name = projectData?.name || 'The Project';
  const target = memory.business?.targetAudience || projectData?.targetAudience || 'General Consumers';
  const budget = memory.scope?.budget || projectData?.budget || 'N/A';
  const declaredTimeline = projectData?.timeline || memory.scope?.timeline || 'N/A';
  const techBackend = memory.technical?.backend || null;
  const hasMobile = memory.scope?.platforms?.includes('mobile') || (projectData?.platform || '').includes('mobile') || false;

  let domain = memory.scope?.domain || memory.domain || 'general';
  if (!memory.scope?.domain && !memory.domain) {
    if (idea.includes('food') || idea.includes('delivery') || idea.includes('restaurant')) {
      domain = 'food';
    } else if (idea.includes('chess') || idea.includes('coach') || idea.includes('lesson')) {
      domain = 'chess';
    } else if (idea.includes('hospital') || idea.includes('health') || idea.includes('patient') || idea.includes('clinic')) {
      domain = 'hospital';
    }
  }

  const content = {
    general: {
      businessModel: `
### Key Insights
- Subscription Tier: Freemium model with Pro and Enterprise tiers.
- Target Market: ${target}
- Revenue Streams: Direct subscriptions, API access, and white-labeling.

### Risks
- High customer acquisition cost in early stages.
- Platform lock-in resistance from enterprise users.

### Recommendations
- Build lightweight integrations for immediate value.
- Target mid-market before enterprise.`,
      problem: `
### Market Problem
Current solutions in the space are fragmented, expensive, and lack modern integration, leaving users frustrated with manual workflows.

### User Pain Points
- Disjointed data silos.
- High manual effort.
- Lack of actionable insights.`,
      roadmap: `
### Phase 1: MVP
- Core authentication
- Dashboard & Basic Analytics
- Workflow management engine

### Phase 2: Growth
- Advanced integrations
- Reporting and export options

### Phase 3: Scale
- Enterprise features
- Advanced API access`,
      architecture: `
\`\`\`mermaid
graph TD
    Client[Web Client] -->|HTTPS| Gateway[API Gateway]
    Gateway --> Auth[Auth Service]
    Gateway --> Core[Core Service]
    Gateway --> Notification[Notification Service]
    Core --> DB[(PostgreSQL)]
    Core --> Cache[(Redis Cache)]
\`\`\``,
      uml: `
\`\`\`mermaid
classDiagram
    class User {
        +String id
        +login()
    }
    class Admin {
        +manageUsers()
    }
    class CoreSystem {
        +processData()
    }
    User --> CoreSystem : Uses
    Admin --> CoreSystem : Manages
\`\`\``,
      erd: `
\`\`\`mermaid
erDiagram
    USER ||--o{ SUBSCRIPTION : has
    USER {
        string id PK
        string email
        string role
    }
    SUBSCRIPTION {
        string id PK
        string plan_type
        float price
        string user_id FK
    }
\`\`\``,
      marketing: `
### Go-to-Market
1. **Beta Launch:** Invite-only launch to build exclusivity.
2. **Content Marketing:** Publish deep-dive case studies.
3. **Community:** Build a dedicated user community.`
    },

    food: {
      businessModel: `
### Key Insights
- Revenue Model: Commission fee on every order (e.g., 15-25%), Delivery fees, and optional premium subscriptions (e.g., $9.99/mo for free delivery).
- Target Market: ${target === 'General Consumers' ? 'Hungry professionals and students' : target}
- Key Partnerships: Local restaurants, independent delivery drivers.

### Risks
- Driver churn and high operational costs.
- Aggressive local competition.

### Recommendations
- Offer 0% commission for the first 3 months to secure exclusive menus.
- Implement driver retention bonuses based on completed deliveries.`,
      problem: `
### Market Problem
Customers want reliable, fast food delivery with accurate tracking, while restaurants struggle with high commission fees and poor driver management on existing platforms.

### User Pain Points
- Unpredictable delivery times.
- Poor communication with drivers.
- Squeezed restaurant margins.`,
      roadmap: `
### Phase 1: MVP
- User App: Restaurant browsing, menu selection, checkout
- Restaurant Portal: Order acceptance, menu management
- Driver App: Order claims, GPS routing

### Phase 2: Growth
- AI-based route optimization
- Loyalty programs and premium subscriptions

### Phase 3: Scale
- Grocery and pharmacy delivery expansion
- Dark kitchen partnerships`,
      architecture: `
\`\`\`mermaid
graph TD
    UserApp[Customer Mobile App] --> Gateway[API Gateway]
    DriverApp[Driver Mobile App] --> Gateway
    RestPortal[Restaurant Dashboard] --> Gateway
    Admin[Admin Portal] --> Gateway

    Gateway --> OrderSvc[Order Management Service]
    Gateway --> PaymentSvc[Payment Service]
    Gateway --> LocationSvc[Real-Time Tracking Service]
    Gateway --> NotifySvc[Notification Service]

    LocationSvc --> Redis[(Redis GeoSpatial)]
    OrderSvc --> DB[(PostgreSQL)]
    PaymentSvc --> Stripe[Stripe API]
\`\`\``,
      uml: `
\`\`\`mermaid
classDiagram
    class Customer {
        +browseMenu()
        +placeOrder()
        +trackDelivery()
    }
    class Restaurant {
        +acceptOrder()
        +updateMenu()
    }
    class Driver {
        +acceptDelivery()
        +updateLocation()
    }
    class OrderSystem {
        +processPayment()
        +dispatchDriver()
    }
    Customer --> OrderSystem : Creates Order
    Restaurant --> OrderSystem : Fulfills Order
    Driver --> OrderSystem : Delivers Order
\`\`\``,
      erd: `
\`\`\`mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    RESTAURANT ||--o{ ORDER : receives
    DRIVER ||--o{ ORDER : delivers
    CUSTOMER {
        uuid id PK
        string name
        string phone
    }
    RESTAURANT {
        uuid id PK
        string name
        string address
        float rating
    }
    DRIVER {
        uuid id PK
        string name
        string vehicle_type
    }
    ORDER {
        uuid id PK
        uuid customer_id FK
        uuid restaurant_id FK
        uuid driver_id FK
        string status
        float total_amount
    }
\`\`\``,
      marketing: `
### Go-to-Market
1. **Hyperlocal Launch:** Launch in a single densely populated neighborhood first.
2. **Promotions:** Free delivery on the first 3 orders.
3. **Flyer Drops:** Physical marketing in university campuses.`
    },

    chess: {
      businessModel: `
### Key Insights
- Revenue Model: 10% platform fee on all booked lessons, plus a monthly subscription ($5/mo) for advanced analysis tools.
- Target Market: ${target === 'General Consumers' ? 'Chess enthusiasts and competitive players' : target}
- Supply Side: Grandmasters, IMs, and certified coaches.

### Risks
- Coaches taking students off-platform.
- Server costs for running Stockfish engine evaluations at scale.

### Recommendations
- Build proprietary video/board sync tools so good that coaches refuse to leave.
- Cache engine evaluations for common openings.`,
      problem: `
### Market Problem
Players struggle to find vetted, affordable chess coaches and often have to use a disjointed mix of Skype, PayPal, and external analysis boards.

### User Pain Points
- Disjointed lesson experience.
- Hard to verify coach credentials.
- No integrated game analysis.`,
      roadmap: `
### Phase 1: MVP
- Coach profiles and availability scheduling
- Payment integration and booking system
- Integrated interactive 2D chessboard

### Phase 2: Growth
- WebRTC video calling integration
- Engine evaluation (Stockfish) integration

### Phase 3: Scale
- Automated AI game reviews
- Group lessons and tournaments`,
      architecture: `
\`\`\`mermaid
graph TD
    Student[Student Portal] --> Gateway[API Gateway]
    Coach[Coach Portal] --> Gateway

    Gateway --> Booking[Booking Service]
    Gateway --> WebRTC[Video/Audio Signaling]
    Gateway --> GameBoard[WebSocket Game State]
    Gateway --> EngineAPI[Analysis Service]

    GameBoard --> Engine[Stockfish Engine Cluster]
    Booking --> DB[(PostgreSQL)]
\`\`\``,
      uml: `
\`\`\`mermaid
classDiagram
    class Student {
        +bookLesson()
        +makeMove()
    }
    class Coach {
        +setAvailability()
        +analyzeGame()
    }
    class LessonRoom {
        +syncBoardState()
        +streamVideo()
    }
    class Stockfish {
        +evaluatePosition()
    }
    Student --> LessonRoom : Joins
    Coach --> LessonRoom : Hosts
    LessonRoom --> Stockfish : Requests Eval
\`\`\``,
      erd: `
\`\`\`mermaid
erDiagram
    STUDENT ||--o{ LESSON : books
    COACH ||--o{ LESSON : teaches
    LESSON ||--o{ GAME_RECORD : generates
    STUDENT {
        uuid id PK
        string elo_rating
    }
    COACH {
        uuid id PK
        string title
        float hourly_rate
    }
    LESSON {
        uuid id PK
        uuid student_id FK
        uuid coach_id FK
        datetime scheduled_at
        string status
    }
    GAME_RECORD {
        uuid id PK
        uuid lesson_id FK
        string pgn_data
    }
\`\`\``,
      marketing: `
### Go-to-Market
1. **Influencer Marketing:** Sponsor Twitch chess streamers and YouTubers.
2. **Freemium Tools:** Offer free PGN analysis tools to draw organic search traffic.
3. **Partnerships:** Partner with local chess clubs and scholastic programs.`
    },

    hospital: {
      businessModel: `
### Key Insights
- Revenue Model: B2B SaaS tiered pricing based on hospital bed count / patient volume (e.g., $2000/mo to $50,000/mo).
- Target Market: ${target === 'General Consumers' ? 'Clinics, regional hospitals, and healthcare networks' : target}
- Value Proposition: Reduces administrative overhead and improves patient care metrics.

### Risks
- Extremely long enterprise sales cycles (12-18 months).
- Strict HIPAA and SOC2 compliance requirements.

### Recommendations
- Partner with established healthcare integrators for initial rollouts.
- Ensure compliance certifications are secured before any sales outreach.`,
      problem: `
### Market Problem
Hospitals operate on legacy, fragmented EHR systems that cause administrative bottlenecks, slow patient throughput, and increase the risk of medical errors.

### User Pain Points
- Disconnected patient records.
- Cumbersome billing workflows.
- High risk of compliance violations.`,
      roadmap: `
### Phase 1: MVP
- Patient Registration & Scheduling
- Electronic Health Records (EHR) Module
- Role-based Access Control (Doctors, Nurses, Admin)

### Phase 2: Growth
- Billing and Insurance Claim processing
- Pharmacy and Inventory Management

### Phase 3: Scale
- Patient Portal (Mobile App)
- Telemedicine integration`,
      architecture: `
\`\`\`mermaid
graph TD
    DoctorApp[Doctor Portal] --> WAF[Web Application Firewall]
    PatientApp[Patient Portal] --> WAF
    AdminApp[Admin Portal] --> WAF

    WAF --> Gateway[API Gateway]
    Gateway --> Identity[HIPAA Compliant IAM]
    Gateway --> EHR[Medical Records Service]
    Gateway --> Appointment[Appointment Service]
    Gateway --> Billing[Billing Service]

    EHR --> EncryptedDB[(Encrypted PostgreSQL)]
    Appointment --> EncryptedDB
    Billing --> EncryptedDB
    Gateway --> AuditLog[(Immutable Audit Log)]
\`\`\``,
      uml: `
\`\`\`mermaid
classDiagram
    class Patient {
        +bookAppointment()
        +viewRecords()
    }
    class Doctor {
        +prescribeMedication()
        +updateEHR()
    }
    class Admin {
        +generateBilling()
        +manageStaff()
    }
    class SystemCore {
        +enforceCompliance()
        +logAuditTrail()
    }
    Patient --> SystemCore : Interacts
    Doctor --> SystemCore : Interacts
    Admin --> SystemCore : Interacts
\`\`\``,
      erd: `
\`\`\`mermaid
erDiagram
    PATIENT ||--o{ APPOINTMENT : books
    DOCTOR ||--o{ APPOINTMENT : conducts
    PATIENT ||--o{ MEDICAL_RECORD : owns
    DOCTOR ||--o{ MEDICAL_RECORD : authors
    PATIENT {
        uuid id PK
        string encrypted_name
        string dob
    }
    DOCTOR {
        uuid id PK
        string specialization
        string license_no
    }
    APPOINTMENT {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        datetime time
    }
    MEDICAL_RECORD {
        uuid id PK
        uuid patient_id FK
        string diagnosis
    }
\`\`\``,
      marketing: `
### Go-to-Market
1. **Direct Enterprise Sales:** Hire experienced healthcare sales executives to target hospital CIOs.
2. **Compliance Certification:** Lead marketing with HIPAA/SOC2 compliance guarantees.
3. **Pilot Programs:** Offer a 6-month free pilot to a reputable regional clinic to generate case studies.`
    }
  };

  const selected = content[domain] || content.general;
  const profile = DOMAIN_PROFILES[domain] || DOMAIN_PROFILES.general;

  // Apply memory overrides
  const backendPattern = /Node\.js(?: microservices| \(Express\/Fastify\))?|Java Spring Boot \/ \.NET Core/g;
  let finalArchitecture = selected.architecture;
  let finalTechStack = buildTechStack(profile.techStack);
  if (techBackend) {
    finalArchitecture = finalArchitecture.replace(backendPattern, techBackend);
    finalTechStack = finalTechStack.replace(backendPattern, techBackend);
  }

  let finalRoadmap = selected.roadmap;
  if (hasMobile && !finalRoadmap.includes('Mobile App')) {
    finalRoadmap += '\n- Mobile Application Development';
  }

  return {
    executiveSummary: `
**Project Name:** ${name}
**Vision:** ${idea}

### Market Opportunity
The proposed project aims to disrupt the target market by providing a highly scalable and user-centric solution. Initial analysis indicates strong market fit within the provided budget of ${budget}.

### Core Objective
To streamline existing workflows and capture market share through superior UX and modern architecture.
    `.trim(),
    problemStatement: selected.problem.trim(),
    proposedSolution: buildProposedSolution(profile.solution),
    targetUsers: buildTargetUsers(profile.users),
    businessModel: selected.businessModel.trim(),
    mvpScope: buildMvpScope(profile.mvp),
    keyFeatures: buildKeyFeatures(profile.keyFeatures),
    productRoadmap: finalRoadmap.trim(),
    architecture: finalArchitecture.trim(),
    technologyStack: finalTechStack,
    umlDiagram: selected.uml.trim(),
    erDiagram: selected.erd.trim(),
    marketingStrategy: selected.marketing.trim(),
    budgetCostEstimate: buildBudget(profile.budget, budget),
    risksMitigation: buildRisks(profile.risks),
    timeline: buildTimeline(profile.timeline, declaredTimeline),
    finalRecommendations: buildRecommendations(profile.recommendations),
  };
}
