const path = require('path');
const webpack = require('webpack');

const TerserPlugin = require('terser-webpack-plugin');
const WebpackBuildNotifierPlugin = require('webpack-build-notifier');

module.exports = (env = { MODE: 'development' }) => {
  const lang = process.env.npm_config_lang || 'ru';
  const project = process.env.npm_config_project || 'w';
  const test = Boolean(process.env.npm_config_test) || false;
  const interlanguageWikis = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'];
  const fullCode = interlanguageWikis.includes(project) ? `${project}-${lang}` : project;

  let fileNamePostfix = '';
  if (env.MODE === 'local') {
    fileNamePostfix = `-local-${fullCode}`;
  } else if (test) {
    fileNamePostfix = '-test';
  }

  return {
    mode: 'production',
    entry: './src/js/app.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: `convenientDiscussions${fileNamePostfix}.js`,
    },
    devtool: env.MODE === 'local' ? 'eval' : false,
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    targets: '> 1%, not IE 11',
                  },
                ],
              ],
              plugins: [
                // private.#fields
                '@babel/plugin-proposal-class-properties',
                // private.#methods
                // '@babel/plugin-proposal-private-methods',
                '@babel/plugin-transform-runtime',
                '@babel/plugin-transform-async-to-generator',
              ]
            }
          }
        },
        {
          test: /\.(less|css)$/,
          use: ['style-loader', 'css-loader', 'less-loader'],
        },
        {
          test: /worker\.js$/,
          use: {
            loader: 'worker-loader',
            options: {
              inline: true,
              fallback: false,
            },
          },
        }
      ]
    },
    watch: env.MODE === 'local',
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            output: {
              // Otherwise messes with \x01 \x02 \x03 \x04.
              ascii_only: true,
              beautify: env.MODE !== 'local',
            },
            mangle: env.MODE === 'production',
          },
          extractComments: false,
        }),
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        IS_LOCAL: env.MODE === 'local',
        CONFIG_FILE_NAME: JSON.stringify(fullCode),
        LANG_FILE_NAME: JSON.stringify(lang + '.json'),
        IS_TEST: test,
      }),
      new WebpackBuildNotifierPlugin({
        suppressSuccess: true,
        suppressWarning: true,
      }),
    ],
  };
};
