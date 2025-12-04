# Cycle Care - Design Guidelines

## Design Approach

**Selected Framework**: Design System Approach using Material Design principles adapted for service-based mobile applications, drawing inspiration from on-demand service apps like Uber and Careem for booking flows and technician matching.

**Rationale**: Cycle Care is a utility-focused service platform where efficiency, clarity, and trust are paramount. Users need to quickly book services, find technicians, and track maintenance - functional excellence over visual experimentation.

## Brand Identity & Color System

**Primary Palette**:
- Primary Black: `#000000` (backgrounds, headers, navigation)
- Primary Orange: `#FF6B00` (CTAs, active states, important highlights)
- Supporting Gray: `#1A1A1A` (cards, secondary surfaces)
- Light Gray: `#F5F5F5` (backgrounds for contrast)
- White: `#FFFFFF` (text on dark, card backgrounds)

**Color Application**:
- Orange for all primary CTAs, service status indicators, location pins, active selections
- Black for app header, bottom navigation, modal overlays
- Dark gray cards on black backgrounds for depth
- White cards on light backgrounds when appropriate

## Typography System

**Font Selection**: Inter (via Google Fonts) for Arabic/English bilingual support

**Hierarchy**:
- Hero/Display: 32px, Bold, tight letter-spacing (-0.02em)
- H1: 24px, Semibold
- H2: 20px, Semibold  
- H3: 18px, Medium
- Body: 16px, Regular, line-height 1.5
- Small/Caption: 14px, Regular
- Micro: 12px, Medium (for labels, badges)

**RTL Considerations**: Full RTL support for Arabic text, mirrored layouts

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16
- Micro spacing: p-2, gap-2
- Standard spacing: p-4, gap-4, m-6
- Section spacing: py-8, py-12, py-16
- Component padding: p-6, px-4

**Container Strategy**:
- Mobile-first: max-w-md for primary content
- Full-width maps and image sections
- Side padding: px-4 on mobile, px-6 on tablet+

## Core Components

### Authentication Screen
- Full-screen black background with subtle orange gradient overlay
- Centered Cycle Care logo (white/orange)
- Bold white headline: "صيانة دراجتك بضغطة زر"
- Social login buttons stacked vertically with icons:
  - Google (white background, shadow)
  - Apple (black background, white icon/text)
  - Phone number (orange background, white text)
- Each button: full-width, rounded-xl, h-14, with icon left-aligned

### Home Dashboard
- Black header with Cycle Care logo, notification bell (orange badge for alerts)
- Hero card: Orange gradient background featuring bike maintenance image with overlay text "احجز صيانتك الآن"
- Service quick actions grid (2x2):
  - Maintenance icon + label
  - Repair icon + label
  - Parts icon + label  
  - Track Bike icon + label
  - Each card: white background, rounded-2xl, p-6, shadow-lg
- "Nearby Technicians" section with horizontal scroll cards

### Service Booking Flow
- Stepper progress indicator (orange active, gray inactive)
- Service selection cards with radio buttons (orange when selected)
- Interactive map for location selection with orange pin
- Technician cards showing:
  - Profile photo (circular)
  - Name, rating (stars in orange)
  - Distance, availability status
  - Price estimate
- Floating bottom CTA: Orange button with white text, shadow-2xl

### Bike Profile
- Header with bike image or placeholder
- Unique Bike ID prominently displayed (orange badge)
- Info grid: Brand, Model, Year, Last Service
- Maintenance timeline (vertical, orange line connecting milestones)
- Upcoming service reminder card (orange left border, gray background)

### Technician Interface
- Black top navigation
- Request cards with orange left accent
- Accept/Decline buttons (orange/gray outline)
- Map view with customer locations
- Job status chips (orange for active, gray for completed)

### Navigation
- Bottom tab bar (black background, 5 tabs):
  - Home, Services, Parts, Profile, Technician Mode
  - Orange underline and icon tint for active tab
  - White icons for inactive tabs

## Interaction Patterns

**Buttons**:
- Primary: Orange background, white text, rounded-xl, py-3, font-semibold
- Secondary: White background, orange text, orange border-2, rounded-xl
- Ghost: Transparent, orange text, no border
- All buttons: No hover states (mobile-first), active:scale-95

**Cards**: Elevated with shadow-md, rounded-2xl, white or dark gray backgrounds, p-6

**Forms**: 
- Input fields: border-2 gray, focus:border-orange, rounded-lg, h-12
- Labels: 14px medium, mb-2
- Error states: Red border with orange exclamation icon

**Maps**: Full-width sections, custom orange markers for technicians/locations, dark mode styling

**Modals**: Black overlay (opacity-80), white content card, slide-up animation

## Icons & Assets

**Icon Library**: Heroicons (outline for inactive states, solid for active states)
- Use orange fill for active/selected icons
- 24px for navigation, 20px for cards, 16px for inline

**Images**: 
- Hero section: High-quality bike maintenance action shot
- Technician profiles: Circular photos
- Parts catalog: Product photography on white background
- Empty states: Simple illustrations in orange/gray

**Illustrations**: Minimal line-art style in orange for empty states and onboarding

## Mobile-First Considerations

- Thumb-friendly tap targets: minimum 44px height
- Bottom sheet modals for actions (easier one-handed use)
- Sticky bottom CTAs with safe-area padding
- Swipe gestures for card dismissal
- Pull-to-refresh on list views

## Accessibility

- WCAG AA contrast ratios (white text on black, orange used carefully)
- Clear focus indicators (orange outline)
- Large tap targets throughout
- Semantic HTML with ARIA labels for Arabic screen readers