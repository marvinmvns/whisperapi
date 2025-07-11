const fs = require('fs');
const path = require('path');

beforeAll(() => {
  const testDirs = ['./test-uploads', './test-temp'];
  testDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});

afterAll(() => {
  const testDirs = ['./test-uploads', './test-temp'];
  testDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});