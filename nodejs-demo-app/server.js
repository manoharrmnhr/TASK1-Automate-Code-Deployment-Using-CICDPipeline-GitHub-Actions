const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Hello from the Node.js CI/CD demo app!',
    version: '1.0.0',
  });
});

// Used by Docker HEALTHCHECK and load balancer/uptime checks
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Only start listening when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
