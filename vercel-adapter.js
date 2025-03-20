module.exports = (req, res) => {
    // Forward to the exported handler
    require('./dist/index.js').default(req, res);
  };