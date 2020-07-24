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
                // private.#methods - buggy so far
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
              name: `worker${fileNamePostfix}.js`,
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
            // This allows for better debugging (less places where you can't set a breakpoint) while
            // costing not so much size.
            compress: {
              // + 0.3% to file size
              sequences: false,
              // + 1% to file size
              conditionals: false,
            },
            output: {
              // Otherwise messes with \x01 \x02 \x03 \x04.
              ascii_only: true,
              beautify: env.MODE === 'development',
            },
            mangle: env.MODE === 'production' && {
              // Copypasted from .eslintrc.js's preferredTypes -JQuery -Node +cd
              reserved: [
                'Comment',
                'CommentSkeleton',
                'CommentForm',
                'Element',
                'Page',
                'Parser',
                'Section',
                'User',
                'cd',
              ],
            },
          },
          extractComments: false,
          sourceMap: env.MODE !== 'local',
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
      new webpack.SourceMapDevToolPlugin({
        filename: '[file].map.js',
        append: '\n//# sourceMappingURL=https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/[url]&action=raw&ctype=text/javascript'
      }),
    ],
  };
};
