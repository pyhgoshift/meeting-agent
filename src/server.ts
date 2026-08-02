import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

export function startServer(port: number = 3000) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const WATCH_DIR = process.env.WATCH_DIR ?? './recordings';

  // Helper to read file safely
  const readFileSafe = (filename: string) => {
    const filepath = path.join(WATCH_DIR, filename);
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf-8');
    }
    return '';
  };

  // Helper to write file safely
  const writeFileSafe = (filename: string, content: string) => {
    if (!fs.existsSync(WATCH_DIR)) {
      fs.mkdirSync(WATCH_DIR, { recursive: true });
    }
    const filepath = path.join(WATCH_DIR, filename);
    fs.writeFileSync(filepath, content, 'utf-8');
  };

  // API to get all configs
  app.get('/api/config', (req, res) => {
    try {
      const prompt = readFileSafe('meetingbot_prompt.txt');
      const slackTemplate = readFileSafe('slack_template.txt');
      const env = readFileSafe('.env');

      res.json({
        success: true,
        data: {
          prompt,
          slackTemplate,
          env
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // API to save configs
  app.post('/api/config', (req, res) => {
    try {
      const { prompt, slackTemplate, env } = req.body;

      if (prompt !== undefined) writeFileSafe('meetingbot_prompt.txt', prompt);
      if (slackTemplate !== undefined) writeFileSafe('slack_template.txt', slackTemplate);
      if (env !== undefined) writeFileSafe('.env', env);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Serve static files from React build
  const uiPath = path.join(process.cwd(), 'dashboard', 'dist');
  if (fs.existsSync(uiPath)) {
    app.use(express.static(uiPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(uiPath, 'index.html'));
    });
  } else {
    app.get('*', (req, res) => {
      res.send('Dashboard UI is not built. Please run npm run build in dashboard folder.');
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 [Dashboard] Web UI is running on port ${port}`);
    console.log(`   (Access this via http://<NAS_IP>:${port})`);
  });
}
