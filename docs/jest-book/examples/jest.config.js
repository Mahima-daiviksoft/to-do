/** @type {import('jest').Config} */
const shared = {
  clearMocks: true,
  restoreMocks: true,
  transform: { '\\.[mc]?[jt]sx?$': 'babel-jest' },
};

module.exports = {
  projects: [
    { ...shared, displayName: 'core', testEnvironment: 'node', testMatch: ['<rootDir>/core/**/*.test.js'] },
    {
      ...shared,
      displayName: 'react',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/react/**/*.test.jsx'],
      setupFilesAfterEnv: ['<rootDir>/react/jest.setup.js'],
    },
    {
      ...shared,
      displayName: 'node-api',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/node-api/**/*.test.js'],
      // MSW 2.x depends on a few ESM-only packages (Chapter 18 §18.3)
      transformIgnorePatterns: ['/node_modules/(?!(rettime|until-async|@open-draft/deferred-promise)/)'],
    },
  ],
};
