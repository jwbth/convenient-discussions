const path = require('path');

const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const WebpackBuildNotifierPlugin = require('webpack-build-notifier');
const argv = require('yargs').argv;
require('json5/lib/register.js');

const config = require('./config.json5');

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

if (!config.protocol || !config.server || !config.rootPath || !config.articlePath) {
  throw new Error('No protocol/server/root path/article path found in config.json5.');
}

const wikiUrlencode = (s) => (
  encodeURIComponent(s)
    .replace(/'/g,'%27')
    .replace(/%20/g,'_')
    .replace(/%3B/g,';')
    .replace(/%40/g,'@')
    .replace(/%24/g,'$')
    .replace(/%2C/g,',')
    .replace(/%2F/g,'/')
    .replace(/%3A/g,':')
);

const pathname = wikiUrlencode(config.articlePath.replace('$1', config.rootPath));
const rootUrl = `${config.protocol}://${config.server}${pathname}`;

module.exports = {
  mode: snippet ? 'development' : 'production',
  entry: './src/js/app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: `convenientDiscussions${fileNamePostfix}.js`,
  },
  performance: {
    hints: false,
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
            name: `convenientDiscussions-worker${fileNamePostfix}.js`,
            inline: true,
            fallback: false,
          },
        },
      }
    ]
  },
  watch: snippet,
  optimization: {
    concatenateModules: true,
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
        extractComments: !dev && {
          filename: (filename) => `${filename}.LICENSE`,
          banner: (licenseFile) => `For license information please see ${rootUrl}${licenseFile}`,
        },
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
    snippet ?
      undefined :
      new webpack.SourceMapDevToolPlugin({
        filename: '[file].map.json',
        append: '\n//# sourceMappingURL=https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/[url]&action=raw&ctype=application/json'
      }),
  ].filter((el) => el !== undefined),
};
