# SmartRoster Ops — Multi-Brand D2C Workforce & Coverage Engine

A full-stack workforce scheduling and conflict-detection platform built for multi-brand D2C operations teams managing 30+ employees across single-resource and multi-resource client accounts.

---

## 1. Tech Stack & Architecture Overview
* **Frontend & Scheduling Engine:** React 19 (Vite) + Tailwind CSS + Lucide Icons
* **Database:** Supabase (PostgreSQL)
* **Deployment:** Vercel (Frontend) + Supabase Cloud (Database)

### Architecture Diagram
```text
[ React UI (5 Views, Conflict Panel, Simulator) ]
                      │
                      ▼
[ Deterministic Engine (generator.js & validator.js) ]
                      │
                      ▼
[ Supabase PostgreSQL (9 Relational Tables) ]