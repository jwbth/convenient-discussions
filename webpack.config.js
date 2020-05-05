const path = require('path');
const webpack = require('webpack');

const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env = { MODE: 'development' }) => {
  const lang = process.env.npm_config_lang || 'ru';
  const project = process.env.npm_config_project || 'w';
  const interlanguageWikis = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'];
  const configFileName = interlanguageWikis.includes(project) ? `${project}-${lang}` : project;

  return {
    mode: 'production',
    entry: './src/js/app.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'convenientDiscussions.js',
    },
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
          test: /\.less$/,
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
    watch: env.MODE !== 'production',
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            output: {
              beautify: env.MODE !== 'production',
              // Otherwise messes with \x01 \x02 \x03 \x04.
              ascii_only: true,
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
        CONFIG_FILE_NAME: JSON.stringify(configFileName),
        LANG_FILE_NAME: JSON.stringify(lang),
      }),
    ],
  };
};
