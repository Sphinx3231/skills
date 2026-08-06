// Jest can't parse CSS — global.css is a web-only font/variable stylesheet
// with no runtime behavior to test, so importing it is a no-op under test.
module.exports = {};
