/** สีหลักของระบบ: โทนเหล็ก/คอนกรีต + เหลืองป้ายเตือนงานก่อสร้างเป็นสีเน้น */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#1B2430',
        steel: { 50: '#F3F5F7', 100: '#E4E8EC', 300: '#AEB8C2', 500: '#6B7886', 700: '#36414E', 900: '#1B2430' },
        hivis: { DEFAULT: '#F2B705', dark: '#C99600' },
      },
    },
  },
  plugins: [],
}
