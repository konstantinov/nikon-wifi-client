module.exports = {
    'env': {
        'es2021': true,
        'node': true
    },
    'plugins': [ 'babel' ],
    'parser': 'babel-eslint',
    'ignorePatterns': [ 'test.js' ],
    'extends': 'eslint:recommended',
    'parserOptions': {
        'ecmaVersion': 12,
        'sourceType': 'module'
    },
    'rules': {
        'space-before-function-paren': ['error', 'never'],
        'indent': [
            'error',
            4
        ],
        'linebreak-style': [
            'error',
            'unix'
        ],
        'quotes': [
            'error',
            'single'
        ],
        'semi': [
            'error',
            'always'
        ]
    }
};
