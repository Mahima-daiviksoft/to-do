module.exports = {
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { customExportConditions: ['node', 'node-addons'] },
  moduleFileExtensions: ['js', 'json', 'vue'],
  transform: { '^.+\\.vue$': '@vue/vue3-jest', '^.+\\.js$': 'babel-jest' },
};
