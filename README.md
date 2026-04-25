<p align="center">
  <img src="https://github.com/Dattebayoolo/Open-News/raw/main/public/preview.png" alt="Open News Interface Preview" width="850" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
</p>

<h1 align="center">🌐 Open News</h1>
<p align="center">
  <strong>AI-Powered Global Intelligence</strong>
</p>

<p align="center">
  <a href="https://0pennews.vercel.app"><strong>Live Demo</strong></a> · 
  <a href="#-getting-started"><strong>Quick Start</strong></a> · 
  <a href="#-tech-stack"><strong>Tech Stack</strong></a>
</p>

---

Open News is a premium, open-source AI search engine designed to transform how we consume global news. By leveraging advanced analytical AI and real-time web context, it delivers deep-dive, structured reports that go beyond surface-level headlines.

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **🔍 Live Intelligence** | Integrates real-time data from trusted global sources (Reuters, BBC, Al Jazeera, Bloomberg, etc.) via the Tavily Search API. |
| **📰 Structured Briefs** | Generates comprehensive news reports with Background, Key Developments, Analysis, and Outlook sections. |
| **📊 Data Visualizations** | Automatically renders interactive charts (via Recharts) for topics involving numerical data and distributions. |
| **🎭 Bias & Sentiment Analysis** | Provides visual indicators for news sentiment and political bias ratings to help identify framing and perspective. |
| **🌍 Polyglot Support** | Instant translation and reporting in English, Spanish, French, German, Japanese, and Arabic. |
| **📸 Snapshot Sharing** | One-click export of news briefs to high-fidelity PNG images for social sharing. |
| **🌓 Premium UI** | A sleek, modern interface with native Dark/Light mode support and smooth micro-animations. |
| **💾 Local History** | Securely stores your search history in your browser for quick reference. |

## 🚀 Tech Stack

- **Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **AI Infrastructure**: [OpenAI SDK](https://github.com/openai/openai-node) (routing through [OpenRouter](https://openrouter.ai/))
- **Search Engine**: [Tavily AI](https://tavily.com/)
- **Visualization**: [Recharts](https://recharts.org/)
- **Markdown Rendering**: [react-markdown](https://github.com/remarkjs/react-markdown)
- **Icons & Assets**: [Lucide React](https://lucide.dev/), [html-to-image](https://github.com/tsayen/html-to-image)

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Dattebayoolo/Open-News.git
cd Open-News

# 2. Install dependencies
npm install

# 3. Configure Environment Variables (.env)
# VITE_OPENROUTER_API_KEY=your_openrouter_api_key
# VITE_TAVILY_API_KEY=your_tavily_api_key

# 4. Run Development Server
npm run dev
```

## 🔐 Environment Variables

| Variable | Description | Source |
| :--- | :--- | :--- |
| `VITE_OPENROUTER_API_KEY` | OpenRouter API key for LLM access (uses the `openrouter/free` endpoint by default). | [OpenRouter Keys](https://openrouter.ai/keys) |
| `VITE_TAVILY_API_KEY` | API Key for web search capabilities. | [Tavily Dashboard](https://tavily.com/) |

### ⚠️ API Key Security

- **Never commit your `.env` file.** It is already listed in `.gitignore` by default.
- **Rotate keys regularly.** If you suspect a key has been exposed, revoke it immediately from the provider dashboard and generate a new one.
- **Avoid hardcoding keys** in source files, test scripts, or client-side bundles outside of Vite's `import.meta.env` pattern.
- **`test-openrouter.js`** is a standalone development/testing script that contains a hardcoded key example. It is **excluded from production** (ignored in `.gitignore` and removed from Git tracking). Do not use it in deployed environments.

## 🤝 Contributing

We welcome contributions! Whether it's a bug fix, feature request, or UI improvement:
1. **Fork** the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a **Pull Request**

## 📄 License & Credits

Distributed under the PolyForm Noncommercial License 1.0.0. See `LICENSE` for more information.

> Built with ❤️ by the Open News Community.
