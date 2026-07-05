import { useProjectMemoryStore } from '../store/projectMemoryStore';

export function generateDynamicBlueprint(projectData) {
  const memory = useProjectMemoryStore.getState().memory;
  
  const idea = (projectData?.idea || '').toLowerCase();
  const name = projectData?.name || 'The Project';
  const target = memory.business?.targetAudience || projectData?.targetAudience || 'General Consumers';
  const budget = memory.scope?.budget || projectData?.budget || 'N/A';
  const techBackend = memory.technical?.backend || null;
  const hasMobile = memory.scope?.platforms?.includes('mobile') || false;

  let domain = memory.domain || 'general';
  if (!memory.domain) {
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
- Lack of actionable insights.

### Proposed Solution
A unified platform that automates core workflows, providing an intuitive experience that feels like a premium modern tool.`,
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
- Squeezed restaurant margins.

### Proposed Solution
A hyperlocal delivery platform connecting local restaurants with vetted drivers, featuring real-time GPS tracking and lower commission rates for partnered eateries.`,
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
- No integrated game analysis.

### Proposed Solution
An all-in-one chess coaching platform featuring a coach marketplace, integrated video calling, and synchronized interactive analysis boards.`,
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
- High risk of compliance violations.

### Proposed Solution
A secure, cloud-based Hospital Management System (HMS) that centralizes electronic health records, staff scheduling, and billing in a HIPAA-compliant environment.`,
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

  // Apply memory overrides
  let finalArchitecture = selected.architecture;
  if (techBackend) {
    finalArchitecture = finalArchitecture.replace(/Node\.js|Go|Java Spring Boot \/ \.NET Core/g, techBackend);
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
    businessModel: selected.businessModel.trim(),
    problemStatement: selected.problem.trim(),
    productRoadmap: finalRoadmap.trim(),
    architecture: finalArchitecture.trim(),
    umlDiagram: selected.uml.trim(),
    erDiagram: selected.erd.trim(),
    marketingStrategy: selected.marketing.trim(),
  };
}
