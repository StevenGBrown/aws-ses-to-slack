module.exports = {
  root: true,
  env: {
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2019,
  },
  extends: [
    'eslint:recommended',
    'plugin:n/recommended',
    'plugin:prettier/recommended',
  ],
}
