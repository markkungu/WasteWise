require('dotenv').config();

const morgan = require('morgan');
const { initSchema } = require('./db');
const blockchain = require('./blockchain');
const app = require('./app');

app.use(morgan('dev'));

const PORT = parseInt(process.env.PORT) || 5000;

(async () => {
  await initSchema();
  await blockchain.init();
  app.listen(PORT, () => {
    console.log(`\n✓ WasteWise API running on http://localhost:${PORT}`);
    console.log(`  Health:      GET  http://localhost:${PORT}/health`);
    console.log(`  Auth:        POST http://localhost:${PORT}/api/auth/register`);
    console.log(`  Submissions: POST http://localhost:${PORT}/api/submissions`);
    console.log(`  Rewards:     GET  http://localhost:${PORT}/api/rewards`);
    console.log(`  Routes:      GET  http://localhost:${PORT}/api/routes/latest`);
    console.log(`  Analytics:   GET  http://localhost:${PORT}/api/analytics/dashboard\n`);
  });
})();
