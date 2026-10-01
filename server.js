/**
 * A&C SOLUTIONS PVT. LTD. — COMPLETE BACKEND ENTRYPOINT
 * Bootstraps MongoDB, REST APIs, Authentication, Auditing & Corporate Web Services
 */

require('dotenv').config();
const { startServer } = require('./src/server');

startServer();

