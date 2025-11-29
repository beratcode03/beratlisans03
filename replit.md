# Overview

AFYONLUM is a Windows-only desktop application built with Electron for YKS (Turkish university entrance exam) study tracking and analysis. The system combines comprehensive study analytics, task management, question logging, exam result tracking, and user activity monitoring. It uses a file-based JSON storage system with encryption, Discord webhook notifications, and includes license management with hardware-based validation.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Technology Stack:**
- React with TypeScript
- Vite as build tool and development server
- Wouter for client-side routing
- TanStack Query (React Query) for server state management
- Tailwind CSS + shadcn/ui component library
- Theme system with dark/light mode support

**Key Design Patterns:**
- Custom hooks for reusable logic (keyboard logging, user info, toasts)
- Context API for global state (license validation, theme)
- Component composition with shadcn/ui primitives
- Turkish timezone-aware date handling throughout the application

**Directory Structure:**
- `client/src/sayfalar/` - Page components (dashboard, calculator, timer, etc.)
- `client/src/bilesenler/` - Reusable components
- `client/src/bilesenler/arayuz/` - UI primitive components (shadcn/ui)
- `client/src/hooks/` - Custom React hooks
- `client/src/kutuphane/` - Utility libraries and helpers

## Backend Architecture

**Technology Stack:**
- Node.js with Express
- TypeScript with ESM module system
- File-based JSON storage with AES-256-GCM encryption
- Drizzle ORM schemas (defined but using JSON files instead of Postgres)

**Core Services:**

1. **Storage Service** (`server/depolama.ts`)
   - Encrypted JSON file storage in `data/kayitlar.json`
   - Handles tasks, moods, goals, question logs, exam results, flashcards, study hours
   - Implements soft delete with archiving
   - Date range queries with Turkey timezone support

2. **License System** (`server/license-*.ts`)
   - RSA key-pair based license generation and validation
   - Hardware fingerprinting (CPU, motherboard, RAM, MAC addresses)
   - Hardware lock with tolerance scoring for component changes
   - Multiple license types (trial, weekly, monthly, yearly, lifetime)
   - Activation tracking with expiration management

3. **Activity Logging** (`server/activity-logger.ts`, `server/user-activity-logger.ts`)
   - Memory-only activity buffer (no disk writes)
   - Discord webhook integration for real-time monitoring
   - Deduplication cache to prevent spam
   - Activity categories: task, exam, question, study, goal, flashcard, license, system

4. **Keyboard Logger** (`server/keyboard-logger.ts`)
   - Batched keystroke logging (30-minute intervals)
   - Profanity detection with context-aware filtering
   - Discord alerts for flagged content
   - Buffer management with 50K character limit

5. **Self-Destruct Mechanism** (`server/self-destruct.ts`)
   - Hardcoded expiration date (December 13, 2025, 23:59 Turkey time)
   - Configurable secondary expiration via `set-destruct-date` script
   - Automatic cleanup of data, logs, keys, screenshots on trigger
   - OS-specific cleanup scripts for Windows

6. **Encryption Service** (`server/encryption.ts`)
   - AES-256-GCM encryption for sensitive data
   - Dynamic key loading from environment, Electron config, or auto-generation
   - Supports encrypted storage migration

**Path Resolution:**
- Custom path resolver (`server/path-resolver.ts`) handles ASAR packaging
- Environment variables for data directories (AFYONLUM_DATA_DIR, AFYONLUM_LOG_DIR, etc.)
- Writable paths outside ASAR archive for Electron packaged builds

**API Design:**
- RESTful endpoints under `/api/`
- Admin routes protected with bcrypt password authentication
- Monitoring routes for parental controls
- License management endpoints
- User activity tracking endpoints

## Desktop Application (Electron)

**Main Process:**
- Custom titlebar with window controls
- Tray integration with context menu
- License validation on startup
- Config manager for encrypted settings
- Windows startup integration
- Loading screens and modal dialogs

**Security Features:**
- Code obfuscation with JavaScript Obfuscator
- V8 bytecode compilation with bytenode
- Protected directories (electron/protected/)
- License key encryption and validation
- Hardware ID fingerprinting

**Build Process:**
- Multi-stage build with protection scripts
- electron-builder for packaging
- Code stripping and obfuscation before distribution
- Config encoding for sensitive data

## External Dependencies

**Third-Party Services:**
- **Discord Webhooks** - Real-time monitoring and alerts (screenshots, system status, activities, alerts, user info)
- **OpenWeather API** - Weather data for study environment tracking
- **Email (SMTP)** - SendGrid/Gmail for notifications and reports

**Key NPM Packages:**
- `@neondatabase/serverless` - Postgres client (schema defined, not actively used)
- `drizzle-orm` - ORM layer (JSON storage instead of DB)
- `@tanstack/react-query` - Server state management
- `@radix-ui/*` - Headless UI primitives
- `bcryptjs` - Password hashing
- `javascript-obfuscator` - Code protection
- `bytenode` - V8 bytecode compilation
- `electron` - Desktop application framework
- `recharts` - Chart visualizations

**Database/Storage:**
- File-based JSON storage (no active Postgres connection)
- Encrypted data files in `data/` directory
- License data in `data/licenses.json`
- User data in `data/kayitlar.json`

**Development Tools:**
- Vitest for unit testing
- Playwright for E2E testing
- ESLint + TypeScript for code quality
- Vite for fast development builds

**Authentication:**
- Admin password (bcrypt hashed) in `data/admin-config.json`
- Default: "beratAfy0-3"
- License key validation with RSA signatures

**Monitoring & Analytics:**
- Discord webhook endpoints for 5 categories
- Keyboard activity tracking
- Screenshot capture integration
- System status monitoring (mic, wifi, VPN, incognito detection)