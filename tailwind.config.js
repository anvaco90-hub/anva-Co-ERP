/** สีหลักของระบบ: โทนเหล็ก/คอนกรีต + เหลืองป้ายเตือนงานก่อสร้างเป็นสีเน้น */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#1B2430',
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
        hivis: { DEFAULT: '#F2B705', dark: '#C99600' },
      },
    },
  },
  plugins: [],
}
