import type { Config } from 'tailwindcss';

/**
 * Offday design tokens (docs/design/README.md → "Design Tokens").
 * Names describe the role of a color, not its value, so templates read like the spec.
 */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F3F2EE',
        surface: { DEFAULT: '#FFFFFF', subtle: '#FBFAF8', hover: '#FCFBF9' },
        weekend: { cell: '#F8F7F4', head: '#F3F2EE' },
        line: { DEFAULT: '#E7E5DF', input: '#E1DFD8', divider: '#EEECE6' },
        ink: { DEFAULT: '#17171A', hover: '#2A2A30', 2: '#55555C', 3: '#6B6B72' },
        muted: '#8A8A90',
        faint: '#A6A6AE',
        accent: {
          DEFAULT: 'oklch(0.91 0.17 122)',
          tint: 'oklch(0.96 0.06 122)',
          row: 'oklch(0.985 0.02 122)',
          mark: 'oklch(0.75 0.17 122)',
        },
        'nav-idle': '#C9C7C0',
        pending: { bg: 'oklch(0.95 0.05 85)', fg: 'oklch(0.47 0.11 70)', dot: 'oklch(0.75 0.15 75)', warn: 'oklch(0.48 0.11 70)' },
        approved: { bg: 'oklch(0.95 0.045 150)', fg: 'oklch(0.44 0.11 150)', dot: 'oklch(0.66 0.15 150)' },
        rejected: { bg: 'oklch(0.95 0.035 25)', fg: 'oklch(0.5 0.15 25)', dot: 'oklch(0.64 0.18 25)' },
        danger: {
          DEFAULT: 'oklch(0.5 0.15 25)',
          border: 'oklch(0.6 0.17 25)',
          tint: 'oklch(0.975 0.015 25)',
          strong: 'oklch(0.45 0.15 25)',
          solid: 'oklch(0.55 0.17 25)',
          'solid-hover': 'oklch(0.5 0.17 25)',
        },
        chart: {
          approved: '#17171A',
          pending: 'oklch(0.8 0.15 80)',
          rejected: 'oklch(0.8 0.08 25)',
          track: '#F6F5F1',
        },
        holiday: {
          jewish: { DEFAULT: 'oklch(0.58 0.14 255)', tint: 'oklch(0.95 0.03 255)', fg: 'oklch(0.45 0.13 255)', col: 'oklch(0.975 0.014 255)' },
          christian: { DEFAULT: 'oklch(0.56 0.16 305)', tint: 'oklch(0.95 0.03 305)', fg: 'oklch(0.45 0.15 305)', col: 'oklch(0.975 0.014 305)' },
          muslim: { DEFAULT: 'oklch(0.6 0.12 165)', tint: 'oklch(0.95 0.035 165)', fg: 'oklch(0.43 0.1 165)', col: 'oklch(0.975 0.014 165)' },
          hindu: { DEFAULT: 'oklch(0.68 0.16 50)', tint: 'oklch(0.95 0.04 55)', fg: 'oklch(0.5 0.14 45)', col: 'oklch(0.975 0.014 55)' },
        },
        night: { DEFAULT: '#17171A', card: '#222227', line: '#2E2E34', text: '#8E8E96' },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        eyebrow: ['11px', { lineHeight: '1.4', letterSpacing: '0.06em' }],
      },
      borderRadius: {
        bar: '6px',
        control: '10px',
        card: '16px',
        modal: '18px',
        shell: '20px',
      },
      boxShadow: {
        nav: '0 1px 2px rgba(23,23,26,.05)',
        tab: '0 1px 2px rgba(23,23,26,.08)',
        shell: '0 1px 2px rgba(23,23,26,.04), 0 12px 40px rgba(23,23,26,.06)',
        toast: '0 12px 40px rgba(23,23,26,.14)',
        drawer: '-20px 0 60px rgba(23,23,26,.12)',
        modal: '0 24px 70px rgba(23,23,26,.2)',
      },
      backgroundImage: {
        'hatch-pending': 'repeating-linear-gradient(135deg, oklch(0.75 0.15 75) 0 2px, oklch(0.93 0.07 85) 2px 5px)',
        'hatch-ink': 'repeating-linear-gradient(135deg, #17171A 0 3px, transparent 3px 6px)',
      },
      backgroundColor: {
        'drawer-overlay': 'rgba(23,23,26,.28)',
        'modal-overlay': 'rgba(23,23,26,.32)',
      },
    },
  },
  plugins: [],
} satisfies Config;
