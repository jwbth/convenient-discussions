const path = require('path');

const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const WebpackBuildNotifierPlugin = require('webpack-build-notifier');
const argv = require('yargs').argv;

const lang = process.env.npm_config_lang || 'ru';
const project = process.env.npm_config_project || 'w';
const snippet = Boolean(argv.snippet || process.env.npm_config_snippet);
const dev = Boolean(process.env.npm_config_dev);
const interlanguageWikis = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'];
const fullCode = interlanguageWikis.includes(project) ? `${project}-${lang}` : project;

let fileNamePostfix = '';
if (snippet) {
  fileNamePostfix = `-snippet-${fullCode}`;
} else if (dev) {
  fileNamePostfix = '-dev';
}

module.exports = {
  mode: 'production',
  entry: './src/js/app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: `convenientDiscussions${fileNamePostfix}.js`,
  },
  devtool: snippet ? 'eval' : false,
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
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
  watch: snippet,
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
          },
          mangle: !snippet && {
            keep_classnames: true,
            reserved: ['cd'],
          },
        },
        extractComments: false,
        sourceMap: !snippet,
      }),
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      IS_SNIPPET: snippet,
      CONFIG_FILE_NAME: JSON.stringify(fullCode),
      LANG_FILE_NAME: JSON.stringify(lang + '.json'),
      IS_DEV: dev,
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
