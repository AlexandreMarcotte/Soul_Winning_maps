/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#FAFAFA',
        panel: '#FFFFFF',
        ink: '#1F2937',
        muted: '#6B7280',
        accent: '#2563EB',
        success: '#16A34A',
      },
      boxShadow: {
        panel: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};
