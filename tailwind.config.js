/** สีหลักของระบบ: ANVA & Co Solar Engineering ERP Design System */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        button: '8px',
        input: '8px',
        card: '12px',
      },
      colors: {
        ink: '#1B2430',
        anva: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'surface-2': 'var(--surface-2)',
          border: 'var(--border)',
          text: 'var(--text)',
          'text-muted': 'var(--text-muted)',
          primary: {
            DEFAULT: 'var(--primary)',
            hover: 'var(--primary-hover)',
            soft: 'var(--primary-soft)',
          },
          warning: 'var(--warning)',
          danger: 'var(--danger)',
          info: 'var(--info)',
        },
        steel: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
        hivis: { DEFAULT: '#16A34A', dark: '#22C55E' },
        brand: {
          50: '#E3F5EA',
          100: '#C7EBD5',
          200: '#94D9AE',
          300: '#5EC384',
          400: '#34AC61',
          500: '#16A34A',
          600: '#15803D',
          700: '#116430',
          800: '#0E4F26',
          900: '#0A3B1D',
          950: '#052210',
        },
      },
    },
  },
  plugins: [],
}
