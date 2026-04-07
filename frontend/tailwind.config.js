/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        mist: '#e2e8f0',
        paper: '#f8fafc',
        slateblue: '#1d3557',
        ember: '#b45309',
        tide: '#0f766e',
      },
      fontFamily: {
        display: ['"Sora"', 'ui-sans-serif', 'system-ui'],
        body: ['"Public Sans"', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        panel: '0 14px 40px rgba(15, 23, 42, 0.14)',
      },
      backgroundImage: {
        shell: 'radial-gradient(circle at 20% 10%, rgba(180,83,9,0.17), transparent 30%), radial-gradient(circle at 80% 90%, rgba(15,118,110,0.16), transparent 35%), linear-gradient(180deg,#0b1220,#17273f)',
      },
    },
  },
  plugins: [],
};
