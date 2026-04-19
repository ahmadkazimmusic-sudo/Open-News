# 🌐 Open News: AI-Powered Global Intelligence

Open News is a premium, open-source AI search engine designed to transform how we consume global news. By leveraging advanced analytical AI and real-time web context, it delivers deep-dive, structured reports that go beyond surface-level headlines.

![Open News Interface Preview](https://github.com/ahmadkazimmusic-sudo/Open-News/raw/main/public/preview.png)

**Live Demo**: [0pennews.vercel.app](https://0pennews.vercel.app)

## ✨ Key Features

-   **🔍 Live Intelligence**: Integrates real-time data from trusted global sources (Reuters, BBC, Al Jazeera, Bloomberg, etc.) via the Tavily Search API.
-   **📰 Structured Briefs**: Generates comprehensive news reports with Background, Key Developments, Analysis, and Outlook sections.
-   **📊 Data Visualizations**: Automatically renders interactive charts (via Recharts) for topics involving numerical data and distributions.
-   **🎭 Bias & Sentiment Analysis**: Provides visual indicators for news sentiment and political bias ratings to help identify framing and perspective.
-   **🌍 Polyglot Support**: Instant translation and reporting in English, Spanish, French, German, Japanese, and Arabic.
-   **📸 Snapshot Sharing**: One-click export of news briefs to high-fidelity PNG images for social sharing.
-   **🌓 Premium UI**: A sleek, modern interface with native Dark/Light mode support and smooth micro-animations.
-   **💾 Local History**: Securely stores your search history in your browser for quick reference.

## 🚀 Tech Stack

-   **Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
-   **AI Infrastructure**: [OpenAI SDK](https://github.com/openai/openai-node) (routing through [Hugging Face](https://huggingface.co/))
-   **Search Engine**: [Tavily AI](https://tavily.com/)
-   **Visualization**: [Recharts](https://recharts.org/)
-   **Markdown Rendering**: [react-markdown](https://github.com/remarkjs/react-markdown)
-   **Icons & Assets**: [Lucide React](https://lucide.dev/), [html-to-image](https://github.com/tsayen/html-to-image)

## 🛠️ Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   npm or yarn

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/ahmadkazimmusic-sudo/Open-News.git
    cd Open-News
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory and add your API keys:
    ```env
    VITE_HF_TOKEN=your_hugging_face_token
    VITE_TAVILY_API_KEY=your_tavily_api_key
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## 🔐 Environment Variables

To run this project, you will need to add the following environment variables to your `.env` file:

| Variable | Description | Source |
| :--- | :--- | :--- |
| `VITE_HF_TOKEN` | Hugging Face Access Token for LLM access. | [Hugging Face Settings](https://huggingface.co/settings/tokens) |
| `VITE_TAVILY_API_KEY` | API Key for web search capabilities. | [Tavily Dashboard](https://tavily.com/) |

## 🤝 Contributing

We welcome contributions! Whether it's a bug fix, feature request, or UI improvement, please feel free to:

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the PolyForm Noncommercial License 1.0.0. See `LICENSE` for more information.

---

Built with ❤️ by the Open News Community.
