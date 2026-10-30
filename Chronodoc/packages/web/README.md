# DOCFLOW 🚀

**Intelligent Documentation That Evolves With Your Code.**

DOCFLOW is a premium, AI-powered documentation platform designed for modern development teams. It automates the entire documentation lifecycle—from deep static analysis of your source code to generating high-quality, synchronized documentation using Google Gemini.

![DOCFLOW Landing Page](public/hero-preview.png)

## ✨ Features

- 🔍 **Static Code Analysis**: Automatically extracts functions, classes, imports, and complexity metrics from your codebase with zero configuration.
- 🤖 **AI-Powered Documentation**: Leverages Google Gemini to generate comprehensive overviews, function documentation, edge cases, and architectural insights.
- 🔄 **Change Intelligence**: Detects code changes, maps dependency ripples, and selectively regenerates only the affected documentation to keep it perfectly in sync.
- 📊 **Dependency Graph**: Visualize module relationships, identify central components, and detect orphan files across your project.
- 💬 **NLP Explanations**: Get documentation tailored to your audience—whether you need a beginner-friendly overview or a senior-level technical deep dive.
- 📦 **One-Click Export**: Export your documentation as perfectly formatted Markdown for READMEs, Wikis, or onboarding guides.

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + Custom Vanilla CSS
- **3D Graphics**: [Spline](https://spline.design/) for interactive hero experiences
- **Backend/Auth**: [Supabase](https://supabase.com/)
- **AI Engine**: [Google Gemini Pro](https://deepmind.google/technologies/gemini/)
- **Icons**: [Boxicons](https://boxicons.com/)

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Supabase project

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/docflow.git
   cd docflow
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to `http://localhost:5173` to see DOCFLOW in action.

## 🌐 Deployment

DOCFLOW is optimized for deployment on **Vercel**. 

**Important**: When deploying, make sure to add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the **Environment Variables** section in your Vercel project settings.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ by [Dhyan Kannoth](https://github.com/Dhyankannoth)
