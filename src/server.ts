import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'trentino-quest-backend',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.info(`Trentino Quest backend listening on port ${PORT}`);
});
