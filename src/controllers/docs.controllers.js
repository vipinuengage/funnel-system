import fs from "fs";
import path from "path";
import { marked } from "marked";

const docsController = (req, res) => {
    const filePath = path.join(process.cwd(), "docs", "readme.md");

    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) return res.status(500).send("Documentation not found");

        const html = `
            <html>
                <head>
                    <title>uEngage Funnel Documentation</title>
                    <style>
                    /* ----- BASE LAYOUT ----- */
                    body {
                        background: #0d1117;
                        color: #c9d1d9;
                        font-family: "Inter", Arial, sans-serif;
                        padding: 32px;
                        max-width: 900px;
                        margin: auto;
                        line-height: 1.6;
                    }

                    h1, h2, h3, h4, h5, h6 {
                        color: #ffffff;
                        margin-top: 32px;
                        margin-bottom: 12px;
                        border-bottom: 1px solid #30363d;
                        padding-bottom: 4px;
                    }

                    a {
                        color: #58a6ff;
                        text-decoration: none;
                    }

                    a:hover {
                        text-decoration: underline;
                    }

                    /* ----- CODE BLOCKS ----- */
                    pre {
                        background: #161b22;
                        border: 1px solid #30363d;
                        padding: 16px;
                        border-radius: 8px;
                        overflow-x: auto;
                        font-size: 14px;
                    }

                    code {
                        background: #21262d;
                        border: 1px solid #30363d;
                        padding: 3px 6px;
                        border-radius: 6px;
                        font-family: "JetBrains Mono", monospace;
                        color: #f0f6fc;
                        font-size: 14px;
                    }

                    /* Inline code inside pre should not double-style */
                    pre code {
                        background: none;
                        border: none;
                        padding: 0;
                    }

                    /* Lists */
                    ul, ol {
                        padding-left: 22px;
                        margin-bottom: 14px;
                    }

                    /* Tables */
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    th, td {
                        border: 1px solid #30363d;
                        padding: 8px 12px;
                    }
                    th {
                        background: #161b22;
                    }
                    </style>
                </head>

                <body>${marked(data)}</body>
            </html>
        `;

        res.send(html);
    });
}

export { docsController }