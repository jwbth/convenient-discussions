const fs = require('fs');
const path = require('path');

const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const WebpackBuildNotifierPlugin = require('webpack-build-notifier');
const BannerWebpackPlugin = require('banner-webpack-plugin');
const argv = require('yargs').argv;
require('json5/lib/register.js');

const config = require('./config.json5');
const getUrl = require('./misc/util.js').getUrl;

const lang = process.env.npm_config_lang || 'ru';
const project = process.env.npm_config_project || 'w';
const snippet = Boolean(argv.snippet || process.env.npm_config_snippet);
const dev = Boolean(process.env.npm_config_dev);

const interlanguageWikis = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'];
const fullCode = interlanguageWikis.includes(project) ? `${project}-${lang}` : project;

let filenamePostfix = '';
if (snippet) {
  filenamePostfix = `-snippet-${fullCode}`;
} else if (dev) {
  filenamePostfix = '-dev';
}
const filename = `convenientDiscussions${filenamePostfix}.js`;
const sourceMapExt = '.map.json';

if (!config.protocol || !config.server || !config.rootPath || !config.articlePath) {
  throw new Error('No protocol/server/root path/article path found in config.json5.');
}

const progressPlugin = new webpack.ProgressPlugin();

const plugins = [
  new webpack.DefinePlugin({
    IS_SNIPPET: snippet,
    CONFIG_FILE_NAME: JSON.stringify(fullCode),
    LANG_CODE: JSON.stringify(lang),
    IS_DEV: dev,
  }),
  new WebpackBuildNotifierPlugin({
    suppressSuccess: true,
    suppressWarning: true,
  }),
];

if (snippet) {
  plugins.push(progressPlugin);
} else {
  plugins.push(
    new webpack.SourceMapDevToolPlugin({
      filename: `[file]${sourceMapExt}`,
      append: '\n//# sourceMappingURL=https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/[url]&action=raw&ctype=application/json',
    }),
    new webpack.BannerPlugin({
      banner: '<nowiki>',
      test: filename,
    }),

    // We can't use BannerWebpackPlugin for both the code to prepend and append, because if we add
    // the code to prepend with BannerWebpackPlugin, the source maps would break.
    // `webpack.BannerPlugin`, on the other hand, handles this, but doesn't have an option for the
    // code to append to the build (this code doesn't break the source maps).
    new BannerWebpackPlugin({
      chunks: {
        main: {
          afterContent: '\n/*! </nowiki> */',
        },
      },
    }),

    // Fix the exposal of an absolute path in the source map by worker-loader
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('AfterEmitPlugin', () => {
          const sourceMapFilename = `./dist/${filename}${sourceMapExt}`;
          const content = fs.readFileSync(sourceMapFilename).toString();
          const newContent = content.replace(
            /(require\(\\"!!)[^"]+[^.\\/]([\\/]+node_modules[\\/]+worker-loader)/g,
            (s, before, end) => `${before}.${end}`,
          );
          fs.writeFileSync(sourceMapFilename, newContent);
        });
      },
    },
  );
  if (!process.env.CI) {
    plugins.push(progressPlugin);
  }
}

module.exports = {
  mode: snippet ? 'development' : 'production',
  entry: './src/js/app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename,
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
            ],
          },
        },
      },
      {
        test: /\.less$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              plugins: [
                require('cssnano')(),
              ],
            },
          },
          'less-loader',
        ],
      },
      {
        test: /\bworker-gate\.js$/,
        use: {
          loader: 'worker-loader',
          options: {
            name: `convenientDiscussions-worker${filenamePostfix}.js`,
            inline: true,
            fallback: false,
          },
        },
      },
    ],
  },
  watch: snippet,
  optimization: {
    concatenateModules: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          // This provides better debugging (less places where you can't set a breakpoint) while
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

            comments: /^\**!/,
          },
          mangle: {
            keep_classnames: true,
            reserved: ['cd'],
          },
        },
        extractComments: {
          // Removed "\**!|" at the beginning not to extract the <nowiki> comment
          condition: /@preserve|@license|@cc_on/i,

          filename: (filename) => `${filename}.LICENSE.js`,
          banner: (licenseFile) => `For license information please see ${getUrl(config.rootPath + licenseFile)}`,
        },
        sourceMap: true,
      }),
    ],
  },
  plugins,
};
