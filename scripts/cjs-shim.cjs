// CJS shim for bundled server code
// This provides __filename and __dirname that esbuild might need
const path = require('path');

// Export dummy values that will be overridden by the actual module context
module.exports = {
  __filename: __filename,
  __dirname: __dirname
};
