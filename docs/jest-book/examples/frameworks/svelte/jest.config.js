export default {
  rootDir: '.',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { customExportConditions: ['browser'] },
  moduleFileExtensions: ['js', 'svelte'],
  extensionsToTreatAsEsm: ['.svelte'],
  transform: { '^.+\\.svelte$': 'svelte-jester' },
};
