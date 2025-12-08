# Cycle Care - Bike Maintenance Service Platform

## Overview
Cycle Care is a bike maintenance and repair service application for Riyadh, connecting cyclists with qualified technicians. The platform aims to streamline bike maintenance, enhance user convenience, and provide technicians with tools to manage services. The project's vision is to capture the local market for bike maintenance services in Riyadh.

## User Preferences
I prefer simple language in explanations. I want iterative development, where you ask before making major changes. Do not make changes to the `Z` folder. Do not make changes to the `Y` file.

## System Architecture

### UI/UX Decisions
-   **Color Scheme**: Primary Orange (#E86A4B), Secondary Teal (#3B9B9B). Solid colors are used across all UI elements for a clean, professional appearance (no gradients).
-   **Logo**: Official Cycle Care logo (cycle-care-logo.png) with configurable sizes.
-   **Typography**: Tajawal font for modern Arabic.
-   **Layout**: Mobile-first design with iPhone safe-area-inset support.
-   **Components**: Shadcn UI with custom theming.
-   **Bilingual Support**: Arabic (RTL) and English (LTR) interface with dynamic text updates, proper date/currency formatting, and legal pages.
-   **Dark Mode**: Full dark mode support with true black background and theme persistence. Dark mode is the default theme.

### Technical Implementations
-   **Frontend**: React, TypeScript, Vite, Wouter for routing.
-   **Backend**: Express.js, PostgreSQL (Neon), Drizzle ORM.
-   **Authentication**: Hybrid authentication supporting:
    -   **JWT-based Google OAuth**: Stateless JWT tokens for Google login (works reliably with Replit's reverse proxy and Capacitor native apps). Tokens include issuer/audience validation and 7-day expiration.
    -   **Email/Password Login**: Firebase Authentication with automatic token refresh. Tokens stored in localStorage and refreshed via `getIdToken()` on each API request.
    -   **Phone OTP**: Session-based authentication for phone number login.
    -   **AuthCallback Page**: `/auth/callback` validates tokens server-side before storing in localStorage.
    -   **Deep Link Support**: Native Capacitor apps handle OAuth redirects and JWT token capture.
    -   **Login Page UI**: Beautiful bike repair workshop background image with dark overlay, animated logo, and RTL/LTR language toggle.
-   **State Management**: TanStack Query.
-   **Security**: JWT with HS256 signing (requires SESSION_SECRET 32+ chars), issuer/audience validation, authentication middleware for protected routes, and admin role management.
-   **Admin Features**: `isAdmin` field, middleware, admin-specific API endpoints, and a comprehensive admin dashboard UI.
-   **Internationalization**: Context API for language management, automatic RTL/LTR switching, and comprehensive translation.
-   **Payment System**: Conceptual payment flow supporting Apple Pay, Credit Card, STC Pay, and Bank Transfer, with a `payments` table.
-   **Service Booking**: A 5-step wizard including GPS location integration.
-   **Service Worker**: Modern cache strategy preventing stale HTML while caching assets for performance.
-   **Image Upload**: Capacitor Camera integration for native photo uploads with authorization headers, and image optimization (lazy loading, fade-in transitions).
-   **Phone Authentication**: Phone OTP sessions are persisted in a `phone_sessions` database table.

### Feature Specifications
-   **User Management**: Replit Auth, automatic account creation, and user role management (owner, admin, support, technician, user).
-   **Bike Profile Management**: Tracking bikes with IDs, service history, and maintenance schedules, including customer photo uploads.
-   **Service Booking**: 5-step wizard with location and payment method selection.
-   **Technician Dashboard**: Technicians can accept/decline service requests and manage appointments.
-   **Parts Catalog**: Browsing and filtering bike parts by 2 categories only: "spare_parts" (قطع غيار) and "accessories" (اكسسوارات). Admin uses Select dropdown for category selection.
-   **Maintenance Records**: Tracking service history linked to technicians.
-   **Technician Registration**: Public self-registration page with an approval workflow (`isApproved` field) and document viewing for admins.
-   **Admin Dashboard**: Centralized view of users, bikes, technicians, service requests, user roles, invoices, and statistics.
-   **Invoice System**: Complete invoice management with 15% VAT calculation, PDF export (English only) with company logo, and status tracking.
-   **Theme Toggle**: Moon/Sun icon for light/dark mode.
-   **Legal Pages**: Bilingual Privacy Policy and Terms of Service.
-   **iOS Native App**: Capacitor integration with Xcode project, including Camera, Photo Library, and Location permissions.
-   **Login/Logout Flow**: Seamless authentication with proper session management, cache clearing, and auto-account creation messaging.

### System Design Choices
-   **Database Schema**: `users`, `bikes`, `technicians`, `service_requests`, `payments`, `maintenance_records`, `parts`, `invoices`, `sessions`, `roles`, `user_roles`, `phone_sessions` tables.
-   **API Endpoints**: Structured RESTful API.
-   **Security**: `isAuthenticated` and `isAdmin` middleware, PII sanitization, server-side user ID injection.
-   **Role-Based Access Control**: Granular permissions, database-level unique constraints, application-level validation, and admin UI for role assignment.
-   **Invoice System**: Server-enforced 15% VAT, automatic calculations, jsPDF generation, and status tracking.
-   **Service Worker Strategy**: HTML never cached, assets cached, and cache versioning used.

## External Dependencies
-   **Authentication**: Replit Auth (OpenID Connect).
-   **Database**: PostgreSQL (via Neon).
-   **Styling**: TailwindCSS, Shadcn UI.
-   **ORM**: Drizzle ORM.
-   **Payment (Conceptual)**: Stripe.
-   **Session Management**: `connect-pg-simple`.
-   **PDF Generation**: jsPDF and html2canvas.
-   **Mobile Framework**: Capacitor.