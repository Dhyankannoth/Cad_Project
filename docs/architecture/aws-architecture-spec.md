# Production-Grade AWS Architecture Specification: Chronodoc Cloud Engine

## 1. Architectural Scope & Rationale

This document specifies the enterprise AWS cloud architecture for **Chronodoc**—hosting both the interactive documentation web GUI and the backend AI documentation pipeline.

The architecture balances two critical requirements:
1. **Industry-Grade Sophistication:** Utilizes premier cloud-native patterns (Containerized microservices on AWS Fargate, Aurora Serverless v2 PostgreSQL, AWS Step Functions event-driven sagas, AWS WAF bot mitigation, AWS CloudTrail audit logs, and AWS X-Ray distributed tracing) suitable for enterprise software evaluation.
2. **Deterministic FinOps Hard-Cap ($100.00/month):** Implements an automated **"Dead-Man Switch" Circuit-Breaker Lambda** triggered by AWS Budgets that scales containers to zero, pauses database compute, and engages edge maintenance blocking the instant total month-to-date expenditure hits $100.00.

---

## 2. Architecture Diagram

```mermaid
flowchart TD
    User(["Developer / Web Browser"])
    Attacker(["Malicious Botnet / Web Scraper"])

    subgraph EDGE["1. Edge & Perimeter Defense Tier"]
        WAF["AWS WAF (Web Application Firewall)<br/>• AWSManagedRulesBotControlRuleSet<br/>• Rate-based Throttling (100 req/5min per IP)<br/>• Common Vulnerabilities & SQLi Shield"]
        CF["Amazon CloudFront CDN<br/>• Global Edge Points of Presence<br/>• TLS 1.3 Termination<br/>• Origin Cloaking with Custom Auth Header"]
        ALB["Application Load Balancer (ALB)<br/>• Dual Target Groups: Web SSR & API<br/>• HTTP/2 & WebSocket Support"]
        WAF --- CF
        CF --> ALB
    end

    subgraph COMPUTE["2. Containerized Application & Orchestration Tier"]
        ECS_Web["Amazon ECS on AWS Fargate (Web GUI)<br/>• Next.js / React SSR Service<br/>• 0.25 vCPU, 0.5 GB RAM (Min 1, Max 2 tasks)<br/>• Ephemeral, stateless containers"]
        StepFn["AWS Step Functions (Documentation State Machine)<br/>• Async Saga Orchestration<br/>• AST Scanning -> RAG -> Generation -> Validation<br/>• Bounded Max-2 Revision Loop"]
        SQS["Amazon SQS FIFO Queue<br/>• Agent Job Decoupling & Backpressure Control"]
        ECS_Worker["AWS Fargate Agent Workers (Batch Tasks)<br/>• On-demand ephemeral task containers<br/>• Runs AST compiler tools & model function calls"]
    end

    subgraph DATA["3. Database & Persistence Tier"]
        Aurora["Amazon Aurora Serverless v2 (PostgreSQL + JSONB)<br/>• 0.5 to 1.0 ACU Auto-scaling<br/>• Relational Users/Teams + Document JSONB<br/>• Point-in-time recovery & automated backups"]
        S3_Docs["Amazon S3 Docs Lake<br/>• Versioned documentation markdown & AST graphs<br/>• SSE-KMS encryption at rest"]
    end

    subgraph OBSERVABILITY["4. Enterprise Observability & Compliance Tier"]
        Trail["AWS CloudTrail (Multi-Region Trail)<br/>• Immutable administrative & data event logging"]
        CloudWatch["Amazon CloudWatch Logs & Metrics<br/>• Centralized log groups with 30-day retention<br/>• Custom metric filters on 4xx/5xx and latency"]
        XRay["AWS X-Ray (Distributed Tracing)<br/>• Trace ID propagation across CDN, ALB, ECS, Step Functions, & DB"]
    end

    subgraph CIRCUIT_BREAKER["5. Automated $100.00 Kill-Switch Circuit Breaker"]
        Budget["AWS Budgets ($100.00 Hard Ceiling)<br/>• 50% ($50) Warning Alert<br/>• 85% ($85) Defensive Throttle<br/>• 100% ($100) Emergency Hard Stop Trigger"]
        SNS["Amazon SNS (P1 Emergency Alerts)"]
        KillLambda["Circuit-Breaker Lambda ('Dead-Man Switch')<br/>• Sets ECS Service desiredCount = 0<br/>• Pauses Aurora compute cluster<br/>• Sets WAF default action = BLOCK (HTTP 503 Maintenance)"]
    end

    User --> CF
    Attacker -.->|Blocked at Edge| WAF
    ALB --> ECS_Web
    ALB --> StepFn
    StepFn --> SQS
    SQS --> ECS_Worker
    ECS_Worker --> Aurora
    ECS_Worker --> S3_Docs
    ECS_Web --> Aurora

    %% Observability Connections
    CF -.-> Trail
    ALB -.-> CloudWatch
    ECS_Web -.-> XRay
    ECS_Worker -.-> XRay
    StepFn -.-> CloudWatch

    %% Circuit-Breaker Trigger Path
    Budget ==>|Triggers at $100.00| SNS
    SNS ==> KillLambda
    KillLambda -.->|Shutdown| ECS_Web
    KillLambda -.->|Shutdown| ECS_Worker
    KillLambda -.->|Pause| Aurora
    KillLambda -.->|Block All Traffic| WAF
```

---

## 3. Component Details & Design Justifications

### 1. Perimeter Protection & Edge Routing (CloudFront + AWS WAF + ALB)
- **AWS WAF Bot Control:** Malicious scraping scripts and bots are intercepted directly at CloudFront edge servers. Requests that fail CAPTCHA or heuristic bot analysis never touch the ALB or Fargate containers.
- **Rate-Based Rules:** Enforces a hard limit of 100 requests per 5-minute window per IP. Excess traffic is dropped with HTTP 429, eliminating denial-of-wallet (DoW) threats.
- **Application Load Balancer:** Performs health checks, SSL offloading, and intelligent routing between GUI requests (`/*`) and API endpoints (`/api/*`).

### 2. Containerized Application Tier (AWS Fargate + Step Functions)
- **ECS on AWS Fargate:** Replaces rigid VMs with containerized serverless tasks. Fargate eliminates the overhead of managing EC2 operating systems while providing strict isolation and predictable resource allocations (0.25 vCPU, 0.5 GB RAM per task).
- **Asynchronous State Machine (AWS Step Functions):** Long-running documentation generation jobs are decoupled from web request loops. Step Functions orchestrates repository scanning, RAG retrieval, section generation, and AST validation as a deterministic state machine with native retry logic.

### 3. Database & Storage Architecture (Aurora Serverless v2 + S3)
- **Aurora Serverless v2 (PostgreSQL):** Configured with a minimum capacity of 0.5 ACU (Aurora Capacity Units). Scales dynamically during documentation indexing and scales down during idle periods. Stores users, teams, and projects in relational tables, while generated documentation sections are stored in flexible, queryable `JSONB` columns.
- **S3 Document Lake:** Stores generated Markdown files, AST dependency graphs, and static assets, encrypted with AWS KMS.

### 4. Enterprise Observability & Tracing (CloudTrail, CloudWatch & X-Ray)
- **AWS CloudTrail:** Automatically captures all API activity across the AWS account for governance, compliance, and security forensics.
- **Amazon CloudWatch:** Collects structured logs, metric alarms, and dashboards across ECS, ALB, and Aurora.
- **AWS X-Ray:** Injects distributed tracing headers across the entire stack, allowing engineers to trace a document generation request from the browser through the load balancer, Fargate containers, Step Functions, and database queries.

---

## 4. The $100.00 Automated Kill-Switch Runbook

### Tiered Alerting Strategy:
1. **$50.00 (50% Threshold):** Warning email and Slack alert dispatched to engineering team.
2. **$85.00 (85% Threshold):** Defensive posture engaged; WAF tightens rate limits to 20 requests per 5 minutes.
3. **$100.00 (100% Hard Ceiling):** Automated invocation of the **Dead-Man Switch Lambda**.

### Automated Actions Executed by the Kill-Switch Lambda (< 2 seconds):
1. **Drain Containers:** Calls `UpdateService` on all ECS services, setting `desiredCount = 0`.
2. **Pause Database:** Issues a cluster pause/stop command to Aurora Serverless.
3. **Block Edge:** Flips the AWS WAF default action to `BLOCK`, serving a lightweight static "System Under Maintenance" page directly from CloudFront without incurring backend bandwidth or compute costs.
4. **Notify Team:** Dispatches high-priority SMS and email alerts with the final cost breakdown.

---

## 5. Cost Projections (Under $100.00/Month)

| Service | Low / Idle Traffic | Active Evaluation Traffic | With Emergency Kill-Switch |
| :--- | :--- | :--- | :--- |
| **AWS WAF (Base & Rules)** | ~$8.00 / mo | ~$12.00 / mo | Capped |
| **CloudFront & ALB** | ~$18.00 / mo | ~$22.00 / mo | Capped |
| **ECS Fargate (Web & Agent)** | ~$15.00 / mo | ~$30.00 / mo | Capped (Terminated at $100) |
| **Aurora Serverless v2 (0.5 ACU)** | ~$22.00 / mo | ~$40.00 / mo | Capped (Paused at $100) |
| **CloudTrail, CloudWatch & X-Ray** | ~$3.00 / mo | ~$6.00 / mo | Capped (30-day retention) |
| **Total Expected Spend** | **~$66.00 / month** | **~$85.00 - $95.00 / month** | **GUARANTEED $\le \$100.00$** |
