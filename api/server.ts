import app from './app.js';
import wsService from './services/WSService.js';
import { createServer } from 'http';

const PORT = process.env.PORT || 8674;

const server = createServer(app);

wsService.init(server);

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
