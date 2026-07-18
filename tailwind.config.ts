import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        overlay: 'hsl(var(--overlay-scrim))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        surface: {
          app: 'hsl(var(--surface-app))',
          navigation: 'hsl(var(--surface-navigation))',
          panel: 'hsl(var(--surface-panel))',
          subtle: 'hsl(var(--surface-subtle))',
          raised: 'hsl(var(--surface-raised))',
          hover: 'hsl(var(--surface-hover))',
          selected: 'hsl(var(--surface-selected))',
          unread: 'hsl(var(--surface-unread))',
        },
      },
      borderRadius: {
        data: 'var(--radius-data)',
        control: 'var(--radius-control)',
        small: 'var(--radius-small)',
        overlay: 'var(--radius-overlay)',
        pill: 'var(--radius-pill)',
        lg: 'var(--radius-dialog)',
        md: 'var(--radius-control)',
        sm: 'var(--radius-small)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        panel: 'var(--motion-panel)',
      },
      spacing: {
        control: 'var(--control-height)',
        'workspace-header': 'var(--workspace-header-height)',
        'workspace-nav': 'var(--workspace-navigation-width)',
        'workspace-gutter': 'var(--workspace-gutter)',
        'mobile-gutter': 'var(--mobile-gutter)',
        'message-row': 'var(--message-row-height)',
      },
      fontSize: {
        'workspace-title': ['1.5rem', { lineHeight: '1.875rem' }],
      },
      zIndex: {
        overlay: 'var(--z-overlay)',
        drawer: 'var(--z-drawer)',
      },
      boxShadow: {
        overlay: '0 18px 48px hsl(var(--shadow-color) / 0.24)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
